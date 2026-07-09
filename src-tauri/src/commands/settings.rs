//! Settings 命令：Model Provider 的 MySQL CRUD 与通用键值设置（SQLite 持久化）。
//!
//! 通用设置继续通过 `DbState` 访问 SQLite；Model Provider 通过 MySQL 持久化。

use crate::db::DbState;
use crate::mysql_profiles::{ensure_model_provider_schema, MySqlProfileState};
use crate::store::ModelProvider;
use mysql::prelude::Queryable;
use mysql::{Pool, Row};
use rusqlite::{params, OptionalExtension};

const LEGACY_PROVIDER_IMPORT_FLAG_KEY: &str = "model.providers.mysql.imported.v1";

// ── 通用键值设置 ──────────────────────────────────────────────────────────

/// 读取一个设置项（不存在时返回 `null`）。
#[tauri::command]
pub fn get_setting(db: tauri::State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM app_settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let result: Option<String> = stmt
        .query_row(params![key], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(result)
}

/// 写入（或覆盖）一个设置项。
#[tauri::command]
pub fn set_setting(
    db: tauri::State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
             value      = excluded.value,
             updated_at = excluded.updated_at",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Model Provider CRUD ───────────────────────────────────────────────────

/// 获取所有已保存的 Model Provider（按写入顺序排列）。
#[tauri::command]
pub fn get_providers(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<ModelProvider>, String> {
    let pool = mysql.require_pool()?;
    ensure_model_provider_schema(pool)?;
    list_model_providers(pool, &mysql)
}

/// 新增或更新一个 Model Provider（以 `id` 为主键，存在则覆盖）。
#[tauri::command]
pub fn upsert_provider(
    mysql: tauri::State<'_, MySqlProfileState>,
    provider: ModelProvider,
) -> Result<(), String> {
    let pool = mysql.require_pool()?;
    ensure_model_provider_schema(pool)?;
    upsert_model_provider(pool, &mysql, &provider)?;
    Ok(())
}

/// 按 `id` 删除一个 Model Provider。
#[tauri::command]
pub fn delete_provider(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<(), String> {
    let pool = mysql.require_pool()?;
    ensure_model_provider_schema(pool)?;
    delete_model_provider(pool, &id)?;
    Ok(())
}

/// 将旧版本 SQLite Model Provider 导入 MySQL，仅首次导入。
#[tauri::command]
pub fn import_legacy_model_providers(
    db: tauri::State<'_, DbState>,
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<ModelProvider>, String> {
    let pool = mysql.require_pool()?;
    ensure_model_provider_schema(pool)?;

    let legacy_providers = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let already_imported: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![LEGACY_PROVIDER_IMPORT_FLAG_KEY],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if already_imported.as_deref() == Some("1") {
            return list_model_providers(pool, &mysql);
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, name, provider, api_base_url, model, api_key
                 FROM model_providers
                 ORDER BY created_at, rowid",
            )
            .map_err(|e| e.to_string())?;
        let providers = stmt
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
        providers
    };

    for provider in &legacy_providers {
        upsert_model_provider(pool, &mysql, provider)?;
    }

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, '1', datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = datetime('now')",
            params![LEGACY_PROVIDER_IMPORT_FLAG_KEY],
        )
        .map_err(|e| e.to_string())?;
    }

    list_model_providers(pool, &mysql)
}

fn list_model_providers(
    pool: &Pool,
    mysql: &MySqlProfileState,
) -> Result<Vec<ModelProvider>, String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    let rows: Vec<Row> = conn
        .query(
            r#"
            SELECT
                id,
                name,
                provider,
                api_base_url,
                model,
                COALESCE(api_key_ciphertext, '') AS api_key_ciphertext,
                COALESCE(api_key_nonce, '') AS api_key_nonce
            FROM model_providers
            ORDER BY created_at, updated_at
            "#,
        )
        .map_err(|err| format!("读取 MySQL Model Provider 列表失败：{}", err))?;

    rows.into_iter()
        .map(|row| {
            let (id, name, provider, api_base_url, model, api_key_ciphertext, api_key_nonce): (
                String,
                String,
                String,
                String,
                String,
                String,
                String,
            ) = mysql::from_row_opt(row).map_err(|err| err.to_string())?;
            let api_key =
                mysql.decrypt_api_key(api_key_ciphertext.as_str(), api_key_nonce.as_str())?;
            Ok(ModelProvider {
                id,
                name,
                provider,
                api_base_url,
                model,
                api_key,
            })
        })
        .collect::<Result<Vec<_>, String>>()
}

fn upsert_model_provider(
    pool: &Pool,
    mysql: &MySqlProfileState,
    provider: &ModelProvider,
) -> Result<(), String> {
    let id = provider.id.trim();
    let name = provider.name.trim();
    let provider_kind = provider.provider.trim();
    if id.is_empty() || provider_kind.is_empty() {
        return Err("Model Provider 缺少 id 或 provider".to_string());
    }

    let (api_key_ciphertext, api_key_nonce) = mysql.encrypt_api_key(provider.api_key.as_str())?;
    let api_key_ciphertext = if api_key_ciphertext.is_empty() {
        None
    } else {
        Some(api_key_ciphertext)
    };
    let api_key_nonce = if api_key_nonce.is_empty() {
        None
    } else {
        Some(api_key_nonce)
    };

    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop(
        r#"
        INSERT INTO model_providers (
            id,
            name,
            provider,
            api_base_url,
            model,
            api_key_ciphertext,
            api_key_nonce,
            api_key_key_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            provider = VALUES(provider),
            api_base_url = VALUES(api_base_url),
            model = VALUES(model),
            api_key_ciphertext = VALUES(api_key_ciphertext),
            api_key_nonce = VALUES(api_key_nonce),
            api_key_key_version = VALUES(api_key_key_version)
        "#,
        (
            id,
            if name.is_empty() { id } else { name },
            provider_kind,
            provider.api_base_url.trim(),
            provider.model.trim(),
            api_key_ciphertext,
            api_key_nonce,
        ),
    )
    .map_err(|err| format!("保存 MySQL Model Provider 失败：{}", err))?;

    Ok(())
}

fn delete_model_provider(pool: &Pool, id: &str) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
    conn.exec_drop("DELETE FROM model_providers WHERE id = ?", (id,))
        .map_err(|err| format!("删除 MySQL Model Provider 失败：{}", err))?;
    Ok(())
}
