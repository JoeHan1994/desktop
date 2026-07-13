//! Remote machine profile and Hyper-V VM credential commands.
//!
//! 命令层是薄包装层；数据访问逻辑封装在私有 repository 函数中。
//! Legacy 迁移逻辑复用同一个辅助函数 `run_legacy_import`，消除重复。

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use chrono::{DateTime, Utc};
use mysql::prelude::Queryable;
use mysql::{Pool, Row};

use crate::db::DbState;
use crate::domain::remote_profile::{HyperVVmCredentialProfile, RemoteMachineProfile};
use crate::error::{AppError, Result as AppResult};
use crate::mysql_profiles::{
    ensure_hyperv_vm_credentials_schema, ensure_schema, MySqlProfileState,
};

// ── Constants ─────────────────────────────────────────────────────────────

const LEGACY_PROFILES_KEY: &str      = "remote.machine.profiles.v1";
const LEGACY_PROFILES_FLAG: &str     = "remote.machine.profiles.mysql.imported.v1";
const LEGACY_VM_CREDS_KEY: &str      = "remote.hyperv.vm.credentials.v1";
const LEGACY_VM_CREDS_FLAG: &str     = "remote.hyperv.vm.credentials.mysql.imported.v1";
const MAX_REMOTE_PROFILES: i64       = 12;
const MAX_VM_CREDENTIALS: i64        = 80;

// ── Request DTOs ──────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertRemoteMachineProfileRequest {
    pub profile: RemoteMachineProfile,
    pub previous_profile_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertHyperVVmCredentialRequest {
    pub credential: HyperVVmCredentialProfile,
}

// ── mysql.toml 用户凭据配置 ────────────────────────────────────────────────

const MYSQL_PASSWORD_PLACEHOLDER: &str = "REPLACE_WITH_MYSQL_PASSWORD";
const MYSQL_KEY_PLACEHOLDER: &str = "REPLACE_WITH_32_BYTE_BASE64_KEY";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlUserConfig {
    pub username: String,
    pub password: String,
    pub encryption_key_base64: String,
}

/// 读取 `mysql.toml` 中的 username / password / encryption_key_base64。
///
/// 占位符会被视为空字符串，方便前端提示手动填写。
#[tauri::command]
pub fn get_mysql_user_config(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<MysqlUserConfig, String> {
    let path = &mysql.config_path;
    let content = std::fs::read_to_string(path)
        .map_err(|err| format!("无法读取 MySQL 配置文件：{}；{}", path.display(), err))?;

    let username = read_toml_string_field(&content, "username").unwrap_or_default();
    let mut password = read_toml_string_field(&content, "password").unwrap_or_default();
    if password == MYSQL_PASSWORD_PLACEHOLDER {
        password.clear();
    }
    let mut key = read_toml_string_field(&content, "encryption_key_base64").unwrap_or_default();
    if key == MYSQL_KEY_PLACEHOLDER {
        key.clear();
    }

    Ok(MysqlUserConfig {
        username: if username.is_empty() {
            "root".to_string()
        } else {
            username
        },
        password,
        encryption_key_base64: key,
    })
}

/// 更新 `mysql.toml` 中的 username / password / encryption_key_base64，
/// 保留文件中的其余字段与注释。
#[tauri::command]
pub fn update_mysql_user_config(
    mysql: tauri::State<'_, MySqlProfileState>,
    username: String,
    password: String,
    encryption_key_base64: String,
) -> Result<(), String> {
    let username = {
        let trimmed = username.trim();
        if trimmed.is_empty() {
            "root".to_string()
        } else {
            trimmed.to_string()
        }
    };
    let password = password.trim().to_string();
    let key = encryption_key_base64.trim().to_string();

    if password.is_empty() {
        return Err("请填写 MySQL 密码".to_string());
    }
    if key.is_empty() {
        return Err("请填写 encryption_key_base64".to_string());
    }

    // 校验加密密钥必须是解码后 32 字节的 Base64，避免写入无效配置。
    let key_bytes = BASE64
        .decode(&key)
        .map_err(|_| "encryption_key_base64 不是有效的 Base64".to_string())?;
    if key_bytes.len() != 32 {
        return Err(format!(
            "encryption_key_base64 解码后必须是 32 字节，当前为 {} 字节",
            key_bytes.len()
        ));
    }

    let path = &mysql.config_path;
    let content = std::fs::read_to_string(path)
        .map_err(|err| format!("无法读取 MySQL 配置文件：{}；{}", path.display(), err))?;

    let content = write_toml_string_field(&content, "username", &username);
    let content = write_toml_string_field(&content, "password", &password);
    let content = write_toml_string_field(&content, "encryption_key_base64", &key);

    std::fs::write(path, content)
        .map_err(|err| format!("无法写入 MySQL 配置文件：{}；{}", path.display(), err))?;
    Ok(())
}

/// 判断某行是否为指定键的 TOML 赋值（`key = ...`），忽略前导空白与注释。
fn line_is_key_assignment(line: &str, key: &str) -> bool {
    let trimmed = line.trim_start();
    if trimmed.starts_with('#') || !trimmed.starts_with(key) {
        return false;
    }
    let after = trimmed[key.len()..].trim_start();
    after.starts_with('=')
}

/// 读取 TOML 基本字符串字段的值（去除引号与转义）。
fn read_toml_string_field(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        if !line_is_key_assignment(line, key) {
            continue;
        }
        let after = line.trim_start();
        let value_part = after[after.find('=')? + 1..].trim();
        let unquoted = value_part
            .strip_prefix('"')
            .and_then(|rest| rest.strip_suffix('"'))
            .unwrap_or(value_part);
        return Some(unquoted.replace("\\\"", "\"").replace("\\\\", "\\"));
    }
    None
}

/// 写入（或追加）TOML 基本字符串字段，保留其它行不变。
fn write_toml_string_field(content: &str, key: &str, value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    let new_line = format!("{key} = \"{escaped}\"");

    let mut replaced = false;
    let mut out_lines: Vec<String> = Vec::new();
    for line in content.lines() {
        if !replaced && line_is_key_assignment(line, key) {
            out_lines.push(new_line.clone());
            replaced = true;
        } else {
            out_lines.push(line.to_string());
        }
    }
    if !replaced {
        out_lines.push(new_line);
    }

    let mut result = out_lines.join("\n");
    if content.ends_with('\n') {
        result.push('\n');
    }
    result
}

// ── Remote Machine Profile Commands ──────────────────────────────────────

#[tauri::command]
pub fn list_remote_machine_profiles(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_schema(pool).map_err(|e| e.to_string())?;
    ProfileRepo::new(pool, &mysql).list().map_err(Into::into)
}

#[tauri::command]
pub fn upsert_remote_machine_profile(
    mysql: tauri::State<'_, MySqlProfileState>,
    request: UpsertRemoteMachineProfileRequest,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_schema(pool).map_err(|e| e.to_string())?;
    let repo = ProfileRepo::new(pool, &mysql);
    repo.ensure_host_available(&request.profile, request.previous_profile_id.as_deref())
        .map_err(|e| e.to_string())?;
    if let Some(prev_id) = request.previous_profile_id.as_deref() {
        if prev_id != request.profile.id {
            repo.delete(prev_id).map_err(|e| e.to_string())?;
        }
    }
    repo.upsert(&request.profile).map_err(|e| e.to_string())?;
    repo.list().map_err(Into::into)
}

#[tauri::command]
pub fn delete_remote_machine_profile(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_schema(pool).map_err(|e| e.to_string())?;
    let repo = ProfileRepo::new(pool, &mysql);
    repo.delete(&id).map_err(|e| e.to_string())?;
    repo.list().map_err(Into::into)
}

#[tauri::command]
pub fn import_legacy_remote_machine_profiles(
    db: tauri::State<'_, DbState>,
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_schema(pool).map_err(|e| e.to_string())?;
    let repo = ProfileRepo::new(pool, &mysql);

    run_legacy_import(
        &db,
        LEGACY_PROFILES_FLAG,
        LEGACY_PROFILES_KEY,
        |raw| {
            let profiles: Vec<RemoteMachineProfile> = serde_json::from_str(raw).unwrap_or_default();
            for p in profiles.iter().take(MAX_REMOTE_PROFILES as usize) {
                repo.upsert(p)?;
            }
            Ok(())
        },
    )
    .map_err(|e| e.to_string())?;

    repo.list().map_err(Into::into)
}

// ── Hyper-V VM Credential Commands ────────────────────────────────────────

#[tauri::command]
pub fn list_hyperv_vm_credentials(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_hyperv_vm_credentials_schema(pool).map_err(|e| e.to_string())?;
    VmCredRepo::new(pool, &mysql).list().map_err(Into::into)
}

#[tauri::command]
pub fn upsert_hyperv_vm_credential(
    mysql: tauri::State<'_, MySqlProfileState>,
    request: UpsertHyperVVmCredentialRequest,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_hyperv_vm_credentials_schema(pool).map_err(|e| e.to_string())?;
    let repo = VmCredRepo::new(pool, &mysql);
    repo.upsert(&request.credential).map_err(|e| e.to_string())?;
    repo.list().map_err(Into::into)
}

#[tauri::command]
pub fn delete_hyperv_vm_credential(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_hyperv_vm_credentials_schema(pool).map_err(|e| e.to_string())?;
    let repo = VmCredRepo::new(pool, &mysql);
    repo.delete(&id).map_err(|e| e.to_string())?;
    repo.list().map_err(Into::into)
}

#[tauri::command]
pub fn delete_hyperv_vm_credentials_by_parent_profile_id(
    mysql: tauri::State<'_, MySqlProfileState>,
    parent_profile_id: String,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_hyperv_vm_credentials_schema(pool).map_err(|e| e.to_string())?;
    let repo = VmCredRepo::new(pool, &mysql);
    repo.delete_by_parent(&parent_profile_id).map_err(|e| e.to_string())?;
    repo.list().map_err(Into::into)
}

#[tauri::command]
pub fn import_legacy_hyperv_vm_credentials(
    db: tauri::State<'_, DbState>,
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_hyperv_vm_credentials_schema(pool).map_err(|e| e.to_string())?;
    let repo = VmCredRepo::new(pool, &mysql);

    run_legacy_import(
        &db,
        LEGACY_VM_CREDS_FLAG,
        LEGACY_VM_CREDS_KEY,
        |raw| {
            let creds: Vec<HyperVVmCredentialProfile> =
                serde_json::from_str(raw).unwrap_or_default();
            for c in creds.iter().take(MAX_VM_CREDENTIALS as usize) {
                repo.upsert(c)?;
            }
            Ok(())
        },
    )
    .map_err(|e| e.to_string())?;

    repo.list().map_err(Into::into)
}

// ── Legacy import helper (DRY) ────────────────────────────────────────────

/// Check the `flag_key` setting; if not set, read `data_key` and call `import_fn`.
/// After `import_fn` succeeds, mark the flag as done.
fn run_legacy_import(
    db: &DbState,
    flag_key: &str,
    data_key: &str,
    import_fn: impl FnOnce(&str) -> AppResult<()>,
) -> AppResult<()> {
    if db.get_setting(flag_key)?.as_deref() == Some("1") {
        return Ok(());
    }
    if let Some(raw) = db.get_setting(data_key)? {
        import_fn(&raw)?;
    }
    db.set_setting(flag_key, "1")?;
    Ok(())
}

// ── RemoteMachineProfile repository ──────────────────────────────────────

struct ProfileRepo<'a> {
    pool: &'a Pool,
    state: &'a MySqlProfileState,
}

impl<'a> ProfileRepo<'a> {
    fn new(pool: &'a Pool, state: &'a MySqlProfileState) -> Self {
        Self { pool, state }
    }

    fn list(&self) -> AppResult<Vec<RemoteMachineProfile>> {
        let mut conn = self.pool.get_conn()?;
        let rows: Vec<Row> = conn.exec(
            r#"SELECT id, label, host, ssh_port, rdp_port, username,
                      COALESCE(password_ciphertext, '') AS password_ciphertext,
                      COALESCE(password_nonce, '')      AS password_nonce,
                      COALESCE(DATE_FORMAT(last_connected_at, '%Y-%m-%dT%H:%i:%s.000Z'), '') AS last_connected_at
               FROM remote_machine_profiles
               ORDER BY last_connected_at IS NULL, last_connected_at DESC, updated_at DESC
               LIMIT ?"#,
            (MAX_REMOTE_PROFILES,),
        )?;
        rows.into_iter()
            .map(|row| {
                let (id, label, host, ssh_port, rdp_port, username, ct, nonce, lca): (
                    String, String, String, u16, u16, String, String, String, String,
                ) = mysql::from_row_opt(row)?;
                let password = self.state.decrypt_password(&ct, &nonce)?;
                Ok(RemoteMachineProfile {
                    id, label, host,
                    port: ssh_port.to_string(),
                    rdp_port: Some(rdp_port.to_string()),
                    username, password,
                    last_connected_at: lca,
                })
            })
            .collect()
    }

    fn upsert(&self, p: &RemoteMachineProfile) -> AppResult<()> {
        let id = p.id.trim();
        let host = p.host.trim();
        let username = p.username.trim();
        if id.is_empty() || host.is_empty() || username.is_empty() {
            return Err(AppError::Validation("远程机器配置缺少 id、host 或 username".into()));
        }
        let label = p.label.trim();
        let ssh_port = parse_port(&p.port, 22)?;
        let rdp_port = parse_port(p.rdp_port.as_deref().unwrap_or("3389"), 3389)?;
        let lca = mysql_datetime(&p.last_connected_at);
        let (ct, nonce) = self.state.encrypt_password(&p.password)?;
        let ct_opt = if ct.is_empty() { None } else { Some(ct) };
        let nonce_opt = if nonce.is_empty() { None } else { Some(nonce) };

        let mut conn = self.pool.get_conn()?;
        conn.exec_drop(
            r#"INSERT INTO remote_machine_profiles
               (id, label, host, ssh_port, rdp_port, username, password_ciphertext, password_nonce, last_connected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                   label = VALUES(label), host = VALUES(host), ssh_port = VALUES(ssh_port),
                   rdp_port = VALUES(rdp_port), username = VALUES(username),
                   password_ciphertext = VALUES(password_ciphertext),
                   password_nonce = VALUES(password_nonce),
                   last_connected_at = VALUES(last_connected_at)"#,
            (id, if label.is_empty() { id } else { label }, host, ssh_port, rdp_port,
             username, ct_opt, nonce_opt, lca),
        )?;
        Ok(())
    }

    fn delete(&self, id: &str) -> AppResult<()> {
        let mut conn = self.pool.get_conn()?;
        conn.exec_drop("DELETE FROM remote_machine_profiles WHERE id = ?", (id,))?;
        Ok(())
    }

    fn ensure_host_available(
        &self,
        profile: &RemoteMachineProfile,
        previous_profile_id: Option<&str>,
    ) -> AppResult<()> {
        let host = profile.host.trim();
        if host.is_empty() {
            return Ok(());
        }
        let current_id = profile.id.trim();
        let previous_id = previous_profile_id.map(str::trim).unwrap_or_default();

        let mut conn = self.pool.get_conn()?;
        let rows: Vec<Row> = conn.exec(
            r#"SELECT id, label, host, ssh_port, username
               FROM remote_machine_profiles WHERE host = ?
               ORDER BY updated_at DESC LIMIT 8"#,
            (host,),
        )?;
        for row in rows {
            let (id, label, existing_host, ssh_port, username): (
                String, String, String, u16, String,
            ) = mysql::from_row_opt(row)?;
            if id == current_id || (!previous_id.is_empty() && id == previous_id) {
                continue;
            }
            let name = if label.trim().is_empty() {
                format!("{username}@{existing_host}:{ssh_port}")
            } else {
                label.trim().to_string()
            };
            return Err(AppError::Validation(format!(
                "已存在这台宿主机：{name}（{existing_host}:{ssh_port} / {username}）"
            )));
        }
        Ok(())
    }
}

// ── HyperVVmCredential repository ─────────────────────────────────────────

struct VmCredRepo<'a> {
    pool: &'a Pool,
    state: &'a MySqlProfileState,
}

impl<'a> VmCredRepo<'a> {
    fn new(pool: &'a Pool, state: &'a MySqlProfileState) -> Self {
        Self { pool, state }
    }

    fn list(&self) -> AppResult<Vec<HyperVVmCredentialProfile>> {
        let mut conn = self.pool.get_conn()?;
        let rows: Vec<Row> = conn.exec(
            r#"SELECT id, label, host, ssh_port, username,
                      COALESCE(password_ciphertext, '') AS password_ciphertext,
                      COALESCE(password_nonce, '')      AS password_nonce,
                      parent_profile_id, vm_id, vm_name,
                      COALESCE(DATE_FORMAT(last_connected_at, '%Y-%m-%dT%H:%i:%s.000Z'), '') AS last_connected_at
               FROM hyperv_vm_credentials
               ORDER BY last_connected_at IS NULL, last_connected_at DESC, updated_at DESC
               LIMIT ?"#,
            (MAX_VM_CREDENTIALS,),
        )?;
        rows.into_iter()
            .map(|row| {
                let (id, label, host, ssh_port, username, ct, nonce, ppid, vm_id, vm_name, lca): (
                    String, String, String, u16, String, String, String, String, String, String, String,
                ) = mysql::from_row_opt(row)?;
                let password = self.state.decrypt_vm_password(&ct, &nonce)?;
                Ok(HyperVVmCredentialProfile {
                    id, label, host,
                    port: ssh_port.to_string(),
                    username, password,
                    parent_profile_id: ppid,
                    vm_id, vm_name,
                    last_connected_at: lca,
                })
            })
            .collect()
    }

    fn upsert(&self, c: &HyperVVmCredentialProfile) -> AppResult<()> {
        let id = c.id.trim();
        let parent_profile_id = c.parent_profile_id.trim();
        let vm_id = c.vm_id.trim();
        let username = c.username.trim();
        if id.is_empty() || parent_profile_id.is_empty() || vm_id.is_empty() || username.is_empty() {
            return Err(AppError::Validation("Hyper-V VM 凭据缺少必要字段".into()));
        }
        let label = c.label.trim();
        let host = c.host.trim();
        let vm_name = c.vm_name.trim();
        let ssh_port = parse_port(&c.port, 22)?;
        let lca = mysql_datetime(&c.last_connected_at);
        let (ct, nonce) = self.state.encrypt_vm_password(&c.password)?;
        let ct_opt = if ct.is_empty() { None } else { Some(ct) };
        let nonce_opt = if nonce.is_empty() { None } else { Some(nonce) };

        let mut conn = self.pool.get_conn()?;
        conn.exec_drop(
            r#"INSERT INTO hyperv_vm_credentials
               (id, label, host, ssh_port, username, password_ciphertext, password_nonce,
                parent_profile_id, vm_id, vm_name, last_connected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                   id = VALUES(id), label = VALUES(label), host = VALUES(host),
                   ssh_port = VALUES(ssh_port), username = VALUES(username),
                   password_ciphertext = VALUES(password_ciphertext),
                   password_nonce = VALUES(password_nonce),
                   parent_profile_id = VALUES(parent_profile_id),
                   vm_id = VALUES(vm_id), vm_name = VALUES(vm_name),
                   last_connected_at = VALUES(last_connected_at)"#,
            (id, if label.is_empty() { id } else { label }, host, ssh_port, username,
             ct_opt, nonce_opt, parent_profile_id, vm_id,
             if vm_name.is_empty() { vm_id } else { vm_name }, lca),
        )?;
        Ok(())
    }

    fn delete(&self, id: &str) -> AppResult<()> {
        let mut conn = self.pool.get_conn()?;
        conn.exec_drop("DELETE FROM hyperv_vm_credentials WHERE id = ?", (id,))?;
        Ok(())
    }

    fn delete_by_parent(&self, parent_profile_id: &str) -> AppResult<()> {
        let mut conn = self.pool.get_conn()?;
        conn.exec_drop(
            "DELETE FROM hyperv_vm_credentials WHERE parent_profile_id = ?",
            (parent_profile_id,),
        )?;
        Ok(())
    }
}

// ── Utility functions ─────────────────────────────────────────────────────

fn parse_port(value: &str, default_port: u16) -> AppResult<u16> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(default_port);
    }
    let port = trimmed
        .parse::<u16>()
        .map_err(|_| AppError::Validation(format!("端口无效：{trimmed}")))?;
    if port == 0 {
        return Err(AppError::Validation(format!("端口无效：{trimmed}")));
    }
    Ok(port)
}

fn mysql_datetime(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(trimmed)
        .map(|dt| dt.with_timezone(&Utc).format("%Y-%m-%d %H:%M:%S%.3f").to_string())
        .ok()
}
