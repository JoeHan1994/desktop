//! 向量检索命令。
//!
//! 将用户输入文本嵌入后，在内存向量库中执行 cosine 相似度 Top-K 检索，
//! 并将结果与搜索统计通过 Tauri event 推送至前端。

use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::pipeline::{AppState, VectorPoint};
use crate::embed;

// ── Request / Response types ──────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct SearchParams {
    pub query: String,
    #[serde(rename = "topK", default = "default_top_k")]
    pub top_k: usize,
}

fn default_top_k() -> usize { 10 }

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub text: String,
    pub source: String,
    pub score: f32,
    pub position: [f32; 3],
}

// ── Command ───────────────────────────────────────────────────────────────

/// 执行语义向量检索，返回 Top-K 结果并更新 pipeline 统计。
#[tauri::command]
pub async fn search_vectors(
    params: SearchParams,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<Vec<SearchResult>, String> {
    if params.query.trim().is_empty() {
        return Ok(vec![]);
    }

    // 1. Embed query
    let t_embed = Instant::now();
    let query_vec = embed::embed(&params.query);
    let embed_ms = t_embed.elapsed().as_secs_f32() * 1000.0;

    // 2. Brute-force cosine search
    let t_search = Instant::now();
    let top_k = params.top_k.max(1);

    let mut scored: Vec<(f32, usize)> = {
        let inner = state.inner.lock().unwrap();
        inner
            .vectors
            .iter()
            .enumerate()
            .map(|(i, e)| (embed::cosine_similarity(&query_vec, &e.embedding), i))
            .collect()
    };
    scored.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    let search_ms = t_search.elapsed().as_secs_f32() * 1000.0;

    // 3. Build result list
    let results: Vec<SearchResult> = {
        let inner = state.inner.lock().unwrap();
        scored
            .iter()
            .filter_map(|(score, idx)| {
                inner.vectors.get(*idx).map(|e| SearchResult {
                    id: e.id.clone(),
                    text: e.text.clone(),
                    source: e.source.clone(),
                    score: *score,
                    position: e.position,
                })
            })
            .collect()
    };

    // 4. Update pipeline stats + emit
    {
        let mut inner = state.inner.lock().unwrap();
        inner.stats.last_query_embed_ms = embed_ms;
        inner.stats.last_search_ms = search_ms;
        inner.stats.last_scores = scored.iter().map(|(s, _)| *s).collect();
    }
    let stats = state.inner.lock().unwrap().stats.clone();
    let _ = window.emit("pipeline-stats", &stats);

    // 5. Emit scored vector points
    let points: Vec<VectorPoint> = scored
        .iter()
        .filter_map(|(score, idx)| {
            state.inner.lock().unwrap().vectors.get(*idx).map(|e| VectorPoint {
                id: e.id.clone(),
                position: e.position,
                score: Some(*score),
            })
        })
        .collect();
    let _ = window.emit("vector-stream", &points);

    Ok(results)
}
