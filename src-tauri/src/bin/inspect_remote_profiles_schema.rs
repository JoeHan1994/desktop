use mysql::prelude::Queryable;
use mysql::{OptsBuilder, Pool, Row};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct MySqlConfig {
    host: String,
    port: Option<u16>,
    database: String,
    username: String,
    password: String,
    connect_timeout_seconds: Option<u64>,
}

fn main() -> Result<(), String> {
    let config_path = app_dir()?.join("mysql.toml");
    let config = read_config(&config_path)?;
    let pool = mysql_pool(&config)?;
    let mut conn = pool
        .get_conn()
        .map_err(|err| format!("连接 MySQL 失败：{}", err))?;

    println!("TABLE=remote_machine_profiles");
    println!("COLUMNS");
    let rows: Vec<Row> = conn
        .query(
            r#"
            SELECT column_name, column_type, is_nullable, column_default, column_key, extra
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'remote_machine_profiles'
            ORDER BY ordinal_position
            "#,
        )
        .map_err(|err| format!("读取字段失败：{}", err))?;
    for row in rows {
        let (name, column_type, nullable, default_value, key, extra): (
            String,
            String,
            String,
            Option<String>,
            String,
            String,
        ) = mysql::from_row(row);
        println!(
            "{} | {} | nullable={} | default={} | key={} | extra={}",
            name,
            column_type,
            nullable,
            default_value.unwrap_or_else(|| "NULL".to_string()),
            key,
            extra
        );
    }

    println!("INDEXES");
    let indexes: Vec<Row> = conn
        .query("SHOW INDEX FROM remote_machine_profiles")
        .map_err(|err| format!("读取索引失败：{}", err))?;
    for row in indexes {
        let key_name: String = row.get("Key_name").unwrap_or_default();
        let column_name: String = row.get("Column_name").unwrap_or_default();
        let non_unique: u8 = row.get("Non_unique").unwrap_or_default();
        println!("{} | {} | non_unique={}", key_name, column_name, non_unique);
    }

    Ok(())
}

fn app_dir() -> Result<PathBuf, String> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|path| path.join("com.vectorvision.app"))
        .ok_or_else(|| "无法读取 APPDATA 环境变量".to_string())
}

fn read_config(path: &PathBuf) -> Result<MySqlConfig, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("读取 MySQL 配置文件失败：{}；{}", path.display(), err))?;
    toml::from_str(&raw)
        .map_err(|err| format!("解析 MySQL 配置文件失败：{}；{}", path.display(), err))
}

fn mysql_pool(config: &MySqlConfig) -> Result<Pool, String> {
    let mut options = OptsBuilder::new()
        .ip_or_hostname(Some(config.host.trim().to_string()))
        .tcp_port(config.port.unwrap_or(3306))
        .db_name(Some(config.database.trim().to_string()))
        .user(Some(config.username.trim().to_string()))
        .pass(Some(config.password.trim().to_string()))
        .prefer_socket(false);
    if let Some(seconds) = config.connect_timeout_seconds {
        options = options.tcp_connect_timeout(Some(std::time::Duration::from_secs(seconds)));
    }
    Pool::new(options).map_err(|err| format!("初始化 MySQL 连接池失败：{}", err))
}
