//! Settings 命令：通用键值设置（SQLite）和 Model Provider CRUD（MySQL）。
//!
//! 所有公开命令是薄包装层；业务逻辑通过 `DbState::get_setting` /
//! `DbState::set_setting` 和内部 repository 函数实现。

use mysql::prelude::Queryable;
use mysql::{Pool, Row};

use crate::db::DbState;
use crate::domain::model_provider::ModelProvider;
use crate::error::Result as AppResult;
use crate::mysql_profiles::{ensure_model_provider_schema, MySqlProfileState};

// ── Legacy migration key ──────────────────────────────────────────────────

const LEGACY_IMPORT_FLAG: &str = "model.providers.mysql.imported.v1";

// ── Generic key-value settings ────────────────────────────────────────────

/// 读取一个设置项（不存在时返回 `null`）。
#[tauri::command]
pub fn get_setting(db: tauri::State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(Into::into)
}

/// 写入（或覆盖）一个设置项。
#[tauri::command]
pub fn set_setting(
    db: tauri::State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(Into::into)
}

// ── Model Provider CRUD ───────────────────────────────────────────────────

/// 获取所有已保存的 Model Provider。
#[tauri::command]
pub fn get_providers(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<ModelProvider>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_model_provider_schema(pool).map_err(|e| e.to_string())?;
    list_providers(pool, &mysql).map_err(Into::into)
}

/// 新增或更新一个 Model Provider。
#[tauri::command]
pub fn upsert_provider(
    mysql: tauri::State<'_, MySqlProfileState>,
    provider: ModelProvider,
) -> Result<(), String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_model_provider_schema(pool).map_err(|e| e.to_string())?;
    upsert_provider_impl(pool, &mysql, &provider).map_err(Into::into)
}

/// 按 `id` 删除一个 Model Provider。
#[tauri::command]
pub fn delete_provider(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<(), String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_model_provider_schema(pool).map_err(|e| e.to_string())?;
    delete_provider_impl(pool, &id).map_err(Into::into)
}

/// 将旧版本 SQLite Model Provider 迁移到 MySQL（首次运行）。
#[tauri::command]
pub fn import_legacy_model_providers(
    db: tauri::State<'_, DbState>,
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<ModelProvider>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_model_provider_schema(pool).map_err(|e| e.to_string())?;

    // Check if already migrated
    if db.get_setting(LEGACY_IMPORT_FLAG).map_err(|e| e.to_string())?.as_deref() == Some("1") {
        return list_providers(pool, &mysql).map_err(Into::into);
    }

    // Read legacy SQLite records into a Vec before releasing the lock.
    let legacy: Vec<ModelProvider> = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, provider, api_base_url, model, api_key FROM model_providers ORDER BY created_at, rowid")
            .map_err(|e| e.to_string())?;
        // Assign to a named variable so the query_map temporary is dropped
        // before `stmt` and `conn` go out of scope (required by the borrow checker).
        let result = stmt
            .query_map([], |row| {
                Ok(ModelProvider {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    provider: row.get(2)?,
                    api_base_url: row.get(3)?,
                    model: row.get(4)?,
                    api_key: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };

    for p in &legacy {
        upsert_provider_impl(pool, &mysql, p).map_err(|e| e.to_string())?;
    }
    db.set_setting(LEGACY_IMPORT_FLAG, "1").map_err(|e| e.to_string())?;
    list_providers(pool, &mysql).map_err(Into::into)
}

// ── Repository functions ──────────────────────────────────────────────────

fn list_providers(pool: &Pool, state: &MySqlProfileState) -> AppResult<Vec<ModelProvider>> {
    let mut conn = pool.get_conn()?;
    let rows: Vec<Row> = conn.query(
        r#"SELECT id, name, provider, api_base_url, model,
                  COALESCE(api_key_ciphertext, '') AS api_key_ciphertext,
                  COALESCE(api_key_nonce, '')      AS api_key_nonce
           FROM model_providers
           ORDER BY created_at, updated_at"#,
    )?;
    rows.into_iter()
        .map(|row| {
            let (id, name, provider, api_base_url, model, ct, nonce): (
                String, String, String, String, String, String, String,
            ) = mysql::from_row_opt(row)?;
            let api_key = state.decrypt_api_key(&ct, &nonce)?;
            Ok(ModelProvider { id, name, provider, api_base_url, model, api_key })
        })
        .collect()
}

fn upsert_provider_impl(pool: &Pool, state: &MySqlProfileState, p: &ModelProvider) -> AppResult<()> {
    let id = p.id.trim();
    let provider_kind = p.provider.trim();
    if id.is_empty() || provider_kind.is_empty() {
        return Err(crate::error::AppError::Validation(
            "Model Provider 缺少 id 或 provider".to_string(),
        ));
    }
    let name = p.name.trim();
    let (ct, nonce) = state.encrypt_api_key(p.api_key.trim())?;
    let ct_opt = if ct.is_empty() { None } else { Some(ct) };
    let nonce_opt = if nonce.is_empty() { None } else { Some(nonce) };

    let mut conn = pool.get_conn()?;
    conn.exec_drop(
        r#"INSERT INTO model_providers (id, name, provider, api_base_url, model, api_key_ciphertext, api_key_nonce, api_key_key_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
               name = VALUES(name), provider = VALUES(provider),
               api_base_url = VALUES(api_base_url), model = VALUES(model),
               api_key_ciphertext = VALUES(api_key_ciphertext),
               api_key_nonce = VALUES(api_key_nonce),
               api_key_key_version = VALUES(api_key_key_version)"#,
        (id, if name.is_empty() { id } else { name }, provider_kind,
         p.api_base_url.trim(), p.model.trim(), ct_opt, nonce_opt),
    )?;
    Ok(())
}

fn delete_provider_impl(pool: &Pool, id: &str) -> AppResult<()> {
    let mut conn = pool.get_conn()?;
    conn.exec_drop("DELETE FROM model_providers WHERE id = ?", (id,))?;
    Ok(())
}

// ── Azure CLI helper ──────────────────────────────────────────────────────

/// 运行 `az account show --output json` 并返回原始 JSON 字符串。
/// 若 az 未安装或未登录则返回 Err。
/// Windows 上 az 是 az.cmd，需通过 cmd /c 调用，否则 PATH 解析失败。
#[tauri::command]
pub async fn run_az_account_show() -> Result<String, String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/c", "az", "account", "show", "--output", "json"])
        .output()
        .map_err(|e| format!("无法运行 az 命令: {e}"))?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("az")
        .args(["account", "show", "--output", "json"])
        .output()
        .map_err(|e| format!("无法运行 az 命令: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("az 命令退出码: {}", output.status.code().unwrap_or(-1))
        })
    }
}

// ── Terraforge Work Item ──────────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct CreateWorkItemParams {
    pub base_url: String,
    pub access_key: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    // Optional fields
    pub area: Option<String>,
    pub iteration: Option<String>,
    pub source: Option<String>,
    pub issue_type: Option<String>,
    pub sprint_team: Option<String>,
}

#[derive(serde::Serialize)]
pub struct CreateWorkItemResult {
    pub id: i64,
    pub url: String,
}

/// 在 Rust 侧执行 Terraforge 两步 API（GetToken → CreateWorkItem），
/// 绕过 WebView CORS 限制。
#[tauri::command]
pub async fn create_work_item(params: CreateWorkItemParams) -> Result<CreateWorkItemResult, String> {
    let client = reqwest::Client::new();
    let base_url = params.base_url.trim().trim_end_matches('/');

    // Step 1: 获取 JWT Token
    let token_res = client
        .post(format!("{}/auth/token", base_url))
        .header("Accept", "application/json")
        .header("X-Client-Type", "Automated")
        .json(&serde_json::json!({ "accessKey": params.access_key }))
        .send()
        .await
        .map_err(|e| format!("认证请求失败: {e}"))?;

    if !token_res.status().is_success() {
        let status = token_res.status().as_u16();
        let body: serde_json::Value = token_res.json().await.unwrap_or_default();
        let msg = body["message"].as_str().unwrap_or("认证失败").to_string();
        return Err(format!("{msg} ({status})"));
    }

    let token_data: serde_json::Value = token_res
        .json()
        .await
        .map_err(|e| format!("解析 Token 响应失败: {e}"))?;

    let access_token = token_data["data"]["accessToken"]
        .as_str()
        .ok_or_else(|| "Token 响应中缺少 accessToken".to_string())?
        .to_string();

    // Step 2: 创建 Work Item（multipart/form-data，字段名大写匹配 API 规范）
    let mut form = reqwest::multipart::Form::new()
        .text("Title", params.title)
        .text("Description", params.description)
        .text("Priority", params.priority);

    // 追加非空可选字段
    for (name, val) in [
        ("Area",       params.area),
        ("Iteration",  params.iteration),
        ("Source",     params.source),
        ("IssueType",  params.issue_type),
        ("SprintTeam", params.sprint_team),
    ] {
        if let Some(v) = val {
            let v = v.trim().to_string();
            if !v.is_empty() {
                form = form.text(name, v);
            }
        }
    }

    let create_res = client
        .post(format!("{}/v1/azuredevops/WorkItems", base_url))
        .bearer_auth(&access_token)
        .header("Accept", "application/json")
        .header("X-Client-Type", "Automated")
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("创建 Work Item 失败: {e}"))?;

    if !create_res.status().is_success() {
        let status = create_res.status().as_u16();
        let body: serde_json::Value = create_res.json().await.unwrap_or_default();
        let msg = body["message"].as_str().unwrap_or("创建失败").to_string();
        return Err(format!("{msg} ({status})"));
    }

    let create_data: serde_json::Value = create_res
        .json()
        .await
        .map_err(|e| format!("解析创建响应失败: {e}"))?;

    Ok(CreateWorkItemResult {
        id: create_data["data"]["id"].as_i64().unwrap_or(0),
        url: create_data["data"]["url"]
            .as_str()
            .unwrap_or("")
            .to_string(),
    })
}
