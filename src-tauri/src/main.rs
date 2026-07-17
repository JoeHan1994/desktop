// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ── Module declarations ───────────────────────────────────────────────────
// Ordered by dependency: foundational modules first, then feature modules.

mod commands;  // Tauri command handlers (thin wrappers)
mod crypto;    // AES-256-GCM cipher
mod db;        // SQLite state + schema migrations
mod domain;    // Pure domain models (no I/O)
mod embed;     // Deterministic pseudo-embedding + FNV-1a hash
mod error;     // Unified AppError + Result alias
mod mysql_profiles; // MySQL connection pool + schema migrations
mod pipeline;  // Ingestion / processing / vectorisation pipeline service
mod remote;    // SSH / SFTP / RDP / WinRM implementations
mod store;     // Backward-compat re-exports from domain/
mod text_file; // Binary detection + text codec

// Alias command modules to avoid name collisions with top-level `pipeline` and `remote`.
use commands::pipeline as pipeline_cmds;
use commands::remote as remote_cmds;
use commands::{remote_profiles, settings, vector_db};
use db::DbState;
use domain::pipeline::AppState;
use mysql_profiles::MySqlProfileState;
use remote::SshState;
use tauri::Manager;
use std::sync::Mutex;

/// 持有 Python sidecar 子进程句柄，供 app 退出时终止。
#[allow(dead_code)]
struct SidecarState(Mutex<Option<tauri::api::process::CommandChild>>);

// ── Windows-specific DWM window styling ──────────────────────────────────

/// Apply VS Code-style rounded corners via Windows 11 DWM DWMWCP_ROUND.
/// The OS handles corner rendering and shadow projection along the curve.
#[cfg(target_os = "windows")]
fn apply_window_style(window: &tauri::Window) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};

    // DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_ROUND = 2
    const DWMWA_WINDOW_CORNER_PREFERENCE: DWMWINDOWATTRIBUTE = DWMWINDOWATTRIBUTE(33);
    const DWMWCP_ROUND: i32 = 2;

    let hwnd = HWND(window.hwnd().expect("failed to get hwnd").0);
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &DWMWCP_ROUND as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );
    }
}

// ── Application entry point ───────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let window = app.get_window("main").expect("no main window");
            #[cfg(target_os = "windows")]
            apply_window_style(&window);

            // SQLite: stored in the OS app-data directory.
            let data_dir = tauri::api::path::app_data_dir(&app.config())
                .ok_or("failed to resolve app data dir")?;
            std::fs::create_dir_all(&data_dir)?;
            let db = DbState::open(&data_dir.join("app.db"))?;
            app.manage(db);

            app.manage(SshState::new());

            // MySQL config: stored in the OS app-config directory.
            let config_dir = tauri::api::path::app_config_dir(&app.config())
                .ok_or("failed to resolve app config dir")?;
            app.manage(MySqlProfileState::load(&config_dir));

            // ── Python sidecar（仅在打包发布时启动；dev 模式由 run-tauri.mjs 负责）──
            #[cfg(not(debug_assertions))]
            {
                use tauri::api::process::Command;
                match Command::new_sidecar("sidecar")
                    .map(|c| c.spawn())
                {
                    Ok(Ok((_rx, child))) => {
                        *app.state::<SidecarState>().0.lock().unwrap() = Some(child);
                    }
                    Ok(Err(e)) => eprintln!("[sidecar] 启动失败：{e}"),
                    Err(e)     => eprintln!("[sidecar] 无法创建命令：{e}"),
                }
            }

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                // 窗口销毁时终止 Python sidecar
                #[cfg(not(debug_assertions))]
                if let Some(child) = event.window()
                    .state::<SidecarState>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Vector pipeline
            vector_db::search_vectors,
            pipeline_cmds::start_pipeline,
            pipeline_cmds::get_pipeline_stats,
            pipeline_cmds::get_vector_points,
            // Settings & model providers
            settings::get_providers,
            settings::upsert_provider,
            settings::delete_provider,
            settings::import_legacy_model_providers,
            settings::get_setting,
            settings::set_setting,
            // Remote machine profiles
            remote_profiles::list_remote_machine_profiles,
            remote_profiles::upsert_remote_machine_profile,
            remote_profiles::delete_remote_machine_profile,
            remote_profiles::import_legacy_remote_machine_profiles,
            remote_profiles::list_hyperv_vm_credentials,
            remote_profiles::upsert_hyperv_vm_credential,
            remote_profiles::delete_hyperv_vm_credential,
            remote_profiles::delete_hyperv_vm_credentials_by_parent_profile_id,
            remote_profiles::import_legacy_hyperv_vm_credentials,
            remote_profiles::get_mysql_user_config,
            remote_profiles::update_mysql_user_config,
            // Remote SSH / SFTP / RDP / WinRM
            remote_cmds::winrm_run_open_ssh_setup,
            remote_cmds::rdp_open,
            remote_cmds::ssh_connect,
            remote_cmds::ssh_disconnect,
            remote_cmds::ssh_get_disks,
            remote_cmds::ssh_list_hyperv_vms,
            remote_cmds::ssh_set_hyperv_vm_state,
            remote_cmds::ssh_list_dir,
            remote_cmds::ssh_read_file,
            remote_cmds::ssh_read_file_bytes,
            remote_cmds::ssh_write_file,
            remote_cmds::ssh_watch_file,
            remote_cmds::ssh_unwatch_file,
            remote_cmds::ssh_exec_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
