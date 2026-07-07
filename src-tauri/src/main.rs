// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod embed;
mod store;

use commands::{pipeline, settings, vector_db, remote};
use remote::SshState;
use db::DbState;
use store::AppState;
use tauri::Manager;

/// 应用 VS Code 风格的系统圆角：
/// 使用 Windows 11 DWM DWMWCP_ROUND，让 OS 接管角演算和投影，投影会沿圆角自然弯曲。
#[cfg(target_os = "windows")]
fn apply_window_style(window: &tauri::Window) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};

    // DWMWA_WINDOW_CORNER_PREFERENCE = 33
    // DWMWCP_ROUND = 2  (圆角，与 VS Code / Windows 11 默认窗口相同)
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

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            let window = app.get_window("main").expect("no main window");
            #[cfg(target_os = "windows")]
            apply_window_style(&window);

            // 初始化 SQLite 数据库，存储于系统应用数据目录
            let data_dir = tauri::api::path::app_data_dir(&app.config())
                .ok_or("failed to resolve app data dir")?;
            std::fs::create_dir_all(&data_dir)?;
            let db = DbState::open(&data_dir.join("app.db"))?;
            app.manage(db);
            app.manage(SshState::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vector_db::search_vectors,
            pipeline::start_pipeline,
            pipeline::get_pipeline_stats,
            pipeline::get_vector_points,
            settings::get_providers,
            settings::upsert_provider,
            settings::delete_provider,
            settings::get_setting,
            settings::set_setting,
            remote::ssh_connect,
            remote::ssh_disconnect,
            remote::ssh_get_disks,
            remote::ssh_list_dir,
            remote::ssh_read_file,
            remote::ssh_write_file,
            remote::ssh_watch_file,
            remote::ssh_unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
