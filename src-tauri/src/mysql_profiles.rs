//! MySQL-backed shared profile storage configuration.
//!
//! `MySqlProfileState` is a Tauri managed state that provides:
//! - A connection pool (`mysql::Pool`) to the shared MySQL instance.
//! - An `AesGcmCipher` for at-rest encryption of passwords and API keys.
//!
//! Configuration is read from `{app_config_dir}/mysql.toml` on first run.
//! A commented-out template is written automatically if the file is missing.
//!
//! # Schema migrations
//! `ensure_schema`, `ensure_hyperv_vm_credentials_schema`, and
//! `ensure_model_provider_schema` are idempotent helpers called before each
//! command that touches the respective table.

use mysql::prelude::Queryable;
use mysql::{OptsBuilder, Pool};
use serde::Deserialize;
use std::path::{Path, PathBuf};

use crate::crypto::AesGcmCipher;
use crate::error::{AppError, Result};

// ── Default config template ───────────────────────────────────────────────

const CONFIG_FILE_NAME: &str = "mysql.toml";
const DEFAULT_CONFIG: &str = r#"# MyToolBox MySQL remote machine profile storage.
# Fill in username/password and replace encryption_key_base64 before using.
# Generate a 32-byte key with PowerShell:
# [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

host = "192.168.51.66"
port = 3306
database = "mytoolbox"
username = "root"
password = "REPLACE_WITH_MYSQL_PASSWORD"
encryption_key_base64 = "REPLACE_WITH_32_BYTE_BASE64_KEY"
connect_timeout_seconds = 5
"#;

// ── Config deserialization ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MySqlConfig {
    host: String,
    port: Option<u16>,
    database: String,
    username: String,
    password: String,
    encryption_key_base64: String,
    connect_timeout_seconds: Option<u64>,
}

// ── MySqlProfileState ─────────────────────────────────────────────────────

pub struct MySqlProfileState {
    pub config_path: PathBuf,
    pub pool: Option<Pool>,
    cipher: Option<AesGcmCipher>,
    pub init_error: Option<String>,
}

impl MySqlProfileState {
    /// Load configuration from `{config_dir}/mysql.toml`, writing a template
    /// if the file does not yet exist.
    pub fn load(config_dir: &Path) -> Self {
        let config_path = config_dir.join(CONFIG_FILE_NAME);

        if let Err(err) = std::fs::create_dir_all(config_dir) {
            return Self::failed(config_path, format!("无法创建 MySQL 配置目录：{err}"));
        }
        if !config_path.exists() {
            if let Err(err) = std::fs::write(&config_path, DEFAULT_CONFIG) {
                return Self::failed(config_path, format!("无法创建 MySQL 配置文件：{err}"));
            }
        }

        match Self::read_config(&config_path) {
            Ok((pool, cipher)) => Self {
                config_path,
                pool: Some(pool),
                cipher: Some(cipher),
                init_error: None,
            },
            Err(err) => Self::failed(config_path, err.to_string()),
        }
    }

    // ── Public accessors ──────────────────────────────────────────────────

    pub fn require_pool(&self) -> Result<&Pool> {
        self.pool.as_ref().ok_or_else(|| AppError::Config(self.config_error()))
    }

    pub fn require_cipher(&self) -> Result<&AesGcmCipher> {
        self.cipher.as_ref().ok_or_else(|| AppError::Config(self.config_error()))
    }

    pub fn config_error(&self) -> String {
        self.init_error.clone().unwrap_or_else(|| {
            format!(
                "MySQL 远程机器配置未就绪，请检查配置文件：{}",
                self.config_path.display()
            )
        })
    }

    // ── Encrypt / decrypt helpers ─────────────────────────────────────────

    pub fn encrypt_password(&self, password: &str) -> Result<(String, String)> {
        self.require_cipher()?.encrypt(password)
    }

    pub fn decrypt_password(&self, ciphertext: &str, nonce: &str) -> Result<String> {
        self.require_cipher()?.decrypt(ciphertext, nonce)
    }

    pub fn encrypt_vm_password(&self, password: &str) -> Result<(String, String)> {
        self.require_cipher()?.encrypt(password)
    }

    pub fn decrypt_vm_password(&self, ciphertext: &str, nonce: &str) -> Result<String> {
        self.require_cipher()?.decrypt(ciphertext, nonce)
    }

    pub fn encrypt_api_key(&self, api_key: &str) -> Result<(String, String)> {
        self.require_cipher()?.encrypt(api_key)
    }

    pub fn decrypt_api_key(&self, ciphertext: &str, nonce: &str) -> Result<String> {
        self.require_cipher()?.decrypt(ciphertext, nonce)
    }

    // ── Private helpers ───────────────────────────────────────────────────

    fn failed(config_path: PathBuf, error: String) -> Self {
        Self {
            config_path,
            pool: None,
            cipher: None,
            init_error: Some(error),
        }
    }

    fn read_config(config_path: &Path) -> Result<(Pool, AesGcmCipher)> {
        let raw = std::fs::read_to_string(config_path).map_err(|e| {
            AppError::Config(format!(
                "无法读取 MySQL 配置文件：{}；{e}",
                config_path.display()
            ))
        })?;
        let cfg: MySqlConfig = toml::from_str(&raw).map_err(|e| {
            AppError::Config(format!(
                "MySQL 配置文件格式错误：{}；{e}",
                config_path.display()
            ))
        })?;

        let username = cfg.username.trim();
        let password = cfg.password.trim();
        let key_b64 = cfg.encryption_key_base64.trim();

        if username.is_empty()
            || password.is_empty()
            || password == "REPLACE_WITH_MYSQL_PASSWORD"
            || key_b64.is_empty()
            || key_b64 == "REPLACE_WITH_32_BYTE_BASE64_KEY"
        {
            return Err(AppError::Config(format!(
                "MySQL 配置未完成，请更新配置文件：{}",
                config_path.display()
            )));
        }

        let cipher = AesGcmCipher::from_base64(key_b64)?;

        let mut opts = OptsBuilder::new()
            .ip_or_hostname(Some(cfg.host.trim().to_string()))
            .tcp_port(cfg.port.unwrap_or(3306))
            .db_name(Some(cfg.database.trim().to_string()))
            .user(Some(username.to_string()))
            .pass(Some(password.to_string()))
            .prefer_socket(false);
        if let Some(secs) = cfg.connect_timeout_seconds {
            opts = opts.tcp_connect_timeout(Some(std::time::Duration::from_secs(secs)));
        }
        let pool =
            Pool::new(opts).map_err(|e| AppError::Other(format!("初始化 MySQL 连接池失败：{e}")))?;

        Ok((pool, cipher))
    }
}

// ── Schema migrations (idempotent) ────────────────────────────────────────

/// Ensure the `remote_machine_profiles` table exists with all required columns.
pub fn ensure_schema(pool: &Pool) -> Result<()> {
    let mut conn = pool
        .get_conn()
        .map_err(|e| AppError::MySql(e))?;
    conn.query_drop(
        r#"
        CREATE TABLE IF NOT EXISTS remote_machine_profiles (
            id                   VARCHAR(191) NOT NULL,
            label                VARCHAR(255) NOT NULL,
            host                 VARCHAR(255) NOT NULL,
            ssh_port             SMALLINT UNSIGNED NOT NULL DEFAULT 22,
            rdp_port             SMALLINT UNSIGNED NOT NULL DEFAULT 3389,
            username             VARCHAR(255) NOT NULL,
            password_ciphertext  TEXT NULL,
            password_nonce       VARCHAR(64) NULL,
            last_connected_at    DATETIME(3) NULL,
            updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                   ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uk_remote_machine_identity (host, ssh_port, username),
            KEY idx_remote_machine_last_connected_at (last_connected_at),
            KEY idx_remote_machine_host (host)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|e| AppError::Other(format!("初始化 MySQL 远程机器表失败：{e}")))?;
    ensure_column(&mut conn, "remote_machine_profiles", "password_ciphertext",
        "ALTER TABLE remote_machine_profiles ADD COLUMN password_ciphertext TEXT NULL AFTER username")?;
    ensure_column(&mut conn, "remote_machine_profiles", "password_nonce",
        "ALTER TABLE remote_machine_profiles ADD COLUMN password_nonce VARCHAR(64) NULL AFTER password_ciphertext")?;
    Ok(())
}

/// Ensure the `hyperv_vm_credentials` table exists with all required columns.
pub fn ensure_hyperv_vm_credentials_schema(pool: &Pool) -> Result<()> {
    let mut conn = pool
        .get_conn()
        .map_err(|e| AppError::MySql(e))?;
    conn.query_drop(
        r#"
        CREATE TABLE IF NOT EXISTS hyperv_vm_credentials (
            id                   VARCHAR(191) NOT NULL,
            label                VARCHAR(255) NOT NULL,
            host                 VARCHAR(255) NOT NULL DEFAULT '',
            ssh_port             SMALLINT UNSIGNED NOT NULL DEFAULT 22,
            username             VARCHAR(255) NOT NULL,
            password_ciphertext  TEXT NULL,
            password_nonce       VARCHAR(64) NULL,
            parent_profile_id    VARCHAR(191) NOT NULL,
            vm_id                VARCHAR(191) NOT NULL,
            vm_name              VARCHAR(255) NOT NULL DEFAULT '',
            last_connected_at    DATETIME(3) NULL,
            updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                   ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uk_hyperv_vm_credential_identity (parent_profile_id, vm_id),
            KEY idx_hyperv_vm_credentials_parent (parent_profile_id),
            KEY idx_hyperv_vm_credentials_last_connected_at (last_connected_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|e| AppError::Other(format!("初始化 MySQL Hyper-V VM 凭据表失败：{e}")))?;

    for (col, sql) in [
        ("password_ciphertext", "ALTER TABLE hyperv_vm_credentials ADD COLUMN password_ciphertext TEXT NULL AFTER username"),
        ("password_nonce",      "ALTER TABLE hyperv_vm_credentials ADD COLUMN password_nonce VARCHAR(64) NULL AFTER password_ciphertext"),
        ("parent_profile_id",   "ALTER TABLE hyperv_vm_credentials ADD COLUMN parent_profile_id VARCHAR(191) NOT NULL AFTER password_nonce"),
        ("vm_id",               "ALTER TABLE hyperv_vm_credentials ADD COLUMN vm_id VARCHAR(191) NOT NULL AFTER parent_profile_id"),
        ("vm_name",             "ALTER TABLE hyperv_vm_credentials ADD COLUMN vm_name VARCHAR(255) NOT NULL DEFAULT '' AFTER vm_id"),
    ] {
        ensure_column(&mut conn, "hyperv_vm_credentials", col, sql)?;
    }
    Ok(())
}

/// Ensure the `model_providers` table exists with all required columns.
pub fn ensure_model_provider_schema(pool: &Pool) -> Result<()> {
    let mut conn = pool
        .get_conn()
        .map_err(|e| AppError::MySql(e))?;
    conn.query_drop(
        r#"
        CREATE TABLE IF NOT EXISTS model_providers (
            id                  VARCHAR(191) NOT NULL,
            name                VARCHAR(255) NOT NULL,
            provider            VARCHAR(32) NOT NULL,
            api_base_url        VARCHAR(2048) NOT NULL DEFAULT '',
            model               VARCHAR(255) NOT NULL DEFAULT '',
            api_key_ciphertext  TEXT NULL,
            api_key_nonce       VARCHAR(64) NULL,
            api_key_key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                  ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            KEY idx_model_providers_provider (provider),
            KEY idx_model_providers_updated_at (updated_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
        "#,
    )
    .map_err(|e| AppError::Other(format!("初始化 MySQL Model Provider 表失败：{e}")))?;

    for (col, sql) in [
        ("api_key_ciphertext",  "ALTER TABLE model_providers ADD COLUMN api_key_ciphertext TEXT NULL AFTER model"),
        ("api_key_nonce",       "ALTER TABLE model_providers ADD COLUMN api_key_nonce VARCHAR(64) NULL AFTER api_key_ciphertext"),
        ("api_key_key_version", "ALTER TABLE model_providers ADD COLUMN api_key_key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER api_key_nonce"),
    ] {
        ensure_column(&mut conn, "model_providers", col, sql)?;
    }
    Ok(())
}

/// Ensure the `database_configs` table exists with all required columns.
pub fn ensure_database_config_schema(pool: &Pool) -> Result<()> {
    let mut conn = pool.get_conn().map_err(AppError::MySql)?;
    conn.query_drop(
        r#"
        CREATE TABLE IF NOT EXISTS database_configs (
            id                  VARCHAR(191) NOT NULL,
            name                VARCHAR(255) NOT NULL,
            db_type             VARCHAR(32) NOT NULL,
            server              VARCHAR(512) NOT NULL DEFAULT '',
            port                VARCHAR(16) NOT NULL DEFAULT '',
            database_name       VARCHAR(255) NOT NULL DEFAULT '',
            username            VARCHAR(255) NOT NULL DEFAULT '',
            password_ciphertext TEXT NULL,
            password_nonce      VARCHAR(64) NULL,
            created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                  ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            KEY idx_database_configs_db_type (db_type),
            KEY idx_database_configs_updated_at (updated_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|e| AppError::Other(format!("初始化 MySQL 数据库配置表失败：{e}")))?;
    Ok(())
}

/// Ensure the `api_documents` and `api_endpoints` tables exist.
pub fn ensure_api_interface_schema(pool: &Pool) -> Result<()> {
    let mut conn = pool.get_conn().map_err(AppError::MySql)?;
    conn.query_drop(
        r#"
        CREATE TABLE IF NOT EXISTS api_documents (
            id                VARCHAR(191) NOT NULL,
            name              VARCHAR(255) NOT NULL,
            source_file_name  VARCHAR(512) NOT NULL DEFAULT '',
            format            VARCHAR(32) NOT NULL DEFAULT 'openapi',
            title             VARCHAR(512) NOT NULL DEFAULT '',
            version           VARCHAR(64) NOT NULL DEFAULT '',
            model_provider_id VARCHAR(191) NOT NULL DEFAULT '',
            endpoint_count    INT UNSIGNED NOT NULL DEFAULT 0,
            created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            KEY idx_api_documents_updated_at (updated_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|e| AppError::Other(format!("初始化 MySQL API 文档表失败：{e}")))?;

    conn.query_drop(
        r#"
        CREATE TABLE IF NOT EXISTS api_endpoints (
            id                   VARCHAR(191) NOT NULL,
            document_id          VARCHAR(191) NOT NULL,
            method               VARCHAR(16) NOT NULL,
            path                 VARCHAR(1024) NOT NULL,
            summary              VARCHAR(1024) NOT NULL DEFAULT '',
            operation_id         VARCHAR(512) NOT NULL DEFAULT '',
            tags                 VARCHAR(512) NOT NULL DEFAULT '',
            request_schema_json  MEDIUMTEXT NULL,
            response_schema_json MEDIUMTEXT NULL,
            sort_order           INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (id),
            KEY idx_api_endpoints_document (document_id),
            KEY idx_api_endpoints_order (document_id, sort_order)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|e| AppError::Other(format!("初始化 MySQL API 接口表失败：{e}")))?;
    Ok(())
}

// ── Internal utilities ────────────────────────────────────────────────────

/// Add `column_name` to `table_name` using `alter_sql` if the column is absent.
///
/// Uses `information_schema.columns` to avoid duplicate-column errors when
/// the migration is re-run on an already-migrated database.
fn ensure_column(
    conn: &mut mysql::PooledConn,
    table_name: &str,
    column_name: &str,
    alter_sql: &str,
) -> Result<()> {
    let exists: Option<u8> = conn
        .exec_first(
            r#"
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name   = ?
              AND column_name  = ?
            LIMIT 1
            "#,
            (table_name, column_name),
        )
        .map_err(|e| AppError::Other(format!("检查 MySQL 表字段失败：{e}")))?;

    if exists.is_none() {
        conn.query_drop(alter_sql)
            .map_err(|e| AppError::Other(format!("升级 MySQL 表字段失败：{e}")))?;
    }
    Ok(())
}
