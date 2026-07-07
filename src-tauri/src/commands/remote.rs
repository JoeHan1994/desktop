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
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
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
    handle: Arc<Handle<SshHandler>>,
    /// path → 取消令牌发送端；drop 即取消对应监视任务
    watchers: HashMap<String, tokio::sync::oneshot::Sender<()>>,
}

pub struct SshState(pub Mutex<Option<SshConn>>);

impl SshState {
    pub fn new() -> Self {
        SshState(Mutex::new(None))
    }
}

/// 文件变化事件载荷（通过 Tauri 事件总线推送到前端）。
#[derive(Clone, Serialize)]
pub struct FileChangedPayload {
    pub path: String,
    pub content: String,
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

/// SFTP 路径（/C:/Users/file.txt）→ Windows 路径（C:\\Users\\file.txt）
fn sftp_to_windows(sftp_path: &str) -> String {
    sftp_path.trim_start_matches('/').replace('/', "\\")
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
    *guard = Some(SshConn { handle: Arc::new(handle), watchers: HashMap::new() });
    Ok(())
}

/// 断开当前 SSH 会话。
#[tauri::command]
pub async fn ssh_disconnect(state: tauri::State<'_, SshState>) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(conn) = guard.take() {
        // 取消全部文件监视任务（drop sender 即发出取消信号）
        drop(conn.watchers);
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

// ── 实时文件监视 ──────────────────────────────────────────────────────────

/// 将 SFTP 路径转为 PowerShell 字符串中安全的 Windows 路径（转义单引号）。
fn ps_safe_path(sftp_path: &str) -> String {
    sftp_to_windows(sftp_path).replace('\'', "''")
}

/// 后台任务：在远端执行 FileSystemWatcher，文件变化时读取内容并通过
/// Tauri 事件总线推送给前端。
async fn watch_file_task(
    handle: Arc<Handle<SshHandler>>,
    path: String,
    app_handle: tauri::AppHandle,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let win_path = ps_safe_path(&path);

    // PowerShell 脚本：利用 FileSystemWatcher.WaitForChanged 等待变化，
    // 每 3 秒超时循环一次，以便 cancel 信号能及时响应。
    let ps = format!(
        "$p='{win_path}'; \
         $d=[IO.Path]::GetDirectoryName($p); \
         $f=[IO.Path]::GetFileName($p); \
         $w=New-Object IO.FileSystemWatcher $d,$f; \
         $w.NotifyFilter='LastWrite'; \
         $w.EnableRaisingEvents=$true; \
         while($true){{ \
           $r=$w.WaitForChanged('Changed',3000); \
           if(!$r.TimedOut){{Write-Host 'CHANGED'}} \
         }}"
    );
    let cmd = format!("powershell -NonInteractive -Command \"{}\"", ps);

    let mut channel = match handle.channel_open_session().await {
        Ok(c) => c,
        Err(_) => return,
    };
    if channel.exec(true, cmd).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            // 收到取消信号 → 关闭 SSH 通道（远端进程随之退出）
            _ = &mut cancel_rx => {
                let _ = channel.close().await;
                break;
            }
            // 读取远端输出
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        if String::from_utf8_lossy(&data).contains("CHANGED") {
                            // 读取最新文件内容并推送事件
                            if let Ok(sftp) = open_sftp(&*handle).await {
                                if let Ok(mut file) = sftp.open(&path).await {
                                    let mut buf = Vec::new();
                                    if file.read_to_end(&mut buf).await.is_ok() {
                                        let _ = app_handle.emit_all(
                                            "file-changed",
                                            FileChangedPayload {
                                                path: path.clone(),
                                                content: String::from_utf8_lossy(&buf).into_owned(),
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }
                    None | Some(ChannelMsg::Eof) => break,
                    _ => {}
                }
            }
        }
    }
}

/// 开始监视指定文件的变化（基于 Windows FileSystemWatcher，事件驱动推送）。
#[tauri::command]
pub async fn ssh_watch_file(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SshState>,
    path: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    let conn = guard.as_mut().ok_or("未连接")?;

    // 停止已存在的同路径监视任务（drop sender → cancel_rx 完成）
    conn.watchers.remove(&path);

    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    let handle = conn.handle.clone();
    let path_clone = path.clone();

    tokio::spawn(async move {
        watch_file_task(handle, path_clone, app_handle, cancel_rx).await;
    });

    conn.watchers.insert(path, cancel_tx);
    Ok(())
}

/// 停止指定文件的监视任务。
#[tauri::command]
pub async fn ssh_unwatch_file(
    state: tauri::State<'_, SshState>,
    path: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    let conn = guard.as_mut().ok_or("未连接")?;
    conn.watchers.remove(&path);
    Ok(())
}

