use mysql::prelude::Queryable;
use mysql::{OptsBuilder, Pool};
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

    for column_name in ["password_secret", "password_key_version", "created_at"] {
        if column_exists(&mut conn, column_name)? {
            let sql = format!(
                "ALTER TABLE remote_machine_profiles DROP COLUMN {}",
                column_name
            );
            conn.query_drop(sql)
                .map_err(|err| format!("删除字段 {} 失败：{}", column_name, err))?;
            println!("DROPPED_COLUMN={}", column_name);
        } else {
            println!("COLUMN_NOT_FOUND={}", column_name);
        }
    }

    println!("DONE=1");
    Ok(())
}

fn column_exists(conn: &mut mysql::PooledConn, column_name: &str) -> Result<bool, String> {
    let exists: Option<u8> = conn
        .exec_first(
            r#"
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'remote_machine_profiles'
              AND column_name = ?
            LIMIT 1
            "#,
            (column_name,),
        )
        .map_err(|err| format!("检查字段 {} 失败：{}", column_name, err))?;
    Ok(exists.is_some())
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
