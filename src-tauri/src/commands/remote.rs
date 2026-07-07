//! 远程机器 SSH/SFTP 命令。
//!
//! 使用 russh（纯 Rust SSH 实现）+ russh-sftp。
//! Windows OpenSSH 的 SFTP 子系统使用 POSIX 风格路径：
//!   C:\  →  /C:/

use async_trait::async_trait;
use russh::client::{self, Config, Handle};
use russh::ChannelMsg;
use russh_keys::key::PublicKey;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

// ── SSH 客户端处理器 ──────────────────────────────────────────────────────

struct SshHandler;

#[async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    /// 始终信任服务器密钥（内网使用场景，可根据需要加入 known_hosts 校验）。
    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ── 状态 ──────────────────────────────────────────────────────────────────

pub(crate) struct SshConn {
    handle: Handle<SshHandler>,
}

pub struct SshState(pub Mutex<Option<SshConn>>);

impl SshState {
    pub fn new() -> Self {
        SshState(Mutex::new(None))
    }
}

// ── 前端可见数据类型 ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    /// SFTP 路径（/C:/Users/... 格式）
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

/// 将 Windows 盘符（`C:`）转换为 Windows OpenSSH SFTP 路径（`/C:/`）。
fn drive_to_sftp(drive: &str) -> String {
    let d = drive.trim().trim_end_matches([':', '\\', '/']);
    format!("/{}/", d)
}

/// 拼接 SFTP 路径（保证单斜杠分隔）。
fn sftp_join(parent: &str, child: &str) -> String {
    format!("{}/{}", parent.trim_end_matches('/'), child)
}

/// 执行一条远程命令并返回 stdout 输出。
async fn exec_cmd(handle: &Handle<SshHandler>, cmd: &str) -> Result<String, String> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel.exec(true, cmd).await.map_err(|e| e.to_string())?;

    let mut buf = Vec::new();
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => buf.extend_from_slice(&data),
            Some(ChannelMsg::Eof) | None => break,
            _ => {}
        }
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// 为单次操作开启一个新的 SFTP 会话。
async fn open_sftp(handle: &Handle<SshHandler>) -> Result<SftpSession, String> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| e.to_string())?;
    SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| e.to_string())
}

// ── Tauri 命令 ────────────────────────────────────────────────────────────

/// 建立 SSH 连接并完成密码认证。
#[tauri::command]
pub async fn ssh_connect(
    state: tauri::State<'_, SshState>,
    host: String,
    port: Option<u16>,
    username: String,
    password: String,
) -> Result<(), String> {
    let port = port.unwrap_or(22);
    let config = Arc::new(Config::default());

    let mut handle = client::connect(
        config,
        (host.trim().to_string(), port),
        SshHandler,
    )
    .await
    .map_err(|e| format!("SSH 连接失败 ({}:{}): {}", host.trim(), port, e))?;

    let authenticated = handle
        .authenticate_password(username.trim(), password)
        .await
        .map_err(|e| format!("认证错误: {}", e))?;

    if !authenticated {
        return Err("用户名或密码错误".to_string());
    }

    let mut guard = state.0.lock().await;
    *guard = Some(SshConn { handle });
    Ok(())
}

/// 断开当前 SSH 会话。
#[tauri::command]
pub async fn ssh_disconnect(state: tauri::State<'_, SshState>) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(conn) = guard.take() {
        let _ = conn
            .handle
            .disconnect(russh::Disconnect::ByApplication, "", "en-US")
            .await;
    }
    Ok(())
}

/// 获取目标 Windows 机器所有磁盘的 SFTP 路径列表，例如 `["/C:/", "/D:/"]`。
#[tauri::command]
pub async fn ssh_get_disks(state: tauri::State<'_, SshState>) -> Result<Vec<String>, String> {
    let guard = state.0.lock().await;
    let conn = guard.as_ref().ok_or("未连接")?;

    let raw = exec_cmd(
        &conn.handle,
        "wmic logicaldisk get name /value 2>nul",
    )
    .await
    .unwrap_or_default();

    let disks: Vec<String> = raw
        .lines()
        .filter_map(|l| {
            let l = l.trim();
            l.starts_with("Name=")
                .then(|| drive_to_sftp(l.trim_start_matches("Name=").trim()))
        })
        .collect();

    if disks.is_empty() {
        Ok(vec!["/C:/".to_string()])
    } else {
        Ok(disks)
    }
}

/// 列出指定 SFTP 路径下的文件和子目录（目录优先，按名称排序）。
#[tauri::command]
pub async fn ssh_list_dir(
    state: tauri::State<'_, SshState>,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let guard = state.0.lock().await;
    let conn = guard.as_ref().ok_or("未连接")?;

    let sftp = open_sftp(&conn.handle).await?;
    let entries = sftp
        .read_dir(&path)
        .await
        .map_err(|e| format!("列目录失败 ({}): {}", path, e))?;

    let mut result: Vec<FileEntry> = entries
        .into_iter()
        .map(|entry| {
            let name = entry.file_name();
            let is_dir = entry.file_type().is_dir();
            let size = Some(entry.metadata().len());
            let full_path = sftp_join(&path, &name);
            FileEntry { name, path: full_path, is_dir, size }
        })
        .collect();

    // 目录优先，同类按名称（忽略大小写）排序
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

/// 读取远程文件内容（UTF-8 / 宽字节 lossy 解码）。
#[tauri::command]
pub async fn ssh_read_file(
    state: tauri::State<'_, SshState>,
    path: String,
) -> Result<String, String> {
    let guard = state.0.lock().await;
    let conn = guard.as_ref().ok_or("未连接")?;

    let sftp = open_sftp(&conn.handle).await?;
    let mut file = sftp
        .open(&path)
        .await
        .map_err(|e| format!("打开文件失败 ({}): {}", path, e))?;

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| e.to_string())?;

    // 优先 UTF-8；失败时 lossy 解码（Windows GBK 等编码）
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// 覆盖写入远程文件内容。
#[tauri::command]
pub async fn ssh_write_file(
    state: tauri::State<'_, SshState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let guard = state.0.lock().await;
    let conn = guard.as_ref().ok_or("未连接")?;

    let sftp = open_sftp(&conn.handle).await?;
    let mut file = sftp
        .create(&path)
        .await
        .map_err(|e| format!("写入文件失败 ({}): {}", path, e))?;

    file.write_all(content.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

