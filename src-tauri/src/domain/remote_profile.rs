//! Remote machine profile domain models.

use serde::{Deserialize, Serialize};

/// SSH + optional RDP credentials for a remote host.
///
/// Ports are stored as strings for frontend compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMachineProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: String,
    pub rdp_port: Option<String>,
    pub username: String,
    pub password: String,
    pub last_connected_at: String,
}

/// SSH credentials for a specific Hyper-V VM reachable through a parent host.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperVVmCredentialProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: String,
    pub username: String,
    pub password: String,
    pub parent_profile_id: String,
    pub vm_id: String,
    pub vm_name: String,
    pub last_connected_at: String,
}
