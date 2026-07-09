//! MySQL-backed shared profile storage configuration.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use mysql::prelude::Queryable;
use mysql::{OptsBuilder, Pool};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Deserialize;
use std::path::{Path, PathBuf};

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

#[derive(Debug, Deserialize)]
struct MySqlProfileConfig {
    host: String,
    port: Option<u16>,
    database: String,
    username: String,
    password: String,
    encryption_key_base64: String,
    connect_timeout_seconds: Option<u64>,
}

struct SecretCryptoMessages {
    invalid_ciphertext: &'static str,
    invalid_nonce: &'static str,
    nonce_length: &'static str,
    decrypt: &'static str,
    utf8: &'static str,
}

pub struct MySqlProfileState {
    pub config_path: PathBuf,
    pub pool: Option<Pool>,
    cipher: Option<Aes256Gcm>,
    pub init_error: Option<String>,
}

impl MySqlProfileState {
    pub fn load(config_dir: &Path) -> Self {
        let config_path = config_dir.join(CONFIG_FILE_NAME);
        let mut init_error = None;

        if let Err(err) = std::fs::create_dir_all(config_dir) {
            init_error = Some(format!("无法创建 MySQL 配置目录：{}", err));
        } else if !config_path.exists() {
            if let Err(err) = std::fs::write(&config_path, DEFAULT_CONFIG) {
                init_error = Some(format!("无法创建 MySQL 配置文件：{}", err));
            }
        }

        if let Some(error) = init_error {
            return Self {
                config_path,
                pool: None,
                cipher: None,
                init_error: Some(error),
            };
        }

        match Self::read_config(&config_path) {
            Ok((pool, cipher)) => Self {
                config_path,
                pool: Some(pool),
                cipher: Some(cipher),
                init_error: None,
            },
            Err(error) => Self {
                config_path,
                pool: None,
                cipher: None,
                init_error: Some(error),
            },
        }
    }

    pub fn require_pool(&self) -> Result<&Pool, String> {
        self.pool.as_ref().ok_or_else(|| self.config_error())
    }

    pub fn config_error(&self) -> String {
        self.init_error.clone().unwrap_or_else(|| {
            format!(
                "MySQL 远程机器配置未就绪，请检查配置文件：{}",
                self.config_path.display()
            )
        })
    }

    pub fn encrypt_password(&self, password: &str) -> Result<(String, String), String> {
        self.encrypt_secret(password, "远程机器密码加密失败")
    }

    pub fn decrypt_password(&self, ciphertext: &str, nonce: &str) -> Result<String, String> {
        self.decrypt_secret(
            ciphertext,
            nonce,
            SecretCryptoMessages {
                invalid_ciphertext: "远程机器密码密文不是有效 Base64",
                invalid_nonce: "远程机器密码 nonce 不是有效 Base64",
                nonce_length: "远程机器密码 nonce 长度无效",
                decrypt: "远程机器密码解密失败，请确认本机配置文件中的 encryption_key_base64 与写入时一致",
                utf8: "远程机器密码不是有效 UTF-8",
            },
        )
    }

    pub fn encrypt_vm_password(&self, password: &str) -> Result<(String, String), String> {
        self.encrypt_secret(password, "Hyper-V VM 密码加密失败")
    }

    pub fn decrypt_vm_password(&self, ciphertext: &str, nonce: &str) -> Result<String, String> {
        self.decrypt_secret(
            ciphertext,
            nonce,
            SecretCryptoMessages {
                invalid_ciphertext: "Hyper-V VM 密码密文不是有效 Base64",
                invalid_nonce: "Hyper-V VM 密码 nonce 不是有效 Base64",
                nonce_length: "Hyper-V VM 密码 nonce 长度无效",
                decrypt: "Hyper-V VM 密码解密失败，请确认本机配置文件中的 encryption_key_base64 与写入时一致",
                utf8: "Hyper-V VM 密码不是有效 UTF-8",
            },
        )
    }

    pub fn encrypt_api_key(&self, api_key: &str) -> Result<(String, String), String> {
        self.encrypt_secret(api_key, "Model Provider API Key 加密失败")
    }

    pub fn decrypt_api_key(&self, ciphertext: &str, nonce: &str) -> Result<String, String> {
        self.decrypt_secret(
            ciphertext,
            nonce,
            SecretCryptoMessages {
                invalid_ciphertext: "Model Provider API Key 密文不是有效 Base64",
                invalid_nonce: "Model Provider API Key nonce 不是有效 Base64",
                nonce_length: "Model Provider API Key nonce 长度无效",
                decrypt: "Model Provider API Key 解密失败，请确认本机配置文件中的 encryption_key_base64 与写入时一致",
                utf8: "Model Provider API Key 不是有效 UTF-8",
            },
        )
    }

    fn encrypt_secret(
        &self,
        secret: &str,
        encrypt_error: &str,
    ) -> Result<(String, String), String> {
        if secret.is_empty() {
            return Ok((String::new(), String::new()));
        }
        let cipher = self.cipher.as_ref().ok_or_else(|| self.config_error())?;
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, secret.as_bytes())
            .map_err(|_| encrypt_error.to_string())?;
        Ok((BASE64.encode(ciphertext), BASE64.encode(nonce_bytes)))
    }

    fn decrypt_secret(
        &self,
        ciphertext: &str,
        nonce: &str,
        messages: SecretCryptoMessages,
    ) -> Result<String, String> {
        if ciphertext.is_empty() || nonce.is_empty() {
            return Ok(String::new());
        }
        let cipher = self.cipher.as_ref().ok_or_else(|| self.config_error())?;
        let cipher_bytes = BASE64
            .decode(ciphertext)
            .map_err(|_| messages.invalid_ciphertext.to_string())?;
        let nonce_bytes = BASE64
            .decode(nonce)
            .map_err(|_| messages.invalid_nonce.to_string())?;
        if nonce_bytes.len() != 12 {
            return Err(messages.nonce_length.to_string());
        }
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce_bytes), cipher_bytes.as_ref())
            .map_err(|_| messages.decrypt.to_string())?;
        String::from_utf8(plaintext).map_err(|_| messages.utf8.to_string())
    }

    fn read_config(config_path: &Path) -> Result<(Pool, Aes256Gcm), String> {
        let raw = std::fs::read_to_string(config_path).map_err(|err| {
            format!(
                "无法读取 MySQL 配置文件：{}；{}",
                config_path.display(),
                err
            )
        })?;
        let config: MySqlProfileConfig = toml::from_str(&raw)
            .map_err(|err| format!("MySQL 配置文件格式错误：{}；{}", config_path.display(), err))?;

        let username = config.username.trim();
        let password = config.password.trim();
        let key = config.encryption_key_base64.trim();
        if username.is_empty()
            || password.is_empty()
            || password == "REPLACE_WITH_MYSQL_PASSWORD"
            || key.is_empty()
            || key == "REPLACE_WITH_32_BYTE_BASE64_KEY"
        {
            return Err(format!(
                "MySQL 配置未完成，请更新配置文件：{}",
                config_path.display()
            ));
        }

        let key_bytes = BASE64.decode(key).map_err(|_| {
            format!(
                "MySQL 配置中的 encryption_key_base64 不是有效 Base64：{}",
                config_path.display()
            )
        })?;
        if key_bytes.len() != 32 {
            return Err(format!(
                "MySQL 配置中的 encryption_key_base64 解码后必须是 32 字节：{}",
                config_path.display()
            ));
        }
        let cipher = Aes256Gcm::new_from_slice(&key_bytes)
            .map_err(|_| "初始化远程机器密码加密器失败".to_string())?;

        let mut options = OptsBuilder::new()
            .ip_or_hostname(Some(config.host.trim().to_string()))
            .tcp_port(config.port.unwrap_or(3306))
            .db_name(Some(config.database.trim().to_string()))
            .user(Some(username.to_string()))
            .pass(Some(password.to_string()))
            .prefer_socket(false);
        if let Some(seconds) = config.connect_timeout_seconds {
            options = options.tcp_connect_timeout(Some(std::time::Duration::from_secs(seconds)));
        }
        let pool = Pool::new(options).map_err(|err| format!("初始化 MySQL 连接池失败：{}", err))?;

        Ok((pool, cipher))
    }
}

pub fn ensure_schema(pool: &Pool) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
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
            updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uk_remote_machine_identity (host, ssh_port, username),
            KEY idx_remote_machine_last_connected_at (last_connected_at),
            KEY idx_remote_machine_host (host)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|err| format!("初始化 MySQL 远程机器表失败：{}", err))?;
    ensure_column(
        &mut conn,
        "remote_machine_profiles",
        "password_ciphertext",
        "ALTER TABLE remote_machine_profiles ADD COLUMN password_ciphertext TEXT NULL AFTER username",
    )?;
    ensure_column(
        &mut conn,
        "remote_machine_profiles",
        "password_nonce",
        "ALTER TABLE remote_machine_profiles ADD COLUMN password_nonce VARCHAR(64) NULL AFTER password_ciphertext",
    )?;
    Ok(())
}

pub fn ensure_hyperv_vm_credentials_schema(pool: &Pool) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
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
            updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            UNIQUE KEY uk_hyperv_vm_credential_identity (parent_profile_id, vm_id),
            KEY idx_hyperv_vm_credentials_parent (parent_profile_id),
            KEY idx_hyperv_vm_credentials_last_connected_at (last_connected_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        "#,
    )
    .map_err(|err| format!("初始化 MySQL Hyper-V VM 凭据表失败：{}", err))?;
    ensure_column(
        &mut conn,
        "hyperv_vm_credentials",
        "password_ciphertext",
        "ALTER TABLE hyperv_vm_credentials ADD COLUMN password_ciphertext TEXT NULL AFTER username",
    )?;
    ensure_column(
        &mut conn,
        "hyperv_vm_credentials",
        "password_nonce",
        "ALTER TABLE hyperv_vm_credentials ADD COLUMN password_nonce VARCHAR(64) NULL AFTER password_ciphertext",
    )?;
    ensure_column(
        &mut conn,
        "hyperv_vm_credentials",
        "parent_profile_id",
        "ALTER TABLE hyperv_vm_credentials ADD COLUMN parent_profile_id VARCHAR(191) NOT NULL AFTER password_nonce",
    )?;
    ensure_column(
        &mut conn,
        "hyperv_vm_credentials",
        "vm_id",
        "ALTER TABLE hyperv_vm_credentials ADD COLUMN vm_id VARCHAR(191) NOT NULL AFTER parent_profile_id",
    )?;
    ensure_column(
        &mut conn,
        "hyperv_vm_credentials",
        "vm_name",
        "ALTER TABLE hyperv_vm_credentials ADD COLUMN vm_name VARCHAR(255) NOT NULL DEFAULT '' AFTER vm_id",
    )?;
    Ok(())
}

pub fn ensure_model_provider_schema(pool: &Pool) -> Result<(), String> {
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;
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
            updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (id),
            KEY idx_model_providers_provider (provider),
            KEY idx_model_providers_updated_at (updated_at)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
        "#,
    )
    .map_err(|err| format!("初始化 MySQL Model Provider 表失败：{}", err))?;
    ensure_column(
        &mut conn,
        "model_providers",
        "api_key_ciphertext",
        "ALTER TABLE model_providers ADD COLUMN api_key_ciphertext TEXT NULL AFTER model",
    )?;
    ensure_column(
        &mut conn,
        "model_providers",
        "api_key_nonce",
        "ALTER TABLE model_providers ADD COLUMN api_key_nonce VARCHAR(64) NULL AFTER api_key_ciphertext",
    )?;
    ensure_column(
        &mut conn,
        "model_providers",
        "api_key_key_version",
        "ALTER TABLE model_providers ADD COLUMN api_key_key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER api_key_nonce",
    )?;
    Ok(())
}

fn ensure_column(
    conn: &mut mysql::PooledConn,
    table_name: &str,
    column_name: &str,
    alter_sql: &str,
) -> Result<(), String> {
    let exists: Option<u8> = conn
        .exec_first(
            r#"
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
                            AND table_name = ?
              AND column_name = ?
            LIMIT 1
            "#,
            (table_name, column_name),
        )
        .map_err(|err| format!("检查 MySQL 表字段失败：{}", err))?;
    if exists.is_none() {
        conn.query_drop(alter_sql)
            .map_err(|err| format!("升级 MySQL 表字段失败：{}", err))?;
    }
    Ok(())
}
