//! Database connection config domain model.
//!
//! A user-configured database connection profile (MySQL, SQL Server, SQLite, …).
//! `rename_all = "camelCase"` aligns JSON keys with the TypeScript
//! `DatabaseConfigPayload` interface.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConfig {
    pub id: String,
    pub name: String,
    /// Database kind: `"mysql"` | `"sqlserver"` | `"sqlite"`.
    pub db_type: String,
    /// Host / server address (or file path for SQLite).
    pub server: String,
    /// Port as string for frontend compatibility (empty for SQLite).
    pub port: String,
    /// Database / schema name (optional for SQLite).
    pub database: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub updated_at: String,
}
