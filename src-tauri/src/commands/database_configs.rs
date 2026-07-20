//! Database connection config commands (MySQL-backed, password encrypted at rest).
//!
//! 命令层是薄包装层；数据访问逻辑封装在私有 repository 函数中。

use mysql::prelude::Queryable;
use mysql::{Pool, Row};

use crate::domain::database_config::DatabaseConfig;
use crate::error::{AppError, Result as AppResult};
use crate::mysql_profiles::{ensure_database_config_schema, MySqlProfileState};

const MAX_DATABASE_CONFIGS: i64 = 64;

// ── Commands ──────────────────────────────────────────────────────────────

/// 获取所有已保存的数据库连接配置。
#[tauri::command]
pub fn list_database_configs(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<DatabaseConfig>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_database_config_schema(pool).map_err(|e| e.to_string())?;
    list_impl(pool, &mysql).map_err(Into::into)
}

/// 新增或更新一个数据库连接配置。
#[tauri::command]
pub fn upsert_database_config(
    mysql: tauri::State<'_, MySqlProfileState>,
    config: DatabaseConfig,
) -> Result<Vec<DatabaseConfig>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_database_config_schema(pool).map_err(|e| e.to_string())?;
    upsert_impl(pool, &mysql, &config).map_err(|e| e.to_string())?;
    list_impl(pool, &mysql).map_err(Into::into)
}

/// 按 `id` 删除一个数据库连接配置。
#[tauri::command]
pub fn delete_database_config(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<Vec<DatabaseConfig>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_database_config_schema(pool).map_err(|e| e.to_string())?;
    delete_impl(pool, &id).map_err(|e| e.to_string())?;
    list_impl(pool, &mysql).map_err(Into::into)
}

// ── Repository functions ──────────────────────────────────────────────────

fn list_impl(pool: &Pool, state: &MySqlProfileState) -> AppResult<Vec<DatabaseConfig>> {
    let mut conn = pool.get_conn()?;
    let rows: Vec<Row> = conn.query(
        r#"SELECT id, name, db_type, server, port, database_name, username,
                  COALESCE(password_ciphertext, '') AS password_ciphertext,
                  COALESCE(password_nonce, '')      AS password_nonce,
                  COALESCE(DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s'), '') AS updated_at
           FROM database_configs
           ORDER BY created_at, updated_at"#,
    )?;
    rows.into_iter()
        .map(|row| {
            let (id, name, db_type, server, port, database, username, ct, nonce, updated_at): (
                String, String, String, String, String, String, String, String, String, String,
            ) = mysql::from_row_opt(row)?;
            let password = state.decrypt_password(&ct, &nonce)?;
            Ok(DatabaseConfig {
                id,
                name,
                db_type,
                server,
                port,
                database,
                username,
                password,
                updated_at,
            })
        })
        .collect()
}

fn upsert_impl(pool: &Pool, state: &MySqlProfileState, c: &DatabaseConfig) -> AppResult<()> {
    let id = c.id.trim();
    let db_type = c.db_type.trim();
    if id.is_empty() || db_type.is_empty() {
        return Err(AppError::Validation(
            "数据库配置缺少 id 或类型".to_string(),
        ));
    }
    let name = c.name.trim();

    let mut conn = pool.get_conn()?;
    // Enforce a soft cap only for brand-new rows.
    let already: Option<u8> =
        conn.exec_first("SELECT 1 FROM database_configs WHERE id = ?", (id,))?;
    if already.is_none() {
        let count: i64 = conn
            .query_first("SELECT COUNT(*) FROM database_configs")?
            .unwrap_or(0);
        if count >= MAX_DATABASE_CONFIGS {
            return Err(AppError::Validation(format!(
                "数据库配置数量已达上限（{MAX_DATABASE_CONFIGS}）"
            )));
        }
    }

    let (ct, nonce) = state.encrypt_password(c.password.trim())?;
    let ct_opt = if ct.is_empty() { None } else { Some(ct) };
    let nonce_opt = if nonce.is_empty() { None } else { Some(nonce) };

    conn.exec_drop(
        r#"INSERT INTO database_configs
               (id, name, db_type, server, port, database_name, username, password_ciphertext, password_nonce)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
               name = VALUES(name), db_type = VALUES(db_type),
               server = VALUES(server), port = VALUES(port),
               database_name = VALUES(database_name), username = VALUES(username),
               password_ciphertext = VALUES(password_ciphertext),
               password_nonce = VALUES(password_nonce)"#,
        (
            id,
            if name.is_empty() { id } else { name },
            db_type,
            c.server.trim(),
            c.port.trim(),
            c.database.trim(),
            c.username.trim(),
            ct_opt,
            nonce_opt,
        ),
    )?;
    Ok(())
}

fn delete_impl(pool: &Pool, id: &str) -> AppResult<()> {
    let mut conn = pool.get_conn()?;
    conn.exec_drop("DELETE FROM database_configs WHERE id = ?", (id,))?;
    Ok(())
}
