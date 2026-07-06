import { invoke } from '@tauri-apps/api/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Tauri 通信中枢。
 *
 * 封装所有 `window.__TAURI__` 的 invoke 调用与事件监听，将底层桌面壳与前端隔离。
 * 若日后迁移到网页版，仅需替换此文件的实现（改为 HTTP/WebSocket），前端其余部分不变。
 */

// ── 数据类型 ─────────────────────────────────────────────────────────────

/** 向量点位（与 Rust `store::VectorPoint` 约定一致）。 */
export interface VectorPoint {
  id: string;
  position: [number, number, number];
  score?: number;
}

/** 向量检索请求参数（query 为自然语言文本，Rust 侧负责嵌入）。 */
export interface SearchParams {
  /** 自然语言查询文本 */
  query: string;
  topK: number;
}

/** 单条检索结果（含原文与相似度得分）。 */
export interface SearchResult {
  id: string;
  text: string;
  source: string;
  score: number;
  position: [number, number, number];
}

/** 流水线启动请求。 */
export interface IngestRequest {
  paths: string[];
}

/** 与 Rust `store::PipelineStats` 字段一一对应的前端类型。 */
export interface PipelineStats {
  active_stage: number;
  // 1.1
  file_count: number;
  file_size_bytes: number;
  file_types: string[];
  // 1.2
  chars_before_clean: number;
  chars_after_clean: number;
  clean_progress: number;
  // 1.3
  chunk_count: number;
  overlap_pct: number;
  // 2.1
  model_name: string;
  model_dim: number;
  vram_used_gb: number;
  vram_total_gb: number;
  // 2.2
  tokens_per_sec: number;
  sample_vector: string;
  // 2.3
  last_payload_json: string;
  // 3.1
  db_engine: string;
  db_ping_ms: number;
  distance_metric: string;
  // 3.2
  write_qps: number;
  write_concurrency: number;
  // 3.3
  hnsw_progress: number;
  hnsw_nodes: number;
  // 4.1
  last_query_embed_ms: number;
  // 4.2
  last_search_ms: number;
  last_scores: number[];
  // 4.3
  recall_merge_rate: number;
  scores_before_rerank: number[];
  scores_after_rerank: number[];
  // 5.1
  reduce_iters: number;
  reduce_last_coord: [number, number, number];
  // 5.2
  particle_count: number;
}

// ── Tauri Commands ────────────────────────────────────────────────────────

/**
 * 执行语义向量检索。
 * Rust 端将 query 文本嵌入后执行 cosine Top-K 搜索。
 */
export async function searchVectors(params: SearchParams): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_vectors', { params });
}

/**
 * 启动后台文件处理流水线（非阻塞，通过事件推送进度）。
 * @param paths 文件系统绝对路径列表
 */
export async function startPipeline(paths: string[]): Promise<void> {
  return invoke('start_pipeline', { request: { paths } });
}

/**
 * 查询当前流水线统计快照（适合挂载时一次性拉取）。
 */
export async function getPipelineStats(): Promise<PipelineStats> {
  return invoke<PipelineStats>('get_pipeline_stats');
}

/**
 * 获取所有向量的 3D 点位（适合页面挂载时拉取已有数据）。
 */
export async function getVectorPoints(): Promise<VectorPoint[]> {
  return invoke<VectorPoint[]>('get_vector_points');
}

// ── Tauri Events ──────────────────────────────────────────────────────────

/**
 * 订阅流水线实时统计推送（`pipeline-stats` 事件）。
 * 返回取消订阅函数，请在组件卸载时调用。
 */
export async function subscribePipelineStats(
  onData: (stats: PipelineStats) => void,
): Promise<UnlistenFn> {
  return listen<PipelineStats>('pipeline-stats', (event) => {
    onData(event.payload);
  });
}

/**
 * 订阅后端实时推送的向量数据流（`vector-stream` 事件）。
 * 流水线完成后后端推送一次全量点位。
 * 返回取消订阅函数，请在组件卸载时调用。
 */
export async function subscribeVectorStream(
  onData: (points: VectorPoint[]) => void,
): Promise<UnlistenFn> {
  return listen<VectorPoint[]>('vector-stream', (event) => {
    onData(event.payload);
  });
}

/**
 * 订阅检索高亮点位推送（`search-results` 事件）。
 * 每次 search_vectors 命令执行后后端推送命中点位。
 */
export async function subscribeSearchResults(
  onData: (points: VectorPoint[]) => void,
): Promise<UnlistenFn> {
  return listen<VectorPoint[]>('search-results', (event) => {
    onData(event.payload);
  });
}

// ── Settings: Model Providers ─────────────────────────────────────────────

/**
 * 与 Rust `store::ModelProvider` + 前端 `ModelProvidersContext.ModelProvider` 结构一致。
 * 独立定义在此处以避免与 UI 层产生循环依赖。
 */
export interface ModelProviderPayload {
  id: string;
  name: string;
  provider: string;     // 'ollama' | 'openai'
  apiBaseUrl: string;
  model: string;
  apiKey: string;
}

/** 从磁盘加载所有已保存的 Model Provider。 */
export async function getProviders(): Promise<ModelProviderPayload[]> {
  return invoke<ModelProviderPayload[]>('get_providers');
}

/**
 * 新增或更新一个 Model Provider。
 * id 已存在则覆盖，否则追加。
 */
export async function upsertProvider(provider: ModelProviderPayload): Promise<void> {
  return invoke('upsert_provider', { provider });
}

/** 按 id 删除一个 Model Provider。 */
export async function deleteProvider(id: string): Promise<void> {
  return invoke('delete_provider', { id });
}

// ── 通用键值设置 ──────────────────────────────────────────────────────────

/** 读取一个持久化设置项（不存在时返回 null）。 */
export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>('get_setting', { key });
}

/** 写入（或覆盖）一个持久化设置项。 */
export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('set_setting', { key, value });
}

