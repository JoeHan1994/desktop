//! Unified application error type.
//!
//! All internal functions return `crate::error::Result<T>`.
//! Tauri command handlers convert at the boundary via `.map_err(Into::into)`.
//!
//! # Design
//! - `AppError` is a typed enum so `match` on error kind is always possible.
//! - `From<AppError> for String` allows transparent conversion at Tauri boundaries.
//! - Callers never need to write `.map_err(|e| e.to_string())` inside library code.

use std::fmt;

// ── Error type ────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum AppError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    MySql(mysql::Error),
    MySqlRow(mysql::FromRowError),
    Crypto(String),
    Config(String),
    /// Input validation failure visible to the user.
    Validation(String),
    Ssh(russh::Error),
    Other(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e)         => write!(f, "IO 错误：{e}"),
            Self::Sqlite(e)     => write!(f, "SQLite 错误：{e}"),
            Self::MySql(e)      => write!(f, "MySQL 错误：{e}"),
            Self::MySqlRow(e)   => write!(f, "MySQL 行解析错误：{e}"),
            Self::Crypto(msg)   => write!(f, "加密错误：{msg}"),
            Self::Config(msg)   => write!(f, "配置错误：{msg}"),
            Self::Validation(msg) => write!(f, "{msg}"),
            Self::Ssh(e)        => write!(f, "SSH 错误：{e}"),
            Self::Other(msg)    => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for AppError {}

// ── From conversions ──────────────────────────────────────────────────────

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { Self::Io(e) }
}
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self { Self::Sqlite(e) }
}
impl From<mysql::Error> for AppError {
    fn from(e: mysql::Error) -> Self { Self::MySql(e) }
}
impl From<mysql::FromRowError> for AppError {
    fn from(e: mysql::FromRowError) -> Self { Self::MySqlRow(e) }
}
impl From<russh::Error> for AppError {
    fn from(e: russh::Error) -> Self { Self::Ssh(e) }
}
impl From<String> for AppError {
    fn from(msg: String) -> Self { Self::Other(msg) }
}
impl From<&str> for AppError {
    fn from(msg: &str) -> Self { Self::Other(msg.to_string()) }
}

/// Conversion used at Tauri command boundaries:
/// `internal_fn().map_err(Into::into)` → `Result<T, String>`.
impl From<AppError> for String {
    fn from(e: AppError) -> Self { e.to_string() }
}

// ── Result alias ──────────────────────────────────────────────────────────

pub type Result<T> = std::result::Result<T, AppError>;
