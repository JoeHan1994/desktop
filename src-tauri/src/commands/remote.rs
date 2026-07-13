//! 远程机器 SSH/SFTP 命令（薄包装层）。
//!
//! 所有业务逻辑委托给 `crate::remote::ssh`、`crate::remote::rdp`、
//! `crate::remote::winrm` 子模块，本文件只负责 Tauri 命令注册与参数透传。

use crate::remote::{
    rdp::{self, RdpOpenRequest},
    winrm::{self, WinRmSetupRequest},
    FileEntry, HyperVVirtualMachine, RemoteConnection, SshConnectRequest, SshState,
};

// ── WinRM ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn winrm_run_open_ssh_setup(
    app_handle: tauri::AppHandle,
    request: WinRmSetupRequest,
) -> Result<(), String> {
    let normalized = winrm::normalize(request)?;
    tokio::spawn(winrm::run_open_ssh_setup(app_handle, normalized));
    Ok(())
}

// ── RDP ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn rdp_open(request: RdpOpenRequest) -> Result<(), String> {
    rdp::open(request)
}

// ── SSH Connect / Disconnect ──────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_connect(
    state: tauri::State<'_, SshState>,
    request: SshConnectRequest,
) -> Result<RemoteConnection, String> {
    crate::remote::ssh::connect(
        &state,
        request.host,
        request.port.unwrap_or(22),
        request.username,
        request.password,
        request.label,
        request.kind.unwrap_or_else(|| "host".to_string()),
        request.parent_connection_id,
        request.parent_profile_id,
        request.vm_id,
    )
    .await
}

#[tauri::command]
pub async fn ssh_disconnect(
    state: tauri::State<'_, SshState>,
    connection_id: String,
) -> Result<(), String> {
    crate::remote::ssh::disconnect(&state, &connection_id).await
}

// ── Disk / Directory listing ──────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_get_disks(
    state: tauri::State<'_, SshState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    crate::remote::ssh::get_disks(&state, &connection_id).await
}

#[tauri::command]
pub async fn ssh_list_dir(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    crate::remote::ssh::list_dir(&state, &connection_id, &path).await
}

// ── Hyper-V ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_list_hyperv_vms(
    state: tauri::State<'_, SshState>,
    connection_id: String,
) -> Result<Vec<HyperVVirtualMachine>, String> {
    crate::remote::ssh::list_hyperv_vms(&state, &connection_id).await
}

#[tauri::command]
pub async fn ssh_set_hyperv_vm_state(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    vm_id: String,
    action: String,
) -> Result<(), String> {
    crate::remote::ssh::set_hyperv_vm_state(&state, &connection_id, &vm_id, &action).await
}

// ── File read / write ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_read_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<String, String> {
    crate::remote::ssh::read_file(&state, &connection_id, &path).await
}

/// 读取远程文件原始字节，返回 base64 字符串，用于下载文件。
#[tauri::command]
pub async fn ssh_read_file_bytes(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<String, String> {
    crate::remote::ssh::read_file_bytes(&state, &connection_id, &path).await
}

#[tauri::command]
pub async fn ssh_write_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    crate::remote::ssh::write_file(&state, &connection_id, &path, &content).await
}

// ── File watch ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_watch_file(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    crate::remote::ssh::watch_file(app_handle, &state, &connection_id, &path).await
}

#[tauri::command]
pub async fn ssh_unwatch_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    crate::remote::ssh::unwatch_file(&state, &connection_id, &path).await
}

// ── SSH exec command ──────────────────────────────────────────────────────

/// 在远程机器上执行一条 shell 命令，返回合并后的 stdout + stderr 内容。
#[tauri::command]
pub async fn ssh_exec_command(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    command: String,
    cwd: Option<String>,
) -> Result<String, String> {
    crate::remote::ssh::exec_command(&state, &connection_id, &command, cwd.as_deref()).await
}
