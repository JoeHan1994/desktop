//! 文件摄取与向量化流水线命令。
//!
//! # 流程
//! `start_pipeline` 接收文件路径列表，在后台线程中依次执行：
//!
//! 1. **文件读取**（阶段 1.1）：`std::fs::read_to_string`
//! 2. **文本清洗**（阶段 1.2）：去除 HTML 标签、控制字符、合并空白
//! 3. **分块**（阶段 1.3）：500 字/块，15% 重叠
//! 4. **Embedding**（阶段 2）：`embed::embed`（确定性伪向量）
//! 5. **3D 投影**（阶段 5.1）：`embed::project_3d`（固定随机投影）
//! 6. **事件推送**：`pipeline-stats` + `vector-stream`

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::State;

use crate::embed;
use crate::store::{AppState, AppStateInner, PipelineStats, VectorEntry, VectorPoint};
use crate::text_file::decode_utf8_text_file;

// ── Tauri Commands ────────────────────────────────────────────────────────

/// 查询当前流水线统计快照（供前端轮询，也可配合 `pipeline-stats` 事件使用）。
#[tauri::command]
pub fn get_pipeline_stats(state: State<'_, AppState>) -> PipelineStats {
    state.inner.lock().unwrap().stats.clone()
}

/// 获取所有向量的 3D 点位（供星空渲染组件在挂载时拉取初始数据）。
#[tauri::command]
pub fn get_vector_points(state: State<'_, AppState>) -> Vec<VectorPoint> {
    let inner = state.inner.lock().unwrap();
    inner
        .vectors
        .iter()
        .map(|e| VectorPoint {
            id: e.id.clone(),
            position: e.position,
            score: None,
        })
        .collect()
}

/// 流水线启动请求体。
#[derive(serde::Deserialize)]
pub struct IngestRequest {
    pub paths: Vec<String>,
}

/// 启动后台文件处理流水线（立即返回，非阻塞）。
///
/// 进度通过以下 Tauri 事件实时推送：
/// - `pipeline-stats`：`PipelineStats` JSON，每完成 10 个 chunk 推送一次
/// - `vector-stream`：`VectorPoint[]`，流水线全部完成后推送一次
#[tauri::command]
pub async fn start_pipeline(
    request: IngestRequest,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let inner_arc = Arc::clone(&state.inner);
    // CPU 密集型工作放到 blocking 线程池，避免阻塞 Tokio 异步运行时
    tokio::task::spawn_blocking(move || {
        run_pipeline(request.paths, inner_arc, window);
    });
    Ok(())
}

// ── Pipeline 实现 ─────────────────────────────────────────────────────────

fn run_pipeline(paths: Vec<String>, inner: Arc<Mutex<AppStateInner>>, window: tauri::Window) {
    // ── 重置状态 ─────────────────────────────────────────────────────
    {
        let mut g = inner.lock().unwrap();
        g.stats.active_stage = 1;
        g.stats.file_count = 0;
        g.stats.file_size_bytes = 0;
        g.stats.chars_before_clean = 0;
        g.stats.chars_after_clean = 0;
        g.stats.clean_progress = 0.0;
        g.stats.chunk_count = 0;
        g.stats.hnsw_progress = 0.0;
        g.stats.hnsw_nodes = 0;
        g.stats.particle_count = 0;
        g.vectors.clear();
    }
    emit_stats(&inner, &window);

    // ── 阶段 1.1：多源文件读取 ────────────────────────────────────────
    let mut raw_contents: Vec<(String, String)> = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut file_types: Vec<String> = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("txt")
            .to_uppercase();
        if !file_types.contains(&ext) {
            file_types.push(ext);
        }
        match std::fs::read(path)
            .map_err(|e| e.to_string())
            .and_then(|bytes| decode_utf8_text_file(path, bytes))
        {
            Ok(content) => {
                total_bytes += path
                    .metadata()
                    .map(|m| m.len())
                    .unwrap_or(content.len() as u64);
                raw_contents.push((path_str.clone(), content));
            }
            Err(e) => eprintln!("[pipeline] skip {path_str}: {e}"),
        }
    }
    file_types.sort();

    {
        let mut g = inner.lock().unwrap();
        g.stats.file_count = raw_contents.len();
        g.stats.file_size_bytes = total_bytes;
        g.stats.file_types = file_types;
    }
    emit_stats(&inner, &window);

    if raw_contents.is_empty() {
        return;
    }

    // ── 阶段 1.2 & 1.3：文本清洗 + 分块 ─────────────────────────────
    let mut all_chunks: Vec<(String, String, usize)> = Vec::new(); // (text, source, chunk_idx)
    let mut chars_before: u64 = 0;
    let mut chars_after: u64 = 0;
    let total_files = raw_contents.len();

    for (fi, (source, raw)) in raw_contents.iter().enumerate() {
        chars_before += raw.chars().count() as u64;
        let cleaned = clean_text(raw);
        chars_after += cleaned.chars().count() as u64;
        let chunks = chunk_text(&cleaned, 500, 0.15);
        for (i, chunk) in chunks.into_iter().enumerate() {
            all_chunks.push((chunk, source.clone(), i));
        }
        {
            let mut g = inner.lock().unwrap();
            g.stats.chars_before_clean = chars_before;
            g.stats.chars_after_clean = chars_after;
            g.stats.clean_progress = (fi + 1) as f32 / total_files as f32 * 100.0;
            g.stats.chunk_count = all_chunks.len();
        }
        emit_stats(&inner, &window);
    }

    // ── 阶段 2：Embedding 生成 ────────────────────────────────────────
    {
        let mut g = inner.lock().unwrap();
        g.stats.active_stage = 2;
        g.stats.vram_used_gb = 1.2;
    }
    emit_stats(&inner, &window);

    let total = all_chunks.len().max(1);
    let t_start = Instant::now();
    let now_date = epoch_date_str();

    for (i, (text, source, chunk_idx)) in all_chunks.iter().enumerate() {
        let embedding = embed::embed(text);
        // 随流水线进度模拟显存占用增长
        let vram = 1.2 + (i as f32 / total as f32) * 1.8;
        let id = format!("{:016x}", fnv1a(&format!("{source}:{chunk_idx}")));

        let entry = VectorEntry {
            id: id.clone(),
            text: text.clone(),
            source: source.clone(),
            created: now_date.clone(),
            embedding,
            position: [0.0; 3],
            _chunk_index: *chunk_idx,
        };

        {
            let mut g = inner.lock().unwrap();
            g.vectors.push(entry);
            let elapsed = t_start.elapsed().as_secs_f32().max(1e-4);
            let chars_done: usize = all_chunks[..=i].iter().map(|(t, _, _)| t.len()).sum();
            g.stats.vram_used_gb = vram;
            g.stats.tokens_per_sec = chars_done as f32 / elapsed;
            g.stats.hnsw_nodes = g.vectors.len();
            g.stats.hnsw_progress = (i as f32 + 1.0) / total as f32 * 100.0;
        }

        if i % 10 == 0 || i + 1 == total {
            emit_stats(&inner, &window);
        }
    }

    // 更新样本向量与元数据预览
    {
        let mut g = inner.lock().unwrap();
        if let Some(first) = g.vectors.first() {
            let sample: Vec<String> = first.embedding[..6]
                .iter()
                .map(|x| format!("{:.4}", x))
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

    // ── 阶段 3：写入统计（基于实际耗时） ─────────────────────────────
    {
        let mut g = inner.lock().unwrap();
        g.stats.active_stage = 3;
        let elapsed = t_start.elapsed().as_secs_f32().max(1e-4);
        g.stats.write_qps = total as f32 / elapsed;
        g.stats.db_ping_ms = 2;
    }
    emit_stats(&inner, &window);

    // ── 阶段 5.1：3D 随机投影降维 ────────────────────────────────────
    {
        let mut g = inner.lock().unwrap();
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
    emit_stats(&inner, &window);

    // ── 推送 vector-stream（更新前端 3D 星空） ────────────────────────
    let points: Vec<VectorPoint> = {
        let g = inner.lock().unwrap();
        g.vectors
            .iter()
            .map(|e| VectorPoint {
                id: e.id.clone(),
                position: e.position,
                score: None,
            })
            .collect()
    };
    let _ = window.emit("vector-stream", &points);
}

// ── 辅助函数 ─────────────────────────────────────────────────────────────

/// FNV-1a 64-bit 哈希（零外部依赖）。
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 14_695_981_039_346_656_037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    h
}

/// 将 UNIX epoch 秒数转换为 `YYYY-MM-DD` 字符串（无外部依赖）。
fn epoch_date_str() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut days = secs / 86400;
    let mut year = 1970u32;
    loop {
        let dy = if is_leap(year) { 366 } else { 365 };
        if days < dy {
            break;
        }
        days -= dy;
        year += 1;
    }
    let month_days = [
        31u64,
        if is_leap(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1u32;
    for &md in &month_days {
        if days < md {
            break;
        }
        days -= md;
        month += 1;
    }
    format!("{:04}-{:02}-{:02}", year, month, days + 1)
}

fn is_leap(y: u32) -> bool {
    (y.is_multiple_of(4) && !y.is_multiple_of(100)) || y.is_multiple_of(400)
}

/// 去除 HTML 标签、控制字符，并合并连续空白。
fn clean_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ if ch.is_control() && ch != '\n' && ch != '\t' => {}
            _ => out.push(ch),
        }
    }
    // 合并连续空格/制表符为单个空格
    let mut result = String::with_capacity(out.len());
    let mut prev_ws = false;
    for ch in out.chars() {
        if ch == ' ' || ch == '\t' {
            if !prev_ws {
                result.push(' ');
            }
            prev_ws = true;
        } else {
            prev_ws = false;
            result.push(ch);
        }
    }
    result.trim().to_string()
}

/// 按 UTF-8 字符数切分文本，重叠度 `overlap_ratio`（0.15 = 15%）。
fn chunk_text(text: &str, chunk_size: usize, overlap_ratio: f32) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    if total == 0 || chunk_size == 0 {
        return vec![];
    }
    if total <= chunk_size {
        return vec![chars.iter().collect()];
    }
    let step = ((chunk_size as f32) * (1.0 - overlap_ratio)) as usize;
    let step = step.max(1);
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < total {
        let end = (start + chunk_size).min(total);
        chunks.push(chars[start..end].iter().collect());
        if end == total {
            break;
        }
        start += step;
    }
    chunks
}

/// 向前端推送当前 `PipelineStats` 快照。
fn emit_stats(inner: &Arc<Mutex<AppStateInner>>, window: &tauri::Window) {
    let stats = inner.lock().unwrap().stats.clone();
    let _ = window.emit("pipeline-stats", &stats);
}
