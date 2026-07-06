//! 向量检索命令模块。
//!
//! 将用户输入文本嵌入后，在内存向量库中执行 cosine 相似度 Top-K 检索，
//! 并将结果与搜索统计通过 Tauri event 推送至前端。

use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::embed;
use crate::store::{AppState, VectorPoint};

/// 向量检索请求参数（与 `tauriBridge.ts` SearchParams 约定一致）。
#[derive(Debug, Clone, Deserialize)]
pub struct SearchParams {
    /// 用户输入的自然语言查询文本
    pub query: String,
    /// 返回的最相似结果数量
    #[serde(rename = "topK", default = "default_top_k")]
    pub top_k: usize,
}

fn default_top_k() -> usize {
    10
}

/// 单条检索结果。
#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub text: String,
    pub source: String,
    pub score: f32,
    pub position: [f32; 3],
}

/// 执行语义向量检索。
///
/// 流程：
/// 1. 将 `query` 文本通过 `embed::embed` 嵌入为高维向量
/// 2. 对内存库所有向量计算 cosine 相似度（暴力搜索）
/// 3. 返回 Top-K 结果，同时更新 pipeline 统计并推送 `pipeline-stats` 事件
#[tauri::command]
pub async fn search_vectors(
    params: SearchParams,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<Vec<SearchResult>, String> {
    if params.query.trim().is_empty() {
        return Ok(vec![]);
    }

    // ── 1. 查询向量化 ────────────────────────────────────────────────
    let t_embed = Instant::now();
    let query_vec = embed::embed(&params.query);
    let embed_ms = t_embed.elapsed().as_secs_f32() * 1000.0;

    // ── 2. 暴力 cosine 搜索 ──────────────────────────────────────────
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
    // 降序排列，取 Top-K
    scored.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    let search_ms = t_search.elapsed().as_secs_f32() * 1000.0;

    // ── 3. 构造结果列表 ──────────────────────────────────────────────
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

    // ── 4. 更新 pipeline 统计 ────────────────────────────────────────
    {
        let mut inner = state.inner.lock().unwrap();
        inner.stats.last_query_embed_ms = embed_ms;
        inner.stats.last_search_ms = search_ms;
        inner.stats.last_scores = scored.iter().map(|(s, _)| *s).collect();

        // 模拟重排前/后得分（将原始 cosine 分稍微提升为重排后分）
        let raw = inner.stats.last_scores.clone();
        inner.stats.scores_before_rerank = raw.iter().take(6).cloned().collect();
        inner.stats.scores_after_rerank = raw
            .iter()
            .take(6)
            .enumerate()
            .map(|(i, s)| (s + 0.08 * (1.0 - i as f32 / 6.0)).min(1.0))
            .collect();
    }

    // ── 5. 推送统计事件 ──────────────────────────────────────────────
    let stats = state.inner.lock().unwrap().stats.clone();
    let _ = window.emit("pipeline-stats", &stats);

    // ── 6. 将命中点位高亮推回前端 ────────────────────────────────────
    let highlight: Vec<VectorPoint> = results
        .iter()
        .map(|r| VectorPoint {
            id: r.id.clone(),
            position: r.position,
            score: Some(r.score),
        })
        .collect();
    let _ = window.emit("search-results", &highlight);

    Ok(results)
}
