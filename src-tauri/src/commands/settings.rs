//! Settings 命令：Model Provider 的 CRUD 与通用键值设置（SQLite 持久化）。
//!
//! 所有命令通过 `DbState` 访问 SQLite，`AppState` 不再用于缓存 providers。

use crate::db::DbState;
use crate::store::ModelProvider;
use rusqlite::{params, OptionalExtension};

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
pub fn get_providers(db: tauri::State<'_, DbState>) -> Result<Vec<ModelProvider>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
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
                id:           row.get(0)?,
                name:         row.get(1)?,
                provider:     row.get(2)?,
                api_base_url: row.get(3)?,
                model:        row.get(4)?,
                api_key:      row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(providers)
}

/// 新增或更新一个 Model Provider（以 `id` 为主键，存在则覆盖）。
#[tauri::command]
pub fn upsert_provider(
    db: tauri::State<'_, DbState>,
    provider: ModelProvider,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO model_providers (id, name, provider, api_base_url, model, api_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
             name         = excluded.name,
             provider     = excluded.provider,
             api_base_url = excluded.api_base_url,
             model        = excluded.model,
             api_key      = excluded.api_key",
        params![
            provider.id,
            provider.name,
            provider.provider,
            provider.api_base_url,
            provider.model,
            provider.api_key,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 按 `id` 删除一个 Model Provider。
#[tauri::command]
pub fn delete_provider(db: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM model_providers WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

