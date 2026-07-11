//! Remote module: SSH state, shared data types, and low-level SSH helpers.
//!
//! Sub-modules handle distinct concerns:
//! - `ssh`   — connection lifecycle + SFTP file operations.
//! - `rdp`   — Windows Remote Desktop integration.
//! - `winrm` — WinRM PowerShell execution + remote file watching.

pub mod rdp;
pub mod ssh;
pub mod winrm;

use std::collections::HashMap;
use std::sync::Arc;

use russh::client::Handle;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

// ── SSH session handler (always-trust strategy for intranet use) ──────────

pub(crate) struct SshHandler;

#[async_trait::async_trait]
impl russh::client::Handler for SshHandler {
    type Error = russh::Error;

    /// Accept any server host key (suitable for private/trusted networks).
    ///
    /// To harden: persist accepted keys and reject unknown fingerprints.
    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ── Session container ─────────────────────────────────────────────────────

pub(crate) struct SshConn {
    pub handle: Arc<Handle<SshHandler>>,
    /// Mapping of SFTP path → cancel sender; dropping the sender cancels the watcher task.
    pub watchers: HashMap<String, tokio::sync::oneshot::Sender<()>>,
}

/// Tauri managed state: a map of `connection_id → SshConn`.
pub struct SshState(pub Mutex<HashMap<String, SshConn>>);

impl SshState {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

// ── Shared data types ─────────────────────────────────────────────────────

/// File entry in a remote directory listing.
#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    /// SFTP path (`/C:/Users/…` format for Windows OpenSSH).
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// An active SSH connection as reported to the frontend.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnection {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    /// `"host"` | `"vm"`
    pub kind: String,
    pub parent_connection_id: Option<String>,
    pub parent_profile_id: Option<String>,
    pub vm_id: Option<String>,
}

/// Hyper-V virtual machine as reported to the frontend.
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

/// Payload emitted on the `file-changed` Tauri event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangedPayload {
    pub connection_id: String,
    pub path: String,
    /// `"snapshot"` (full content) | `"append"` (tail delta).
    pub kind: String,
    pub content: String,
}

// ── Request DTOs ──────────────────────────────────────────────────────────

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

// ── Low-level SSH helpers (shared by ssh.rs, winrm.rs) ───────────────────

/// Obtain a clone of the `Arc<Handle>` for `connection_id`, or return an error.
pub(crate) async fn connection_handle(
    state: &SshState,
    connection_id: &str,
) -> Result<Arc<Handle<SshHandler>>, String> {
    let guard = state.0.lock().await;
    guard
        .get(connection_id)
        .map(|c| c.handle.clone())
        .ok_or_else(|| "未连接".to_string())
}

/// Execute a remote shell command and return its stdout as a `String`.
pub(crate) async fn exec_cmd(handle: &Handle<SshHandler>, cmd: &str) -> Result<String, String> {
    use russh::ChannelMsg;
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

/// Open a fresh SFTP session over a new SSH channel.
pub(crate) async fn open_sftp(
    handle: &Handle<SshHandler>,
) -> Result<russh_sftp::client::SftpSession, String> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| e.to_string())?;
    russh_sftp::client::SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| e.to_string())
}

// ── Path helpers ──────────────────────────────────────────────────────────

/// Windows drive letter (`"C:"`) → Windows OpenSSH SFTP path (`"/C:/"`)
pub(crate) fn drive_to_sftp(drive: &str) -> String {
    let d = drive.trim().trim_end_matches([':', '\\', '/']);
    format!("/{d}/")
}

/// SFTP path (`"/C:/Users/file.txt"`) → Windows path (`"C:\\Users\\file.txt"`)
pub(crate) fn sftp_to_windows(sftp_path: &str) -> String {
    sftp_path.trim_start_matches('/').replace('/', "\\")
}

/// Join two SFTP path segments with a single forward slash.
pub(crate) fn sftp_join(parent: &str, child: &str) -> String {
    format!("{}/{}", parent.trim_end_matches('/'), child)
}

// ── Connection helpers ────────────────────────────────────────────────────

use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) fn make_connection_id(kind: &str) -> String {
    let next = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
    format!("{}-{next}", kind.trim().to_lowercase())
}

pub(crate) fn connection_label(
    label: Option<String>,
    host: &str,
    port: u16,
    username: &str,
) -> String {
    label
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("{}@{}:{}", username.trim(), host.trim(), port))
}
