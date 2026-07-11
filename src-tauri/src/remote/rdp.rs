//! Windows Remote Desktop integration.
//!
//! Uses `cmdkey.exe` for credential pre-seeding and `mstsc.exe` for launch.
//! Non-Windows platforms return a descriptive error.

use serde::Deserialize;

// ── Request DTO ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpOpenRequest {
    pub host: String,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
}

// ── Public API ────────────────────────────────────────────────────────────

/// Open Windows Remote Desktop to `request.host`.
///
/// On Windows: seeds credentials via `cmdkey.exe`, then launches `mstsc.exe`.
/// On other platforms: returns an error.
pub fn open(request: RdpOpenRequest) -> Result<(), String> {
    let target = validate(request)?;

    #[cfg(target_os = "windows")]
    return open_windows(target);

    #[cfg(not(target_os = "windows"))]
    {
        let _ = target;
        Err("当前平台不支持自动打开 Windows 远程桌面。".to_string())
    }
}

// ── Private helpers ───────────────────────────────────────────────────────

struct RdpTarget {
    host: String,
    address: String,
    username: Option<String>,
    password: Option<String>,
}

fn validate(req: RdpOpenRequest) -> Result<RdpTarget, String> {
    let host = req.host.trim();
    if host.is_empty() {
        return Err("RDP 主机不能为空".to_string());
    }
    if host
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '"' || ch == '\'')
    {
        return Err("RDP 主机名包含不支持的字符".to_string());
    }
    let port = req.port.unwrap_or(3389);
    if port == 0 {
        return Err("RDP 端口必须在 1-65535 之间".to_string());
    }
    Ok(RdpTarget {
        host: host.to_string(),
        address: format!("{host}:{port}"),
        username: req.username.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()),
        password: req.password.filter(|v| !v.is_empty()),
    })
}

#[cfg(target_os = "windows")]
fn open_windows(target: RdpTarget) -> Result<(), String> {
    if let (Some(username), Some(password)) = (&target.username, &target.password) {
        // Seed credentials for both bare host and host:port forms.
        let targets = if target.address == target.host {
            vec![target.host.clone()]
        } else {
            vec![target.host.clone(), target.address.clone()]
        };
        for t in targets {
            let ok = std::process::Command::new("cmdkey.exe")
                .arg(format!("/generic:TERMSRV/{t}"))
                .arg(format!("/user:{username}"))
                .arg(format!("/pass:{password}"))
                .status()
                .map_err(|e| format!("写入 RDP 凭据失败: {e}"))?
                .success();
            if !ok {
                return Err("写入 RDP 凭据失败。".to_string());
            }
        }
    }
    std::process::Command::new("mstsc.exe")
        .arg(format!("/v:{}", target.address))
        .spawn()
        .map_err(|e| format!("打开远程桌面失败: {e}"))?;
    Ok(())
}
