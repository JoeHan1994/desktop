//! SQLite 数据库初始化与连接管理。
//!
//! `DbState` 作为 Tauri managed state 注入，持有一个 `Arc<Mutex<Connection>>`
//! 供所有命令安全共享。
//!
//! 数据库文件路径：`{app_data_dir}/app.db`（由 `main.rs` 在 setup 中传入）。
//!
//! # Schema 迁移策略
//! 采用"CREATE TABLE IF NOT EXISTS + ALTER TABLE IF NOT EXISTS column"模式：
//! 每次启动自动幂等执行，无需迁移版本表。新增字段只需在 `MIGRATIONS` 中追加。

use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::error::{AppError, Result};

// ── Schema migrations (append-only, idempotent) ───────────────────────────

const INITIAL_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS model_providers (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        provider     TEXT NOT NULL,
        api_base_url TEXT NOT NULL DEFAULT '',
        model        TEXT NOT NULL DEFAULT '',
        api_key      TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Generic key-value settings (theme, user preferences, migration flags).
    CREATE TABLE IF NOT EXISTS app_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
";

// ── DbState ───────────────────────────────────────────────────────────────

pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
}

impl DbState {
    /// Open (or create) the SQLite database at `path` and run all migrations.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;

        // WAL mode: better concurrent read/write performance for desktop apps.
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch(INITIAL_SCHEMA)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Acquire the connection lock, mapping the poison error to `AppError`.
    pub fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|e| AppError::Other(format!("SQLite mutex poisoned: {e}")))
    }

    /// Read a single setting value. Returns `None` when the key doesn't exist.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        let conn = self.lock()?;
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            rusqlite::params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
    }

    /// Write (or overwrite) a setting value.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
                 value      = excluded.value,
                 updated_at = excluded.updated_at",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }
}
