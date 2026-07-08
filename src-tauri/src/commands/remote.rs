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
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::text_file::{decode_lossy_text_file, ensure_supported_text_path};

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

pub struct SshState(pub Mutex<HashMap<String, SshConn>>);

impl SshState {
    pub fn new() -> Self {
        SshState(Mutex::new(HashMap::new()))
    }
}

static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

/// 文件变化事件载荷（通过 Tauri 事件总线推送到前端）。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangedPayload {
    pub connection_id: String,
    pub path: String,
    pub kind: String,
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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnection {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub kind: String,
    pub parent_connection_id: Option<String>,
    pub parent_profile_id: Option<String>,
    pub vm_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectRequest {
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: String,
    pub label: Option<String>,
    pub kind: Option<String>,
    pub parent_connection_id: Option<String>,
    pub parent_profile_id: Option<String>,
    pub vm_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HyperVVirtualMachine {
    pub id: String,
    pub name: String,
    pub state: String,
    pub status: String,
    pub generation: Option<u32>,
    pub uptime: String,
    pub memory_assigned: Option<u64>,
    pub cpu_usage: Option<u32>,
    pub path: String,
    pub ip_addresses: Vec<String>,
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

fn make_connection_id(kind: &str) -> String {
    let next = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}", kind.trim().to_lowercase(), next)
}

fn connection_label(label: Option<String>, host: &str, port: u16, username: &str) -> String {
    label
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("{}@{}:{}", username.trim(), host.trim(), port))
}

async fn connection_handle(
    state: &tauri::State<'_, SshState>,
    connection_id: &str,
) -> Result<Arc<Handle<SshHandler>>, String> {
    let guard = state.0.lock().await;
    guard
        .get(connection_id)
        .map(|conn| conn.handle.clone())
        .ok_or_else(|| "未连接".to_string())
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
    request: SshConnectRequest,
) -> Result<RemoteConnection, String> {
    let port = request.port.unwrap_or(22);
    let config = Arc::new(Config::default());
    let host_value = request.host.trim().to_string();
    let username_value = request.username.trim().to_string();
    let kind_value = request.kind
        .map(|value| value.trim().to_lowercase())
        .filter(|value| value == "host" || value == "vm")
        .unwrap_or_else(|| "host".to_string());

    let mut handle = client::connect(
        config,
        (host_value.clone(), port),
        SshHandler,
    )
    .await
    .map_err(|e| format!("SSH 连接失败 ({}:{}): {}", host_value, port, e))?;

    let authenticated = handle
        .authenticate_password(&username_value, request.password)
        .await
        .map_err(|e| format!("认证错误: {}", e))?;

    if !authenticated {
        return Err("用户名或密码错误".to_string());
    }

    let connection = RemoteConnection {
        id: make_connection_id(&kind_value),
        label: connection_label(request.label, &host_value, port, &username_value),
        host: host_value,
        port,
        username: username_value,
        kind: kind_value,
        parent_connection_id: request.parent_connection_id,
        parent_profile_id: request.parent_profile_id,
        vm_id: request.vm_id,
    };

    let mut guard = state.0.lock().await;
    guard.insert(
        connection.id.clone(),
        SshConn {
            handle: Arc::new(handle),
            watchers: HashMap::new(),
        },
    );
    Ok(connection)
}

/// 断开指定 SSH 会话。
#[tauri::command]
pub async fn ssh_disconnect(
    state: tauri::State<'_, SshState>,
    connection_id: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(conn) = guard.remove(&connection_id) {
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
pub async fn ssh_get_disks(
    state: tauri::State<'_, SshState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    let handle = connection_handle(&state, &connection_id).await?;

    let raw = exec_cmd(
        &handle,
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
    connection_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let handle = connection_handle(&state, &connection_id).await?;

    let sftp = open_sftp(&handle).await?;
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
            FileEntry {
                name,
                path: full_path,
                is_dir,
                size,
            }
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

/// 读取远程文本文件内容（拒绝可执行文件和二进制文件）。
#[tauri::command]
pub async fn ssh_read_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<String, String> {
    ensure_supported_text_path(&path)?;

    let handle = connection_handle(&state, &connection_id).await?;

    let sftp = open_sftp(&handle).await?;
    let mut file = sftp
        .open(&path)
        .await
        .map_err(|e| format!("打开文件失败 ({}): {}", path, e))?;

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| e.to_string())?;

    decode_lossy_text_file(&path, buf)
}

/// 覆盖写入远程文件内容。
#[tauri::command]
pub async fn ssh_write_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let handle = connection_handle(&state, &connection_id).await?;

    let sftp = open_sftp(&handle).await?;
    let mut file = sftp
        .create(&path)
        .await
        .map_err(|e| format!("写入文件失败 ({}): {}", path, e))?;

    file.write_all(content.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取指定 Hyper-V 宿主机中的 VM 列表。
#[tauri::command]
pub async fn ssh_list_hyperv_vms(
    state: tauri::State<'_, SshState>,
    connection_id: String,
) -> Result<Vec<HyperVVirtualMachine>, String> {
    let handle = connection_handle(&state, &connection_id).await?;
    let cmd = concat!(
        "powershell -NoProfile -NonInteractive -Command \"",
        "$ErrorActionPreference='Stop'; ",
        "$vms=@(Get-VM | ForEach-Object { ",
        "$vm=$_; $ips=@(); ",
        "try { ",
        "$ips=@(Get-VMNetworkAdapter -VMName $vm.Name | ",
        "ForEach-Object { $_.IPAddresses } | Where-Object { $_ }) ",
        "} catch { $ips=@() }; ",
        "[PSCustomObject]@{ ",
        "id=[string]$vm.Id; ",
        "name=[string]$vm.Name; ",
        "state=[string]$vm.State; ",
        "status=[string]$vm.Status; ",
        "generation=[int]$vm.Generation; ",
        "uptime=[string]$vm.Uptime; ",
        "memoryAssigned=[int64]$vm.MemoryAssigned; ",
        "cpuUsage=[int]$vm.CPUUsage; ",
        "path=[string]$vm.Path; ",
        "ipAddresses=@($ips) ",
        "} ",
        "}); ",
        "$vms | ConvertTo-Json -Depth 5 -Compress",
        "\"",
    );

    let raw = exec_cmd(&handle, cmd).await?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let value: Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("解析 Hyper-V VM 列表失败: {}", e))?;

    let items = match value {
        Value::Array(items) => items,
        Value::Null => Vec::new(),
        item => vec![item],
    };

    items
        .into_iter()
        .map(|item| {
            serde_json::from_value::<HyperVVirtualMachine>(item)
                .map_err(|e| format!("解析 Hyper-V VM 条目失败: {}", e))
        })
        .collect()
}

/// 启动或停止指定 Hyper-V VM。
#[tauri::command]
pub async fn ssh_set_hyperv_vm_state(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    vm_id: String,
    action: String,
) -> Result<(), String> {
    let handle = connection_handle(&state, &connection_id).await?;
    let vm_id_value = vm_id.trim().replace('\'', "''");
    if vm_id_value.is_empty() {
        return Err("VM ID 不能为空".to_string());
    }

    let command = match action.trim().to_lowercase().as_str() {
        "start" => "Start-VM -VM $vm -Confirm:$false | Out-Null",
        "stop" => "Stop-VM -VM $vm -Force -Confirm:$false | Out-Null",
        _ => return Err("不支持的 Hyper-V 操作".to_string()),
    };

    let cmd = format!(
        "powershell -NoProfile -NonInteractive -Command \"$ErrorActionPreference='Stop'; $vm=Get-VM -Id '{}'; {}\"",
        vm_id_value,
        command,
    );
    exec_cmd(&handle, &cmd).await?;
    Ok(())
}

// ── 实时文件监视 ──────────────────────────────────────────────────────────

/// 将 SFTP 路径转为 PowerShell 字符串中安全的 Windows 路径（转义单引号）。
fn ps_safe_path(sftp_path: &str) -> String {
    sftp_to_windows(sftp_path).replace('\'', "''")
}

async fn read_remote_text_from_offset(
    handle: &Handle<SshHandler>,
    path: &str,
    offset: u64,
) -> Result<(String, u64), String> {
    let sftp = open_sftp(handle).await?;
    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| format!("打开文件失败 ({}): {}", path, e))?;

    if offset > 0 {
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| e.to_string())?;
    }

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| e.to_string())?;

    let next_offset = offset + buf.len() as u64;
    let content = decode_lossy_text_file(path, buf)?;
    Ok((content, next_offset))
}

/// 后台任务：在远端执行 FileSystemWatcher，文件变化时读取内容并通过
/// Tauri 事件总线推送给前端。
async fn watch_file_task(
    handle: Arc<Handle<SshHandler>>,
    connection_id: String,
    path: String,
    app_handle: tauri::AppHandle,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let win_path = ps_safe_path(&path);
    let mut last_offset = match read_remote_text_from_offset(&handle, &path, 0).await {
        Ok((_, offset)) => offset,
        Err(_) => 0,
    };

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
                     if(!$r.TimedOut){{ \
                         try{{$len=(Get-Item -LiteralPath $p).Length}}catch{{$len=-1}}; \
                         Write-Host \"CHANGED:$len\" \
                     }} \
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
                        let output = String::from_utf8_lossy(&data);
                        for line in output.lines().filter(|line| line.contains("CHANGED")) {
                            let remote_len = line
                                .split_once(':')
                                .and_then(|(_, value)| value.trim().parse::<u64>().ok());
                            let read_offset = match remote_len {
                                Some(size) if size <= last_offset => 0,
                                _ => last_offset,
                            };
                            let kind = if read_offset == 0 { "snapshot" } else { "append" };

                            if let Ok((content, next_offset)) = read_remote_text_from_offset(&handle, &path, read_offset).await {
                                if kind == "append" && content.is_empty() {
                                    continue;
                                }
                                last_offset = next_offset;
                                let _ = app_handle.emit_all(
                                    "file-changed",
                                    FileChangedPayload {
                                        connection_id: connection_id.clone(),
                                        path: path.clone(),
                                        kind: kind.to_string(),
                                        content,
                                    },
                                );
                            } else if read_offset > 0 {
                                if let Ok((content, next_offset)) = read_remote_text_from_offset(&handle, &path, 0).await {
                                    last_offset = next_offset;
                                    let _ = app_handle.emit_all(
                                        "file-changed",
                                        FileChangedPayload {
                                            connection_id: connection_id.clone(),
                                            path: path.clone(),
                                            kind: "snapshot".to_string(),
                                            content,
                                        },
                                    );
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
    connection_id: String,
    path: String,
) -> Result<(), String> {
    ensure_supported_text_path(&path)?;

    let mut guard = state.0.lock().await;
    let conn = guard.get_mut(&connection_id).ok_or("未连接")?;

    // 停止已存在的同路径监视任务（drop sender → cancel_rx 完成）
    conn.watchers.remove(&path);

    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    let handle = conn.handle.clone();
    let connection_id_clone = connection_id.clone();
    let path_clone = path.clone();

    tokio::spawn(async move {
        watch_file_task(handle, connection_id_clone, path_clone, app_handle, cancel_rx).await;
    });

    conn.watchers.insert(path, cancel_tx);
    Ok(())
}

/// 停止指定文件的监视任务。
#[tauri::command]
pub async fn ssh_unwatch_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    let conn = guard.get_mut(&connection_id).ok_or("未连接")?;
    conn.watchers.remove(&path);
    Ok(())
}

