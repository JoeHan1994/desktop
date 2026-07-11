//! Pipeline orchestration service.
//!
//! `PipelineService` coordinates the three pipeline stages:
//! 1. **Ingest** — read files from disk.
//! 2. **Process** — clean text and split into chunks.
//! 3. **Vectorise** — embed chunks, project to 3-D, write to shared state.
//!
//! Each stage updates `AppStateInner` under a short-lived mutex lock and emits
//! a `pipeline-stats` Tauri event. The full vector list is emitted once at the
//! end as a `vector-stream` event.
//!
//! # Usage
//! ```rust
//! let service = PipelineService::new(Arc::clone(&state.inner), window);
//! tokio::task::spawn_blocking(move || service.run(paths));
//! ```

pub mod ingest;
pub mod process;
pub mod vectorize;

use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::domain::pipeline::{AppStateInner, PipelineStats, VectorPoint};
use crate::embed;

// ── PipelineService ───────────────────────────────────────────────────────

pub struct PipelineService {
    inner: Arc<Mutex<AppStateInner>>,
    window: tauri::Window,
}

impl PipelineService {
    pub fn new(inner: Arc<Mutex<AppStateInner>>, window: tauri::Window) -> Self {
        Self { inner, window }
    }

    /// Run the full pipeline synchronously (call inside `spawn_blocking`).
    pub fn run(self, paths: Vec<String>) {
        // ── Reset ────────────────────────────────────────────────────────
        self.reset_stats();
        self.emit_stats();

        // ── Stage 1.1: Ingest ────────────────────────────────────────────
        let (records, file_types) = ingest::read_files(&paths);
        {
            let mut g = self.lock();
            g.stats.file_count = records.len();
            g.stats.file_size_bytes = records.iter().map(|r| r.size_bytes).sum();
            g.stats.file_types = file_types;
        }
        self.emit_stats();

        if records.is_empty() {
            return;
        }

        // ── Stage 1.2 + 1.3: Process ─────────────────────────────────────
        let total_files = records.len();
        let mut all_chunks = Vec::new();
        let mut chars_before: u64 = 0;
        let mut chars_after: u64 = 0;

        for (fi, record) in records.iter().enumerate() {
            let (file_chunks, cb, ca) = process::process(&std::slice::from_ref(record));
            chars_before += cb;
            chars_after += ca;
            all_chunks.extend(file_chunks);
            {
                let mut g = self.lock();
                g.stats.chars_before_clean = chars_before;
                g.stats.chars_after_clean = chars_after;
                g.stats.clean_progress = (fi + 1) as f32 / total_files as f32 * 100.0;
                g.stats.chunk_count = all_chunks.len();
            }
            self.emit_stats();
        }

        // ── Stage 2: Embed ───────────────────────────────────────────────
        {
            let mut g = self.lock();
            g.stats.active_stage = 2;
            g.stats.vram_used_gb = 1.2;
        }
        self.emit_stats();

        let total = all_chunks.len().max(1);
        let t_start = Instant::now();
        let today = process::today_date_str();

        for (i, chunk) in all_chunks.iter().enumerate() {
            let entry = vectorize::embed_chunk(chunk, &today);
            let vram = 1.2 + (i as f32 / total as f32) * 1.8;
            {
                let mut g = self.lock();
                let elapsed = t_start.elapsed().as_secs_f32().max(1e-4);
                let chars_done: usize = all_chunks[..=i].iter().map(|c| c.text.len()).sum();
                g.stats.vram_used_gb = vram;
                g.stats.tokens_per_sec = chars_done as f32 / elapsed;
                g.stats.hnsw_nodes = i + 1;
                g.stats.hnsw_progress = (i as f32 + 1.0) / total as f32 * 100.0;
                g.vectors.push(entry);
            }
            if i % 10 == 0 || i + 1 == total {
                self.emit_stats();
            }
        }

        self.update_sample_metadata();

        // ── Stage 3: Write stats ─────────────────────────────────────────
        {
            let mut g = self.lock();
            g.stats.active_stage = 3;
            let elapsed = t_start.elapsed().as_secs_f32().max(1e-4);
            g.stats.write_qps = total as f32 / elapsed;
            g.stats.db_ping_ms = 2;
        }
        self.emit_stats();

        // ── Stage 5.1: 3-D projection ────────────────────────────────────
        {
            let mut g = self.lock();
            g.stats.active_stage = 5;
            for entry in &mut g.vectors {
                entry.position = embed::project_3d(&entry.embedding);
            }
            g.stats.reduce_iters = 200.min(total);
            g.stats.particle_count = g.vectors.len();
            if let Some(last) = g.vectors.last() {
                g.stats.reduce_last_coord = last.position;
            }
        }
        self.emit_stats();

        // ── Emit vector-stream (star-field update) ────────────────────────
        let points: Vec<VectorPoint> = {
            let g = self.lock();
            g.vectors
                .iter()
                .map(|e| VectorPoint {
                    id: e.id.clone(),
                    position: e.position,
                    score: None,
                })
                .collect()
        };
        let _ = self.window.emit("vector-stream", &points);
    }

    // ── Private helpers ───────────────────────────────────────────────────

    fn lock(&self) -> std::sync::MutexGuard<'_, AppStateInner> {
        self.inner.lock().expect("pipeline mutex poisoned")
    }

    fn reset_stats(&self) {
        let mut g = self.lock();
        g.stats = PipelineStats {
            active_stage: 1,
            ..PipelineStats::default()
        };
        g.vectors.clear();
    }

    fn emit_stats(&self) {
        let stats = self.lock().stats.clone();
        let _ = self.window.emit("pipeline-stats", &stats);
    }

    fn update_sample_metadata(&self) {
        let mut g = self.lock();
        if let Some(first) = g.vectors.first() {
            let sample: Vec<String> = first.embedding[..6]
                .iter()
                .map(|x| format!("{x:.4}"))
                .collect();
            g.stats.sample_vector = format!("[{}, …]", sample.join(", "));
        }
        if let Some(last) = g.vectors.last() {
            let preview: String = last.text.chars().take(40).collect();
            let src = &last.source;
            let date = &last.created;
            let id_short = &last.id[..8];
            g.stats.last_payload_json = format!(
                "{{\n  \"id\": \"{id_short}\",\n  \"source\": \"{src}\",\n  \"text\": \"{preview}…\",\n  \"created\": \"{date}\"\n}}"
            );
        }
    }
}
