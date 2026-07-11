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
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app_handle, request);
        return Err("当前平台不支持通过 WinRM 执行 Windows SSH 配置脚本。".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let req = winrm::normalize(request)?;
        tokio::spawn(async move {
            winrm::run_open_ssh_setup(app_handle, req).await;
        });
        Ok(())
    }
}

// ── RDP ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn rdp_open(request: RdpOpenRequest) -> Result<(), String> {
    rdp::open(request)
}

// ── SSH Session ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_connect(
    state: tauri::State<'_, SshState>,
    request: SshConnectRequest,
) -> Result<RemoteConnection, String> {
    let port = request.port.unwrap_or(22);
    let kind = request
        .kind
        .map(|k| k.trim().to_lowercase())
        .filter(|k| k == "host" || k == "vm")
        .unwrap_or_else(|| "host".to_string());

    crate::remote::ssh::connect(
        &state,
        request.host.trim().to_string(),
        port,
        request.username.trim().to_string(),
        request.password,
        request.label,
        kind,
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

// ── SFTP ──────────────────────────────────────────────────────────────────

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

#[tauri::command]
pub async fn ssh_read_file(
    state: tauri::State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<String, String> {
    crate::remote::ssh::read_file(&state, &connection_id, &path).await
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

// ── File watching ─────────────────────────────────────────────────────────

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
