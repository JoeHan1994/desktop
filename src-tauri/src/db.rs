//! SQLite 数据库初始化与连接管理。
//!
//! `DbState` 作为独立的 Tauri managed state 注入，持有一个
//! `Arc<Mutex<Connection>>`，可被所有命令安全共享。
//!
//! 数据库文件路径：`{app_data_dir}/app.db`（由 `main.rs` 在 setup 中传入）。

use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
}

impl DbState {
    /// 打开（或创建）数据库并执行初始迁移。
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;

        // WAL 模式：并发读写性能更好，对 Tauri 桌面应用是最佳实践。
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        // ── 表结构迁移 ──────────────────────────────────────────────
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS model_providers (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                provider     TEXT NOT NULL,
                api_base_url TEXT NOT NULL DEFAULT '',
                model        TEXT NOT NULL DEFAULT '',
                api_key      TEXT NOT NULL DEFAULT '',
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- 通用键值对设置（外观配置、用户偏好等）
            CREATE TABLE IF NOT EXISTS app_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        ")?;

        Ok(DbState {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
}
