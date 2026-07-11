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
