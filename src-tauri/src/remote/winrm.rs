//! WinRM PowerShell execution and remote file watching.
//!
//! # WinRM Setup
//! `run_open_ssh_setup` launches a local `powershell.exe` process that
//! connects to the remote Windows machine via WinRM and runs the bundled
//! OpenSSH configuration script. Each output line is streamed back to the
//! frontend as a `winrm-open-ssh-setup-output` Tauri event.
//!
//! # File watching
//! `watch_file_task` opens an SSH channel and runs a PowerShell
//! `FileSystemWatcher` on the remote machine. File-changed events are read
//! via a polling loop and pushed as `file-changed` Tauri events.

use std::process::Stdio;
use std::sync::Arc;

use russh::ChannelMsg;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::{sftp_to_windows, FileChangedPayload, SshHandler};
use crate::remote::ssh::read_from_offset;

// ── Constants ─────────────────────────────────────────────────────────────

const WINRM_OUTPUT_EVENT: &str = "winrm-open-ssh-setup-output";
const OPENSSH_SETUP_SCRIPT: &str =
    include_str!("../../../scripts/configure-windows-ssh-server.ps1");

// ── WinRM Request ─────────────────────────────────────────────────────────

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WinRmSetupRequest {
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

/// Validated, normalised form of `WinRmSetupRequest`.
pub struct NormalizedWinRmSetupRequest {
    pub run_id: String,
    pub host: String,
    pub winrm_port: u16,
    pub username: String,
    pub password: String,
    pub ssh_port: u16,
    pub firewall_profile: String,
    pub set_network_private: bool,
    pub enable_password_authentication: bool,
}

// ── Event payload ─────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WinRmOutputPayload {
    pub run_id: String,
    pub stream: String,
    pub line: String,
    pub done: bool,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

// ── Public API ────────────────────────────────────────────────────────────

/// Validate and normalise a `WinRmSetupRequest`.
pub fn normalize(req: WinRmSetupRequest) -> Result<NormalizedWinRmSetupRequest, String> {
    let run_id = req.run_id.trim().to_string();
    if run_id.is_empty() {
        return Err("WinRM run_id 不能为空".to_string());
    }
    let host = req.host.trim().to_string();
    if host.is_empty() {
        return Err("WinRM 主机不能为空".to_string());
    }
    if host
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '"' || ch == '\'')
    {
        return Err("WinRM 主机名包含不支持的字符".to_string());
    }
    let username = req.username.trim().to_string();
    if username.is_empty() {
        return Err("WinRM 用户名不能为空".to_string());
    }
    let firewall_profile = req
        .firewall_profile
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "Any".to_string());
    if !matches!(
        firewall_profile.as_str(),
        "Any" | "Domain" | "Private" | "Public"
    ) {
        return Err("防火墙配置文件必须是 Any、Domain、Private 或 Public".to_string());
    }
    Ok(NormalizedWinRmSetupRequest {
        run_id,
        host,
        winrm_port: req.winrm_port.unwrap_or(5985),
        username,
        password: req.password,
        ssh_port: req.ssh_port.unwrap_or(22),
        firewall_profile,
        set_network_private: req.set_network_private.unwrap_or(true),
        enable_password_authentication: req.enable_password_authentication.unwrap_or(true),
    })
}

/// Launch a local PowerShell process that connects via WinRM and runs the
/// OpenSSH setup script on the remote machine. Returns immediately; progress
/// is streamed via Tauri events.
pub async fn run_open_ssh_setup(
    app_handle: tauri::AppHandle,
    req: NormalizedWinRmSetupRequest,
) {
    let run_id = req.run_id.clone();
    let script = build_script(&req);

    emit(
        &app_handle,
        &run_id,
        "status",
        format!("[local] Starting WinRM OpenSSH setup for {}:{}", req.host, req.winrm_port),
        false,
        None,
        None,
    );

    let mut child = match Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            emit(&app_handle, &run_id, "error", "", true, None, Some(format!("启动 PowerShell 失败: {e}")));
            return;
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(e) = stdin.write_all(script.as_bytes()).await {
            emit(&app_handle, &run_id, "error", "", true, None, Some(format!("写入 PowerShell 脚本失败: {e}")));
            return;
        }
    }

    let stdout_task = child.stdout.take().map(|out| {
        let (ah, rid) = (app_handle.clone(), run_id.clone());
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit(&ah, &rid, "stdout", line, false, None, None);
            }
        })
    });
    let stderr_task = child.stderr.take().map(|err| {
        let (ah, rid) = (app_handle.clone(), run_id.clone());
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit(&ah, &rid, "stderr", line, false, None, None);
            }
        })
    });

    let status = child.wait().await;
    for task in [stdout_task, stderr_task].into_iter().flatten() {
        let _ = task.await;
    }

    match status {
        Ok(s) if s.success() => emit(
            &app_handle, &run_id, "status",
            "[local] WinRM OpenSSH setup finished successfully.", true, s.code(), None,
        ),
        Ok(s) => emit(
            &app_handle, &run_id, "error",
            "[local] WinRM OpenSSH setup failed.", true, s.code(),
            Some(format!("PowerShell exited with code {:?}", s.code())),
        ),
        Err(e) => emit(
            &app_handle, &run_id, "error", "", true, None,
            Some(format!("等待 PowerShell 结果失败: {e}")),
        ),
    }
}

/// Background task: run a `FileSystemWatcher` on the remote machine and push
/// incremental file content to the frontend via `file-changed` events.
pub async fn watch_file_task(
    handle: Arc<russh::client::Handle<SshHandler>>,
    connection_id: String,
    path: String,
    app_handle: tauri::AppHandle,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let win_path = sftp_to_windows(&path).replace('\'', "''");

    let mut last_offset = read_from_offset(&handle, &path, 0)
        .await
        .map(|(_, off)| off)
        .unwrap_or(0);

    let ps = format!(
        "$p='{win_path}'; \
         $d=[IO.Path]::GetDirectoryName($p); $f=[IO.Path]::GetFileName($p); \
         $w=New-Object IO.FileSystemWatcher $d,$f; \
         $w.NotifyFilter='LastWrite'; $w.EnableRaisingEvents=$true; \
         while($true){{ \
             $r=$w.WaitForChanged('Changed',3000); \
             if(!$r.TimedOut){{ \
                 try{{$len=(Get-Item -LiteralPath $p).Length}}catch{{$len=-1}}; \
                 Write-Host \"CHANGED:$len\" \
             }} \
         }}"
    );
    let cmd = format!("powershell -NonInteractive -Command \"{ps}\"");

    let mut channel = match handle.channel_open_session().await {
        Ok(c) => c,
        Err(_) => return,
    };
    if channel.exec(true, cmd.as_str()).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                let _ = channel.close().await;
                break;
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        let output = String::from_utf8_lossy(&data);
                        for line in output.lines().filter(|l| l.contains("CHANGED")) {
                            let remote_len = line
                                .split_once(':')
                                .and_then(|(_, v)| v.trim().parse::<u64>().ok());
                            let read_offset = match remote_len {
                                Some(size) if size <= last_offset => 0,
                                _ => last_offset,
                            };
                            let kind = if read_offset == 0 { "snapshot" } else { "append" };
                            if let Ok((content, next)) = read_from_offset(&handle, &path, read_offset).await {
                                if kind == "append" && content.is_empty() {
                                    continue;
                                }
                                last_offset = next;
                                let _ = app_handle.emit_all("file-changed", FileChangedPayload {
                                    connection_id: connection_id.clone(),
                                    path: path.clone(),
                                    kind: kind.to_string(),
                                    content,
                                });
                            } else if read_offset > 0 {
                                if let Ok((content, next)) = read_from_offset(&handle, &path, 0).await {
                                    last_offset = next;
                                    let _ = app_handle.emit_all("file-changed", FileChangedPayload {
                                        connection_id: connection_id.clone(),
                                        path: path.clone(),
                                        kind: "snapshot".to_string(),
                                        content,
                                    });
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

// ── Private helpers ───────────────────────────────────────────────────────

fn emit(
    app_handle: &tauri::AppHandle,
    run_id: &str,
    stream: &str,
    line: impl Into<String>,
    done: bool,
    exit_code: Option<i32>,
    error: Option<String>,
) {
    let _ = app_handle.emit_all(
        WINRM_OUTPUT_EVENT,
        WinRmOutputPayload {
            run_id: run_id.to_string(),
            stream: stream.to_string(),
            line: line.into(),
            done,
            exit_code,
            error,
        },
    );
}

fn ps_single_quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn ps_bool(value: bool) -> &'static str {
    if value { "$true" } else { "$false" }
}

fn build_script(req: &NormalizedWinRmSetupRequest) -> String {
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
        param([string]$Content, [int]$SshPort, [string]$FirewallProfile, [bool]$SetNetworkPrivate, [bool]$EnablePasswordAuthentication)
        $ErrorActionPreference = 'Stop'
        $remoteScript = Join-Path $env:TEMP 'configure-windows-ssh-server.ps1'
        Set-Content -LiteralPath $remoteScript -Value $Content -Encoding ASCII
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $remoteScript, '-Port', [string]$SshPort, '-FirewallProfile', $FirewallProfile)
        if ($SetNetworkPrivate) {{ $arguments += '-SetNetworkPrivate' }}
        if ($EnablePasswordAuthentication) {{ $arguments += '-EnablePasswordAuthentication' }}
        & powershell.exe @arguments 2>&1 | ForEach-Object {{ [string]$_ }}
        $exitCode = if ($null -ne $LASTEXITCODE) {{ $LASTEXITCODE }} else {{ 0 }}
        if ($exitCode -ne 0) {{ throw "OpenSSH setup script exited with code $exitCode" }}
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
    if ($null -ne $session) {{ Remove-PSSession -Session $session -ErrorAction SilentlyContinue }}
}}
"#,
        host = ps_single_quoted(&req.host),
        winrm_port = req.winrm_port,
        username = ps_single_quoted(&req.username),
        password = ps_single_quoted(&req.password),
        script_content = OPENSSH_SETUP_SCRIPT.trim_end(),
        ssh_port = req.ssh_port,
        firewall_profile = ps_single_quoted(&req.firewall_profile),
        set_network_private = ps_bool(req.set_network_private),
        enable_password_authentication = ps_bool(req.enable_password_authentication),
    )
}
