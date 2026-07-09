//! 应用共享状态与核心数据结构。
//!
//! `AppState` 通过 `Arc<Mutex<>>` 在主线程与后台 `spawn_blocking` 线程之间
//! 安全共享，由 Tauri 的 `.manage()` 注入到所有 command 中。

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// ── Settings: Model Provider ─────────────────────────────────────────────

/// 用户配置的 Model Provider（与前端 `ModelProvider` 接口字段一一对应）。
/// `rename_all = "camelCase"` 使 Rust snake_case 字段在 JSON 序列化时自动转为 camelCase，
/// 与 TypeScript 接口保持一致。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProvider {
    pub id: String,
    pub name: String,
    pub provider: String, // "ollama" | "openai"
    pub api_base_url: String,
    pub model: String,
    pub api_key: String,
}

// ── 前端展示数据结构 ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorPoint {
    pub id: String,
    pub position: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
}

/// 与前端所有 widget 一一对应的流水线统计快照。
/// Tauri 将此结构序列化为 JSON 推送给前端。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStats {
    /// 当前激活阶段（1–5）
    pub active_stage: u8,

    // ── 1.1 多源数据收集 ─────────────────────────────────────────────
    pub file_count: usize,
    pub file_size_bytes: u64,
    pub file_types: Vec<String>,

    // ── 1.2 文本清洗 ─────────────────────────────────────────────────
    pub chars_before_clean: u64,
    pub chars_after_clean: u64,
    pub clean_progress: f32,

    // ── 1.3 分块 ─────────────────────────────────────────────────────
    pub chunk_count: usize,
    pub overlap_pct: f32,

    // ── 2.1 Embedding 模型 ───────────────────────────────────────────
    pub model_name: String,
    pub model_dim: usize,
    pub vram_used_gb: f32,
    pub vram_total_gb: f32,

    // ── 2.2 向量推断 ─────────────────────────────────────────────────
    pub tokens_per_sec: f32,
    pub sample_vector: String,

    // ── 2.3 元数据绑定 ───────────────────────────────────────────────
    pub last_payload_json: String,

    // ── 3.1 数据库连接 ───────────────────────────────────────────────
    pub db_engine: String,
    pub db_ping_ms: u32,
    pub distance_metric: String,

    // ── 3.2 批量写入 ─────────────────────────────────────────────────
    pub write_qps: f32,
    pub write_concurrency: usize,

    // ── 3.3 HNSW 索引 ───────────────────────────────────────────────
    pub hnsw_progress: f32,
    pub hnsw_nodes: usize,

    // ── 4.1 查询向量化 ───────────────────────────────────────────────
    pub last_query_embed_ms: f32,

    // ── 4.2 ANN 检索 ─────────────────────────────────────────────────
    pub last_search_ms: f32,
    pub last_scores: Vec<f32>,

    // ── 4.3 混合检索重排 ─────────────────────────────────────────────
    pub recall_merge_rate: f32,
    pub scores_before_rerank: Vec<f32>,
    pub scores_after_rerank: Vec<f32>,

    // ── 5.1 降维 ─────────────────────────────────────────────────────
    pub reduce_iters: usize,
    pub reduce_last_coord: [f32; 3],

    // ── 5.2 渲染 ─────────────────────────────────────────────────────
    pub particle_count: usize,
}

impl Default for PipelineStats {
    fn default() -> Self {
        PipelineStats {
            active_stage: 1,
            file_count: 0,
            file_size_bytes: 0,
            file_types: vec![],
            chars_before_clean: 0,
            chars_after_clean: 0,
            clean_progress: 0.0,
            chunk_count: 0,
            overlap_pct: 15.0,
            model_name: "bge-large-zh-v1.5 (stub)".to_string(),
            model_dim: 768,
            vram_used_gb: 0.0,
            vram_total_gb: 8.0,
            tokens_per_sec: 0.0,
            sample_vector: "[…]".to_string(),
            last_payload_json: "{}".to_string(),
            db_engine: "Qdrant (In-Memory)".to_string(),
            db_ping_ms: 0,
            distance_metric: "Cosine".to_string(),
            write_qps: 0.0,
            write_concurrency: 16,
            hnsw_progress: 0.0,
            hnsw_nodes: 0,
            last_query_embed_ms: 0.0,
            last_search_ms: 0.0,
            last_scores: vec![],
            recall_merge_rate: 88.0,
            scores_before_rerank: vec![0.62, 0.58, 0.71, 0.55, 0.66],
            scores_after_rerank: vec![0.91, 0.88, 0.85, 0.83, 0.80],
            reduce_iters: 0,
            reduce_last_coord: [0.0, 0.0, 0.0],
            particle_count: 0,
        }
    }
}

// ── 内部存储结构（不序列化至前端）────────────────────────────────────────

/// 一条完整的向量记录，含原始 embedding（不直接发往前端）。
#[derive(Debug, Clone)]
pub struct VectorEntry {
    pub id: String,
    pub text: String,
    pub source: String,
    pub created: String,
    /// 高维 embedding 向量
    pub embedding: Vec<f32>,
    /// PCA/随机投影后的 3D 坐标
    pub position: [f32; 3],
    pub _chunk_index: usize,
}

// ── 应用共享状态 ─────────────────────────────────────────────────────────

pub struct AppStateInner {
    pub stats: PipelineStats,
    pub vectors: Vec<VectorEntry>,
}

impl Default for AppStateInner {
    fn default() -> Self {
        AppStateInner {
            stats: PipelineStats::default(),
            vectors: Vec::new(),
        }
    }
}

/// 通过 `Arc<Mutex<>>` 在主线程与后台线程之间安全共享。
/// 注册到 Tauri：`.manage(AppState::new())`。
pub struct AppState {
    pub inner: Arc<Mutex<AppStateInner>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            inner: Arc::new(Mutex::new(AppStateInner::default())),
        }
    }
}
