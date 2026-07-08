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
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
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
const OPENSSH_SETUP_SCRIPT: &str = include_str!("../../../scripts/configure-windows-ssh-server.ps1");
const WINRM_OPEN_SSH_SETUP_OUTPUT_EVENT: &str = "winrm-open-ssh-setup-output";

/// 文件变化事件载荷（通过 Tauri 事件总线推送到前端）。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangedPayload {
    pub connection_id: String,
    pub path: String,
    pub kind: String,
    pub content: String,
}

/// WinRM 执行 OpenSSH 配置脚本时推送到前端的终端输出事件。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WinRmOpenSshSetupOutputPayload {
    pub run_id: String,
    pub stream: String,
    pub line: String,
    pub done: bool,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpOpenRequest {
    pub host: String,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WinRmOpenSshSetupRequest {
    pub run_id: String,
    pub host: String,
    pub winrm_port: Option<u16>,
    pub username: String,
    pub password: String,
    pub ssh_port: Option<u16>,
    pub firewall_profile: Option<String>,
    pub set_network_private: Option<bool>,
    pub enable_password_authentication: Option<bool>,
}

#[derive(Clone)]
struct NormalizedWinRmOpenSshSetupRequest {
    run_id: String,
    host: String,
    winrm_port: u16,
    username: String,
    password: String,
    ssh_port: u16,
    firewall_profile: String,
    set_network_private: bool,
    enable_password_authentication: bool,
}

struct RdpTarget {
    host: String,
    address: String,
    username: Option<String>,
    password: Option<String>,
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

fn rdp_target(request: RdpOpenRequest) -> Result<RdpTarget, String> {
    let host = request.host.trim();
    if host.is_empty() {
        return Err("RDP 主机不能为空".to_string());
    }
    if host
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '"' || ch == '\'')
    {
        return Err("RDP 主机名包含不支持的字符".to_string());
    }

    let port = request.port.unwrap_or(3389);
    if port == 0 {
        return Err("RDP 端口必须在 1-65535 之间".to_string());
    }

    let username = request
        .username
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let password = request.password.filter(|value| !value.is_empty());

    Ok(RdpTarget {
        host: host.to_string(),
        address: format!("{}:{}", host, port),
        username,
        password,
    })
}

fn normalize_winrm_open_ssh_setup_request(
    request: WinRmOpenSshSetupRequest,
) -> Result<NormalizedWinRmOpenSshSetupRequest, String> {
    let run_id = request.run_id.trim().to_string();
    if run_id.is_empty() {
        return Err("WinRM run id 不能为空".to_string());
    }

    let host = request.host.trim().to_string();
    if host.is_empty() {
        return Err("WinRM 主机不能为空".to_string());
    }
    if host
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '"' || ch == '\'')
    {
        return Err("WinRM 主机名包含不支持的字符".to_string());
    }

    let username = request.username.trim().to_string();
    if username.is_empty() {
        return Err("WinRM 用户名不能为空".to_string());
    }

    let firewall_profile = request
        .firewall_profile
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Any".to_string());
    if !matches!(
        firewall_profile.as_str(),
        "Any" | "Domain" | "Private" | "Public"
    ) {
        return Err("防火墙配置文件必须是 Any、Domain、Private 或 Public".to_string());
    }

    Ok(NormalizedWinRmOpenSshSetupRequest {
        run_id,
        host,
        winrm_port: request.winrm_port.unwrap_or(5985),
        username,
        password: request.password,
        ssh_port: request.ssh_port.unwrap_or(22),
        firewall_profile,
        set_network_private: request.set_network_private.unwrap_or(true),
        enable_password_authentication: request.enable_password_authentication.unwrap_or(true),
    })
}

fn ps_single_quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn ps_bool(value: bool) -> &'static str {
    if value {
        "$true"
    } else {
        "$false"
    }
}

fn build_winrm_open_ssh_setup_script(request: &NormalizedWinRmOpenSshSetupRequest) -> String {
    format!(
        r#"$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$InformationPreference = 'Continue'

function Write-SetupLine {{
    param([string]$Message)
    [Console]::Out.WriteLine($Message)
}}

$targetHost = {host}
$winRmPort = {winrm_port}
$username = {username}
$passwordPlain = {password}
$securePassword = ConvertTo-SecureString $passwordPlain -AsPlainText -Force
$credential = [pscredential]::new($username, $securePassword)
$scriptContent = @'
{script_content}
'@
$sshPort = {ssh_port}
$firewallProfile = {firewall_profile}
$setNetworkPrivate = {set_network_private}
$enablePasswordAuthentication = {enable_password_authentication}
$session = $null

try {{
    Write-SetupLine ("[winrm] Connecting to {{0}}:{{1}} ..." -f $targetHost, $winRmPort)
    $sessionOptions = New-PSSessionOption -OperationTimeout 180000
    $session = New-PSSession -ComputerName $targetHost -Port $winRmPort -Credential $credential -SessionOption $sessionOptions -ErrorAction Stop

    Write-SetupLine '[winrm] Connected. Uploading and running OpenSSH setup script...'
    Invoke-Command -Session $session -ScriptBlock {{
        param(
            [string]$Content,
            [int]$SshPort,
            [string]$FirewallProfile,
            [bool]$SetNetworkPrivate,
            [bool]$EnablePasswordAuthentication
        )

        $ErrorActionPreference = 'Stop'
        $remoteScript = Join-Path $env:TEMP 'configure-windows-ssh-server.ps1'
        Set-Content -LiteralPath $remoteScript -Value $Content -Encoding ASCII

        $arguments = @(
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            $remoteScript,
            '-Port',
            [string]$SshPort,
            '-FirewallProfile',
            $FirewallProfile
        )
        if ($SetNetworkPrivate) {{ $arguments += '-SetNetworkPrivate' }}
        if ($EnablePasswordAuthentication) {{ $arguments += '-EnablePasswordAuthentication' }}

        & powershell.exe @arguments 2>&1 | ForEach-Object {{ [string]$_ }}
        $exitCode = if ($null -ne $LASTEXITCODE) {{ $LASTEXITCODE }} else {{ 0 }}
        if ($exitCode -ne 0) {{
            throw "OpenSSH setup script exited with code $exitCode"
        }}
    }} -ArgumentList $scriptContent, $sshPort, $firewallProfile, $setNetworkPrivate, $enablePasswordAuthentication -ErrorAction Stop |
        ForEach-Object {{ Write-SetupLine ([string]$_) }}

    Write-SetupLine '[winrm] OpenSSH setup completed.'
    exit 0
}}
catch {{
    Write-SetupLine ("[winrm] ERROR: " + ($_ | Out-String).Trim())
    exit 1
}}
finally {{
    if ($null -ne $session) {{
        Remove-PSSession -Session $session -ErrorAction SilentlyContinue
    }}
}}
"#,
        host = ps_single_quoted(&request.host),
        winrm_port = request.winrm_port,
        username = ps_single_quoted(&request.username),
        password = ps_single_quoted(&request.password),
        script_content = OPENSSH_SETUP_SCRIPT.trim_end(),
        ssh_port = request.ssh_port,
        firewall_profile = ps_single_quoted(&request.firewall_profile),
        set_network_private = ps_bool(request.set_network_private),
        enable_password_authentication = ps_bool(request.enable_password_authentication),
    )
}

fn emit_winrm_open_ssh_setup_output(
    app_handle: &tauri::AppHandle,
    run_id: &str,
    stream: &str,
    line: impl Into<String>,
    done: bool,
    exit_code: Option<i32>,
    error: Option<String>,
) {
    let _ = app_handle.emit_all(
        WINRM_OPEN_SSH_SETUP_OUTPUT_EVENT,
        WinRmOpenSshSetupOutputPayload {
            run_id: run_id.to_string(),
            stream: stream.to_string(),
            line: line.into(),
            done,
            exit_code,
            error,
        },
    );
}

async fn run_winrm_open_ssh_setup_task(
    app_handle: tauri::AppHandle,
    request: NormalizedWinRmOpenSshSetupRequest,
) {
    let run_id = request.run_id.clone();
    let script = build_winrm_open_ssh_setup_script(&request);
    emit_winrm_open_ssh_setup_output(
        &app_handle,
        &run_id,
        "status",
        format!(
            "[local] Starting WinRM OpenSSH setup for {}:{}",
            request.host, request.winrm_port
        ),
        false,
        None,
        None,
    );

    let mut child = match Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            emit_winrm_open_ssh_setup_output(
                &app_handle,
                &run_id,
                "error",
                "",
                true,
                None,
                Some(format!("启动 PowerShell 失败: {}", err)),
            );
            return;
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(err) = stdin.write_all(script.as_bytes()).await {
            emit_winrm_open_ssh_setup_output(
                &app_handle,
                &run_id,
                "error",
                "",
                true,
                None,
                Some(format!("写入 PowerShell 脚本失败: {}", err)),
            );
            return;
        }
    }

    let stdout_task = child.stdout.take().map(|stdout| {
        let app_handle = app_handle.clone();
        let run_id = run_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_winrm_open_ssh_setup_output(&app_handle, &run_id, "stdout", line, false, None, None);
            }
        })
    });

    let stderr_task = child.stderr.take().map(|stderr| {
        let app_handle = app_handle.clone();
        let run_id = run_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_winrm_open_ssh_setup_output(&app_handle, &run_id, "stderr", line, false, None, None);
            }
        })
    });

    let status = child.wait().await;
    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }

    match status {
        Ok(status) if status.success() => emit_winrm_open_ssh_setup_output(
            &app_handle,
            &run_id,
            "status",
            "[local] WinRM OpenSSH setup finished successfully.",
            true,
            status.code(),
            None,
        ),
        Ok(status) => emit_winrm_open_ssh_setup_output(
            &app_handle,
            &run_id,
            "error",
            "[local] WinRM OpenSSH setup failed.",
            true,
            status.code(),
            Some(format!("PowerShell exited with code {:?}", status.code())),
        ),
        Err(err) => emit_winrm_open_ssh_setup_output(
            &app_handle,
            &run_id,
            "error",
            "",
            true,
            None,
            Some(format!("等待 PowerShell 执行结果失败: {}", err)),
        ),
    }
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

/// 通过本机 PowerShell/WinRM 在目标 Windows 机器上执行 OpenSSH 配置脚本。
#[tauri::command]
pub async fn winrm_run_open_ssh_setup(
    app_handle: tauri::AppHandle,
    request: WinRmOpenSshSetupRequest,
) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app_handle, request);
        Err("当前平台不支持通过 WinRM 执行 Windows SSH 配置脚本。".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        let request = normalize_winrm_open_ssh_setup_request(request)?;
        tokio::spawn(async move {
            run_winrm_open_ssh_setup_task(app_handle, request).await;
        });
        Ok(())
    }
}

/// 打开本机 Windows Remote Desktop 客户端，用于在 SSH 启用前进入目标机器。
#[tauri::command]
pub fn rdp_open(request: RdpOpenRequest) -> Result<(), String> {
    let target = rdp_target(request)?;

    #[cfg(target_os = "windows")]
    {
        if let (Some(username), Some(password)) = (&target.username, &target.password) {
            let credential_targets = if target.address == target.host {
                vec![target.host.clone()]
            } else {
                vec![target.host.clone(), target.address.clone()]
            };

            for credential_target in credential_targets {
                std::process::Command::new("cmdkey.exe")
                    .arg(format!("/generic:TERMSRV/{}", credential_target))
                    .arg(format!("/user:{}", username))
                    .arg(format!("/pass:{}", password))
                    .status()
                    .map_err(|e| format!("写入 RDP 凭据失败: {}", e))?
                    .success()
                    .then_some(())
                    .ok_or_else(|| "写入 RDP 凭据失败。".to_string())?;
            }
        }

        std::process::Command::new("mstsc.exe")
            .arg(format!("/v:{}", target.address))
            .spawn()
            .map_err(|e| format!("打开远程桌面失败: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = target;
        Err("当前平台不支持自动打开 Windows 远程桌面。".to_string())
    }
}

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

