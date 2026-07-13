//! SSH connection management and SFTP file operations.
//!
//! All public functions accept `&SshState` (or `Arc<Handle>`) directly,
//! keeping them decoupled from Tauri's `State<>` wrapper.

use std::sync::Arc;

use russh::client;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

use crate::text_file::{decode_lossy_text_file, ensure_supported_text_path};

use super::{
    connection_handle, drive_to_sftp, exec_cmd, make_connection_id, connection_label,
    open_sftp, sftp_join, FileEntry, HyperVVirtualMachine, RemoteConnection,
    SshConn, SshHandler, SshState,
};

// ── Connect / Disconnect ──────────────────────────────────────────────────

pub async fn connect(
    state: &SshState,
    host: String,
    port: u16,
    username: String,
    password: String,
    label: Option<String>,
    kind: String,
    parent_connection_id: Option<String>,
    parent_profile_id: Option<String>,
    vm_id: Option<String>,
) -> Result<RemoteConnection, String> {
    let config = Arc::new(client::Config::default());
    let mut handle = client::connect(config, (host.as_str(), port), SshHandler)
        .await
        .map_err(|e| format!("SSH 连接失败 ({host}:{port}): {e}"))?;

    let authenticated = handle
        .authenticate_password(&username, &password)
        .await
        .map_err(|e| format!("认证错误: {e}"))?;

    if !authenticated {
        return Err("用户名或密码错误".to_string());
    }

    let connection = RemoteConnection {
        id: make_connection_id(&kind),
        label: connection_label(label, &host, port, &username),
        host,
        port,
        username,
        kind,
        parent_connection_id,
        parent_profile_id,
        vm_id,
    };

    let mut guard = state.0.lock().await;
    guard.insert(
        connection.id.clone(),
        SshConn {
            handle: Arc::new(handle),
            watchers: std::collections::HashMap::new(),
        },
    );
    Ok(connection)
}

pub async fn disconnect(state: &SshState, connection_id: &str) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(conn) = guard.remove(connection_id) {
        drop(conn.watchers); // cancel all file watchers
        let _ = conn
            .handle
            .disconnect(russh::Disconnect::ByApplication, "", "en-US")
            .await;
    }
    Ok(())
}

// ── Disk / Directory listing ──────────────────────────────────────────────

pub async fn get_disks(
    state: &SshState,
    connection_id: &str,
) -> Result<Vec<String>, String> {
    let handle = connection_handle(state, connection_id).await?;
    let raw = exec_cmd(&handle, "wmic logicaldisk get name /value 2>nul")
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

pub async fn list_dir(
    state: &SshState,
    connection_id: &str,
    path: &str,
) -> Result<Vec<FileEntry>, String> {
    let handle = connection_handle(state, connection_id).await?;
    let sftp = open_sftp(&handle).await?;
    let entries = sftp
        .read_dir(path)
        .await
        .map_err(|e| format!("列目录失败 ({path}): {e}"))?;

    let mut result: Vec<FileEntry> = entries
        .into_iter()
        .map(|e| {
            let name = e.file_name();
            let is_dir = e.file_type().is_dir();
            let size = Some(e.metadata().len());
            let full_path = sftp_join(path, &name);
            FileEntry { name, path: full_path, is_dir, size }
        })
        .collect();

    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(result)
}

// ── File read / write ─────────────────────────────────────────────────────

pub async fn read_file(
    state: &SshState,
    connection_id: &str,
    path: &str,
) -> Result<String, String> {
    ensure_supported_text_path(path)?;
    let handle = connection_handle(state, connection_id).await?;
    let sftp = open_sftp(&handle).await?;
    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| format!("打开文件失败 ({path}): {e}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).await.map_err(|e| e.to_string())?;
    decode_lossy_text_file(path, buf)
}

pub async fn write_file(
    state: &SshState,
    connection_id: &str,
    path: &str,
    content: &str,
) -> Result<(), String> {
    let handle = connection_handle(state, connection_id).await?;
    let sftp = open_sftp(&handle).await?;
    let mut file = sftp
        .create(path)
        .await
        .map_err(|e| format!("写入文件失败 ({path}): {e}"))?;
    file.write_all(content.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Hyper-V ───────────────────────────────────────────────────────────────

pub async fn list_hyperv_vms(
    state: &SshState,
    connection_id: &str,
) -> Result<Vec<HyperVVirtualMachine>, String> {
    let handle = connection_handle(state, connection_id).await?;
    let cmd = concat!(
        "powershell -NoProfile -NonInteractive -Command \"",
        "$ErrorActionPreference='Stop'; ",
        "$vms=@(Get-VM | ForEach-Object { ",
        "$vm=$_; $ips=@(); ",
        "try { $ips=@(Get-VMNetworkAdapter -VMName $vm.Name | ForEach-Object { $_.IPAddresses } | Where-Object { $_ }) } catch { $ips=@() }; ",
        "[PSCustomObject]@{ id=[string]$vm.Id; name=[string]$vm.Name; state=[string]$vm.State; status=[string]$vm.Status; ",
        "generation=[int]$vm.Generation; uptime=[string]$vm.Uptime; memoryAssigned=[int64]$vm.MemoryAssigned; ",
        "cpuUsage=[int]$vm.CPUUsage; path=[string]$vm.Path; ipAddresses=@($ips) } }); ",
        "$vms | ConvertTo-Json -Depth 5 -Compress\"",
    );
    let raw = exec_cmd(&handle, cmd).await?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("解析 Hyper-V VM 列表失败: {e}"))?;
    let items = match value {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Null => Vec::new(),
        v => vec![v],
    };
    items
        .into_iter()
        .map(|item| {
            serde_json::from_value::<HyperVVirtualMachine>(item)
                .map_err(|e| format!("解析 Hyper-V VM 条目失败: {e}"))
        })
        .collect()
}

pub async fn set_hyperv_vm_state(
    state: &SshState,
    connection_id: &str,
    vm_id: &str,
    action: &str,
) -> Result<(), String> {
    let handle = connection_handle(state, connection_id).await?;
    let vm_id_safe = vm_id.trim().replace('\'', "''");
    if vm_id_safe.is_empty() {
        return Err("VM ID 不能为空".to_string());
    }
    let ps_cmd = match action.trim().to_lowercase().as_str() {
        "start" => "Start-VM -VM $vm -Confirm:$false | Out-Null",
        "stop" => "Stop-VM -VM $vm -Force -Confirm:$false | Out-Null",
        _ => return Err("不支持的 Hyper-V 操作".to_string()),
    };
    let cmd = format!(
        "powershell -NoProfile -NonInteractive -Command \
         \"$ErrorActionPreference='Stop'; $vm=Get-VM -Id '{vm_id_safe}'; {ps_cmd}\""
    );
    exec_cmd(&handle, &cmd).await?;
    Ok(())
}

// ── File watch helpers (used by winrm.rs watch task) ─────────────────────

pub async fn read_from_offset(
    handle: &russh::client::Handle<SshHandler>,
    path: &str,
    offset: u64,
) -> Result<(String, u64), String> {
    let sftp = open_sftp(handle).await?;
    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| format!("打开文件失败 ({path}): {e}"))?;
    if offset > 0 {
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| e.to_string())?;
    }
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).await.map_err(|e| e.to_string())?;
    let next_offset = offset + buf.len() as u64;
    let content = decode_lossy_text_file(path, buf)?;
    Ok((content, next_offset))
}

// ── File watch registration ───────────────────────────────────────────────

pub async fn watch_file(
    app_handle: tauri::AppHandle,
    state: &SshState,
    connection_id: &str,
    path: &str,
) -> Result<(), String> {
    ensure_supported_text_path(path)?;
    let mut guard = state.0.lock().await;
    let conn = guard.get_mut(connection_id).ok_or("未连接")?;

    // Replace any existing watcher for this path (drop = cancel).
    conn.watchers.remove(path);

    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    let handle = conn.handle.clone();
    let conn_id = connection_id.to_string();
    let path_str = path.to_string();

    tokio::spawn(async move {
        crate::remote::winrm::watch_file_task(handle, conn_id, path_str, app_handle, cancel_rx)
            .await;
    });

    conn.watchers.insert(path.to_string(), cancel_tx);
    Ok(())
}

pub async fn unwatch_file(
    state: &SshState,
    connection_id: &str,
    path: &str,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    let conn = guard.get_mut(connection_id).ok_or("未连接")?;
    conn.watchers.remove(path);
    Ok(())
}
