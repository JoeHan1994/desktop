//! 文件摄取与向量化流水线命令。
//!
//! 这些 Tauri 命令是薄包装层，所有业务逻辑委托给 `crate::pipeline::PipelineService`。
//!
//! # 事件
//! - `pipeline-stats` — `PipelineStats` JSON，每完成 10 个 chunk 推送一次
//! - `vector-stream`  — `VectorPoint[]`，流水线完成后推送一次

use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::domain::pipeline::{AppState, PipelineStats, VectorPoint};
use crate::pipeline::PipelineService;

// ── Read commands ─────────────────────────────────────────────────────────

/// 查询当前流水线统计快照（供前端轮询）。
#[tauri::command]
pub fn get_pipeline_stats(state: State<'_, AppState>) -> PipelineStats {
    state.inner.lock().unwrap().stats.clone()
}

/// 获取所有向量的 3-D 点位（供星空渲染组件在挂载时拉取初始数据）。
#[tauri::command]
pub fn get_vector_points(state: State<'_, AppState>) -> Vec<VectorPoint> {
    state
        .inner
        .lock()
        .unwrap()
        .vectors
        .iter()
        .map(|e| VectorPoint {
            id: e.id.clone(),
            position: e.position,
            score: None,
        })
        .collect()
}

// ── Write commands ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct IngestRequest {
    pub paths: Vec<String>,
}

/// 启动后台文件处理流水线（立即返回，非阻塞）。
#[tauri::command]
pub async fn start_pipeline(
    request: IngestRequest,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let service = PipelineService::new(Arc::clone(&state.inner), window);
    // CPU-bound work runs in the blocking thread pool so it doesn't starve async tasks.
    tokio::task::spawn_blocking(move || service.run(request.paths));
    Ok(())
}
