//! MySQL-backed remote machine profile commands.

use crate::db::DbState;
use crate::mysql_profiles::{
    ensure_hyperv_vm_credentials_schema, ensure_schema, MySqlProfileState,
};
use chrono::{DateTime, Utc};
use mysql::prelude::Queryable;
use mysql::{Pool, Row};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

const LEGACY_PROFILES_SETTING_KEY: &str = "remote.machine.profiles.v1";
const LEGACY_IMPORT_FLAG_KEY: &str = "remote.machine.profiles.mysql.imported.v1";
const LEGACY_VM_CREDENTIALS_SETTING_KEY: &str = "remote.hyperv.vm.credentials.v1";
const LEGACY_VM_CREDENTIALS_IMPORT_FLAG_KEY: &str =
    "remote.hyperv.vm.credentials.mysql.imported.v1";
const MAX_REMOTE_PROFILES: i64 = 12;
const MAX_VM_CREDENTIALS: i64 = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMachineProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: String,
    pub rdp_port: Option<String>,
    pub username: String,
    pub password: String,
    pub last_connected_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertRemoteMachineProfileRequest {
    pub profile: RemoteMachineProfile,
    pub previous_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperVVmCredentialProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: String,
    pub username: String,
    pub password: String,
    pub parent_profile_id: String,
    pub vm_id: String,
    pub vm_name: String,
    pub last_connected_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertHyperVVmCredentialRequest {
    pub credential: HyperVVmCredentialProfile,
}

#[tauri::command]
pub fn list_remote_machine_profiles(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_schema(pool)?;
    list_profiles(pool, &mysql)
}

#[tauri::command]
pub fn upsert_remote_machine_profile(
    mysql: tauri::State<'_, MySqlProfileState>,
    request: UpsertRemoteMachineProfileRequest,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_schema(pool)?;
    ensure_host_available(
        pool,
        &request.profile,
        request.previous_profile_id.as_deref(),
    )?;
    if let Some(previous_id) = request.previous_profile_id.as_deref() {
        if previous_id != request.profile.id {
            delete_profile(pool, previous_id)?;
        }
    }
    upsert_profile(pool, &mysql, &request.profile)?;
    list_profiles(pool, &mysql)
}

#[tauri::command]
pub fn delete_remote_machine_profile(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_schema(pool)?;
    delete_profile(pool, &id)?;
    list_profiles(pool, &mysql)
}

#[tauri::command]
pub fn import_legacy_remote_machine_profiles(
    db: tauri::State<'_, DbState>,
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_schema(pool)?;

    let legacy_payload: Option<String> = {
        let conn = db.conn.lock().map_err(|err| err.to_string())?;
        let already_imported: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![LEGACY_IMPORT_FLAG_KEY],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        if already_imported.as_deref() == Some("1") {
            return list_profiles(pool, &mysql);
        }
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![LEGACY_PROFILES_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
    };

    if let Some(raw) = legacy_payload {
        let profiles: Vec<RemoteMachineProfile> = serde_json::from_str(&raw).unwrap_or_default();
        for profile in profiles.iter().take(MAX_REMOTE_PROFILES as usize) {
            upsert_profile(pool, &mysql, profile)?;
        }
    }

    {
        let conn = db.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, '1', datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = datetime('now')",
            params![LEGACY_IMPORT_FLAG_KEY],
        )
        .map_err(|err| err.to_string())?;
    }

    list_profiles(pool, &mysql)
}

#[tauri::command]
pub fn list_hyperv_vm_credentials(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_hyperv_vm_credentials_schema(pool)?;
    list_vm_credentials(pool, &mysql)
}

#[tauri::command]
pub fn upsert_hyperv_vm_credential(
    mysql: tauri::State<'_, MySqlProfileState>,
    request: UpsertHyperVVmCredentialRequest,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_hyperv_vm_credentials_schema(pool)?;
    upsert_vm_credential(pool, &mysql, &request.credential)?;
    list_vm_credentials(pool, &mysql)
}

#[tauri::command]
pub fn delete_hyperv_vm_credential(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_hyperv_vm_credentials_schema(pool)?;
    delete_vm_credential(pool, &id)?;
    list_vm_credentials(pool, &mysql)
}

#[tauri::command]
pub fn delete_hyperv_vm_credentials_by_parent_profile_id(
    mysql: tauri::State<'_, MySqlProfileState>,
    parent_profile_id: String,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_hyperv_vm_credentials_schema(pool)?;
    delete_vm_credentials_by_parent_profile_id(pool, &parent_profile_id)?;
    list_vm_credentials(pool, &mysql)
}

#[tauri::command]
pub fn import_legacy_hyperv_vm_credentials(
    db: tauri::State<'_, DbState>,
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let pool = mysql.require_pool()?;
    ensure_hyperv_vm_credentials_schema(pool)?;

    let legacy_payload: Option<String> = {
        let conn = db.conn.lock().map_err(|err| err.to_string())?;
        let already_imported: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![LEGACY_VM_CREDENTIALS_IMPORT_FLAG_KEY],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        if already_imported.as_deref() == Some("1") {
            return list_vm_credentials(pool, &mysql);
        }
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![LEGACY_VM_CREDENTIALS_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
    };

    if let Some(raw) = legacy_payload {
        let credentials: Vec<HyperVVmCredentialProfile> =
            serde_json::from_str(&raw).unwrap_or_default();
        for credential in credentials.iter().take(MAX_VM_CREDENTIALS as usize) {
            upsert_vm_credential(pool, &mysql, credential)?;
        }
    }

    {
        let conn = db.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, '1', datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = datetime('now')",
            params![LEGACY_VM_CREDENTIALS_IMPORT_FLAG_KEY],
        )
        .map_err(|err| err.to_string())?;
    }

    list_vm_credentials(pool, &mysql)
}

fn list_profiles(
    pool: &Pool,
    mysql: &MySqlProfileState,
) -> Result<Vec<RemoteMachineProfile>, String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    let rows: Vec<Row> = conn
        .exec(
            r#"
            SELECT
                id,
                label,
                host,
                ssh_port,
                rdp_port,
                username,
                COALESCE(password_ciphertext, '') AS password_ciphertext,
                COALESCE(password_nonce, '') AS password_nonce,
                COALESCE(DATE_FORMAT(last_connected_at, '%Y-%m-%dT%H:%i:%s.000Z'), '') AS last_connected_at
            FROM remote_machine_profiles
            ORDER BY last_connected_at IS NULL, last_connected_at DESC, updated_at DESC
            LIMIT ?
            "#,
            (MAX_REMOTE_PROFILES,),
        )
        .map_err(|err| format!("读取 MySQL 远程机器列表失败：{}", err))?;

    rows.into_iter()
        .map(|row| {
            let (
                id,
                label,
                host,
                ssh_port,
                rdp_port,
                username,
                password_ciphertext,
                password_nonce,
                last_connected_at,
            ): (
                String,
                String,
                String,
                u16,
                u16,
                String,
                String,
                String,
                String,
            ) = mysql::from_row_opt(row).map_err(|err| err.to_string())?;
            let password =
                mysql.decrypt_password(password_ciphertext.as_str(), password_nonce.as_str())?;
            Ok(RemoteMachineProfile {
                id,
                label,
                host,
                port: ssh_port.to_string(),
                rdp_port: Some(rdp_port.to_string()),
                username,
                password,
                last_connected_at,
            })
        })
        .collect::<Result<Vec<_>, String>>()
}

fn ensure_host_available(
    pool: &Pool,
    profile: &RemoteMachineProfile,
    previous_profile_id: Option<&str>,
) -> Result<(), String> {
    let host = profile.host.trim();
    if host.is_empty() {
        return Ok(());
    }

    let current_id = profile.id.trim();
    let previous_id = previous_profile_id.map(str::trim).unwrap_or_default();
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    let rows: Vec<Row> = conn
        .exec(
            r#"
            SELECT
                id,
                label,
                host,
                ssh_port,
                username
            FROM remote_machine_profiles
            WHERE host = ?
            ORDER BY updated_at DESC
            LIMIT 8
            "#,
            (host,),
        )
        .map_err(|err| format!("检查 MySQL 远程机器宿主机重复失败：{}", err))?;

    for row in rows {
        let (id, label, existing_host, ssh_port, username): (String, String, String, u16, String) =
            mysql::from_row_opt(row)
                .map_err(|err| format!("解析 MySQL 远程机器宿主机重复检查结果失败：{}", err))?;
        if id == current_id || (!previous_id.is_empty() && id == previous_id) {
            continue;
        }

        let name = if label.trim().is_empty() {
            format!("{}@{}:{}", username, existing_host, ssh_port)
        } else {
            label.trim().to_string()
        };
        return Err(format!(
            "已存在这台宿主机：{}（{}:{} / {}）",
            name, existing_host, ssh_port, username
        ));
    }

    Ok(())
}

fn upsert_profile(
    pool: &Pool,
    mysql: &MySqlProfileState,
    profile: &RemoteMachineProfile,
) -> Result<(), String> {
    let id = profile.id.trim();
    let label = profile.label.trim();
    let host = profile.host.trim();
    let username = profile.username.trim();
    if id.is_empty() || host.is_empty() || username.is_empty() {
        return Err("远程机器配置缺少 id、host 或 username".to_string());
    }
    let ssh_port = parse_port(&profile.port, 22)?;
    let rdp_port = parse_port(profile.rdp_port.as_deref().unwrap_or("3389"), 3389)?;
    let last_connected_at = mysql_datetime(&profile.last_connected_at);
    let (password_ciphertext, password_nonce) = mysql.encrypt_password(&profile.password)?;
    let password_ciphertext = if password_ciphertext.is_empty() {
        None
    } else {
        Some(password_ciphertext)
    };
    let password_nonce = if password_nonce.is_empty() {
        None
    } else {
        Some(password_nonce)
    };

    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop(
        r#"
        INSERT INTO remote_machine_profiles (
            id,
            label,
            host,
            ssh_port,
            rdp_port,
            username,
            password_ciphertext,
            password_nonce,
            last_connected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            id = VALUES(id),
            label = VALUES(label),
            host = VALUES(host),
            ssh_port = VALUES(ssh_port),
            rdp_port = VALUES(rdp_port),
            username = VALUES(username),
            password_ciphertext = VALUES(password_ciphertext),
            password_nonce = VALUES(password_nonce),
            last_connected_at = VALUES(last_connected_at)
        "#,
        (
            id,
            if label.is_empty() { id } else { label },
            host,
            ssh_port,
            rdp_port,
            username,
            password_ciphertext,
            password_nonce,
            last_connected_at,
        ),
    )
    .map_err(|err| format!("保存 MySQL 远程机器配置失败：{}", err))?;

    Ok(())
}

fn delete_profile(pool: &Pool, id: &str) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop("DELETE FROM remote_machine_profiles WHERE id = ?", (id,))
        .map_err(|err| format!("删除 MySQL 远程机器配置失败：{}", err))?;
    Ok(())
}

fn list_vm_credentials(
    pool: &Pool,
    mysql: &MySqlProfileState,
) -> Result<Vec<HyperVVmCredentialProfile>, String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    let rows: Vec<Row> = conn
        .exec(
            r#"
            SELECT
                id,
                label,
                host,
                ssh_port,
                username,
                COALESCE(password_ciphertext, '') AS password_ciphertext,
                COALESCE(password_nonce, '') AS password_nonce,
                parent_profile_id,
                vm_id,
                vm_name,
                COALESCE(DATE_FORMAT(last_connected_at, '%Y-%m-%dT%H:%i:%s.000Z'), '') AS last_connected_at
            FROM hyperv_vm_credentials
            ORDER BY last_connected_at IS NULL, last_connected_at DESC, updated_at DESC
            LIMIT ?
            "#,
            (MAX_VM_CREDENTIALS,),
        )
        .map_err(|err| format!("读取 MySQL Hyper-V VM 凭据失败：{}", err))?;

    rows.into_iter()
        .map(|row| {
            let (
                id,
                label,
                host,
                ssh_port,
                username,
                password_ciphertext,
                password_nonce,
                parent_profile_id,
                vm_id,
                vm_name,
                last_connected_at,
            ): (
                String,
                String,
                String,
                u16,
                String,
                String,
                String,
                String,
                String,
                String,
                String,
            ) = mysql::from_row_opt(row).map_err(|err| err.to_string())?;
            let password =
                mysql.decrypt_vm_password(password_ciphertext.as_str(), password_nonce.as_str())?;
            Ok(HyperVVmCredentialProfile {
                id,
                label,
                host,
                port: ssh_port.to_string(),
                username,
                password,
                parent_profile_id,
                vm_id,
                vm_name,
                last_connected_at,
            })
        })
        .collect::<Result<Vec<_>, String>>()
}

fn upsert_vm_credential(
    pool: &Pool,
    mysql: &MySqlProfileState,
    credential: &HyperVVmCredentialProfile,
) -> Result<(), String> {
    let id = credential.id.trim();
    let parent_profile_id = credential.parent_profile_id.trim();
    let vm_id = credential.vm_id.trim();
    let username = credential.username.trim();
    if id.is_empty() || parent_profile_id.is_empty() || vm_id.is_empty() || username.is_empty() {
        return Err("Hyper-V VM 凭据缺少 id、parentProfileId、vmId 或 username".to_string());
    }
    let label = credential.label.trim();
    let host = credential.host.trim();
    let vm_name = credential.vm_name.trim();
    let ssh_port = parse_port(&credential.port, 22)?;
    let last_connected_at = mysql_datetime(&credential.last_connected_at);
    let (password_ciphertext, password_nonce) = mysql.encrypt_vm_password(&credential.password)?;
    let password_ciphertext = if password_ciphertext.is_empty() {
        None
    } else {
        Some(password_ciphertext)
    };
    let password_nonce = if password_nonce.is_empty() {
        None
    } else {
        Some(password_nonce)
    };

    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop(
        r#"
        INSERT INTO hyperv_vm_credentials (
            id,
            label,
            host,
            ssh_port,
            username,
            password_ciphertext,
            password_nonce,
            parent_profile_id,
            vm_id,
            vm_name,
            last_connected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            id = VALUES(id),
            label = VALUES(label),
            host = VALUES(host),
            ssh_port = VALUES(ssh_port),
            username = VALUES(username),
            password_ciphertext = VALUES(password_ciphertext),
            password_nonce = VALUES(password_nonce),
            parent_profile_id = VALUES(parent_profile_id),
            vm_id = VALUES(vm_id),
            vm_name = VALUES(vm_name),
            last_connected_at = VALUES(last_connected_at)
        "#,
        (
            id,
            if label.is_empty() { id } else { label },
            host,
            ssh_port,
            username,
            password_ciphertext,
            password_nonce,
            parent_profile_id,
            vm_id,
            if vm_name.is_empty() { vm_id } else { vm_name },
            last_connected_at,
        ),
    )
    .map_err(|err| format!("保存 MySQL Hyper-V VM 凭据失败：{}", err))?;

    Ok(())
}

fn delete_vm_credential(pool: &Pool, id: &str) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop("DELETE FROM hyperv_vm_credentials WHERE id = ?", (id,))
        .map_err(|err| format!("删除 MySQL Hyper-V VM 凭据失败：{}", err))?;
    Ok(())
}

fn delete_vm_credentials_by_parent_profile_id(
    pool: &Pool,
    parent_profile_id: &str,
) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop(
        "DELETE FROM hyperv_vm_credentials WHERE parent_profile_id = ?",
        (parent_profile_id,),
    )
    .map_err(|err| format!("删除 MySQL Hyper-V VM 凭据失败：{}", err))?;
    Ok(())
}

fn parse_port(value: &str, default_port: u16) -> Result<u16, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(default_port);
    }
    trimmed
        .parse::<u16>()
        .map_err(|_| format!("端口无效：{}", trimmed))
        .and_then(|port| {
            if port == 0 {
                Err(format!("端口无效：{}", trimmed))
            } else {
                Ok(port)
            }
        })
}

fn mysql_datetime(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(trimmed)
        .map(|dt| {
            dt.with_timezone(&Utc)
                .format("%Y-%m-%d %H:%M:%S%.3f")
                .to_string()
        })
        .ok()
}
