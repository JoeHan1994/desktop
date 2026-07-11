//! Pipeline state domain models and shared application state container.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// ── Serialisable frontend types ───────────────────────────────────────────

/// A 3-D point pushed to the frontend star-field renderer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorPoint {
    pub id: String,
    pub position: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
}

/// Real-time snapshot of the ingestion + vectorisation pipeline.
///
/// Serialised as JSON and emitted as a `pipeline-stats` Tauri event.
/// Each field maps 1-to-1 to a frontend widget.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStats {
    /// Currently active pipeline stage (1–5).
    pub active_stage: u8,

    // ── Stage 1.1: Multi-source ingestion ────────────────────────────
    pub file_count: usize,
    pub file_size_bytes: u64,
    pub file_types: Vec<String>,

    // ── Stage 1.2: Text cleaning ─────────────────────────────────────
    pub chars_before_clean: u64,
    pub chars_after_clean: u64,
    pub clean_progress: f32,

    // ── Stage 1.3: Chunking ──────────────────────────────────────────
    pub chunk_count: usize,
    pub overlap_pct: f32,

    // ── Stage 2.1: Embedding model ───────────────────────────────────
    pub model_name: String,
    pub model_dim: usize,
    pub vram_used_gb: f32,
    pub vram_total_gb: f32,

    // ── Stage 2.2: Vector inference ──────────────────────────────────
    pub tokens_per_sec: f32,
    pub sample_vector: String,

    // ── Stage 2.3: Metadata binding ──────────────────────────────────
    pub last_payload_json: String,

    // ── Stage 3.1: DB connection ─────────────────────────────────────
    pub db_engine: String,
    pub db_ping_ms: u32,
    pub distance_metric: String,

    // ── Stage 3.2: Batch write ───────────────────────────────────────
    pub write_qps: f32,
    pub write_concurrency: usize,

    // ── Stage 3.3: HNSW index ────────────────────────────────────────
    pub hnsw_progress: f32,
    pub hnsw_nodes: usize,

    // ── Stage 4.1: Query embedding ───────────────────────────────────
    pub last_query_embed_ms: f32,

    // ── Stage 4.2: ANN retrieval ─────────────────────────────────────
    pub last_search_ms: f32,
    pub last_scores: Vec<f32>,

    // ── Stage 4.3: Hybrid rerank ─────────────────────────────────────
    pub recall_merge_rate: f32,
    pub scores_before_rerank: Vec<f32>,
    pub scores_after_rerank: Vec<f32>,

    // ── Stage 5.1: Dimensionality reduction ──────────────────────────
    pub reduce_iters: usize,
    pub reduce_last_coord: [f32; 3],

    // ── Stage 5.2: Rendering ─────────────────────────────────────────
    pub particle_count: usize,
}

impl Default for PipelineStats {
    fn default() -> Self {
        Self {
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

// ── Internal storage type (not sent to the frontend) ─────────────────────

/// One fully-embedded vector record held in memory.
#[derive(Debug, Clone)]
pub struct VectorEntry {
    pub id: String,
    pub text: String,
    pub source: String,
    pub created: String,
    /// High-dimensional embedding (not serialised to frontend).
    pub embedding: Vec<f32>,
    /// 3-D projected position for the star-field renderer.
    pub position: [f32; 3],
    pub _chunk_index: usize,
}

// ── Application state ─────────────────────────────────────────────────────

pub struct AppStateInner {
    pub stats: PipelineStats,
    pub vectors: Vec<VectorEntry>,
}

impl Default for AppStateInner {
    fn default() -> Self {
        Self {
            stats: PipelineStats::default(),
            vectors: Vec::new(),
        }
    }
}

/// Tauri managed state for the pipeline.
///
/// Shared across all commands and background threads via `Arc<Mutex<AppStateInner>>`.
/// Register with `.manage(AppState::new())` in `main.rs`.
pub struct AppState {
    pub inner: Arc<Mutex<AppStateInner>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(AppStateInner::default())),
        }
    }
}
