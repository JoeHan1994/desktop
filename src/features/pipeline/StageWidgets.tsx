'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import {
  Badge,
  Metric,
  ProgressBar,
  ScoreBar,
  Sparkline,
  StatusDot,
} from '@/components/ui/Primitives';
import { useLiveSeries } from '@/hooks/useLiveSeries';
import type { PipelineStats } from '@/services/tauriBridge';

/** 所有 widget 共享的 props 基类。 */
interface WidgetProps {
  index?: number;
  stats?: PipelineStats | null;
}

/** 格式化字节数为可读字符串。 */
function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

/** 格式化字符数为可读字符串。 */
function fmtChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
  return `${n}`;
}

/* ================================================================== */
/* 阶段一：数据准备与预处理                                            */
/* ================================================================== */

/** 1.1 多源数据收集 */
export function DataSourceWidget({ index = 0, stats }: WidgetProps) {
  const fileCount = stats?.file_count ?? 342;
  const fileSize = stats ? fmtBytes(stats.file_size_bytes) : '1.24 GB';
  const types = stats?.file_types.length ? stats.file_types : ['PDF', 'Wiki', 'Markdown', 'Word', 'QA 历史'];
  const tone = stats?.file_count ? 'online' : 'idle';
  return (
    <GlassCard
      title="多源数据收集"
      subtitle="1.1 · Ingestion"
      badge={<StatusDot tone={tone} label={stats?.file_count ? '已扫描' : '扫描中'} />}
      index={index}
    >
      <div className="grid grid-cols-2 gap-4">
        <Metric value={fileCount.toLocaleString()} unit="份" label="导入文件" />
        <Metric value={fileSize} label="数据总量" />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {types.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
    </GlassCard>
  );
}

/** 1.2 文本清洗与标准化 */
export function CleaningWidget({ index = 0, stats }: WidgetProps) {
  const progress = stats?.clean_progress ?? 78;
  const before = stats ? fmtChars(stats.chars_before_clean) + ' 字符' : '12.4 M 字符';
  const after = stats ? fmtChars(stats.chars_after_clean) + ' 字符' : '9.1 M 字符';
  return (
    <GlassCard
      title="文本清洗与标准化"
      subtitle="1.2 · Cleaning"
      badge={<Badge>{Math.round(progress)}%</Badge>}
      index={index}
    >
      <ProgressBar value={progress} />
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Metric value={before} label="清洗前" />
        <Metric value={after} label="清洗后" />
      </div>
    </GlassCard>
  );
}

/** 1.3 智能重叠分块 */
export function ChunkingWidget({ index = 0, stats }: WidgetProps) {
  const chunks = stats?.chunk_count ?? 18204;
  const overlap = stats?.overlap_pct ?? 15;
  return (
    <GlassCard title="智能重叠分块" subtitle="1.3 · Chunking" index={index}>
      <div className="grid grid-cols-2 gap-4">
        <Metric value={chunks.toLocaleString()} label="Chunk 总数" />
        <Metric value={Math.round(overlap)} unit="%" label="重叠度" />
      </div>
      {/* 重叠区间高亮示意 */}
      <div className="mt-4 flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="relative h-2 flex-1 rounded-full bg-sky-500/25">
            {i > 0 && (
              <div className="absolute left-0 top-0 h-full w-[15%] rounded-l-full bg-fuchsia-400/70" />
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/* ================================================================== */
/* 阶段二：向量化与模型嵌入                                            */
/* ================================================================== */

/** 2.1 离线 Embedding 模型加载 */
export function ModelWidget({ index = 0, stats }: WidgetProps) {
  const modelName = stats?.model_name ?? 'bge-large-zh-v1.5';
  const vramUsed = stats?.vram_used_gb ?? 6.2;
  const vramTotal = stats?.vram_total_gb ?? 8.0;
  const vramPct = Math.round((vramUsed / vramTotal) * 100);
  const dim = stats?.model_dim ?? 768;
  return (
    <GlassCard
      title="Embedding 模型"
      subtitle="2.1 · Model"
      badge={<StatusDot tone="online" label="已加载" />}
      index={index}
    >
      <div className="text-sm font-medium text-white">{modelName}</div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-white/45">
          <span>显存占用</span>
          <span className="tabular-nums">{vramUsed.toFixed(1)} / {vramTotal.toFixed(1)} GB</span>
        </div>
        <ProgressBar value={vramPct} tone="violet" />
      </div>
      <div className="mt-4">
        <Metric value={dim.toString()} unit="维" label="向量维度" />
      </div>
    </GlassCard>
  );
}

/** 2.2 高维向量推断 */
export function InferenceWidget({ index = 0, stats }: WidgetProps) {
  const { value, series } = useLiveSeries(3120, 380);
  const tokPerSec = stats?.tokens_per_sec ? Math.round(stats.tokens_per_sec) : Math.round(value);
  const sampleVec = stats?.sample_vector ?? '[0.0123, -0.0456, 0.8912, …]';
  const tone = stats?.tokens_per_sec ? 'busy' : 'idle';
  return (
    <GlassCard
      title="高维向量推断"
      subtitle="2.2 · Inference"
      badge={<StatusDot tone={tone} label={stats?.tokens_per_sec ? '推理中' : '待命'} />}
      index={index}
    >
      <div className="flex items-end justify-between">
        <Metric value={tokPerSec.toLocaleString()} unit="ch/s" label="吞吐速度" />
        <Sparkline data={series} />
      </div>
      <div className="mt-3 truncate rounded-lg bg-black/25 px-2.5 py-1.5 font-mono text-[11px] text-sky-200/80">
        {sampleVec}
      </div>
    </GlassCard>
  );
}

/** 2.3 元数据动态绑定 */
export function MetadataWidget({ index = 0, stats }: WidgetProps) {
  const json = stats?.last_payload_json ?? `{
  "id": "a1f9…",
  "source": "/doc/薪酬方案.pdf",
  "text": "员工差旅报销…",
  "created": "2026-07-04"
}`;
  return (
    <GlassCard title="元数据绑定" subtitle="2.3 · Metadata" index={index}>
      <pre className="overflow-x-auto rounded-xl bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/70">
        {json}
      </pre>
    </GlassCard>
  );
}

/* ================================================================== */
/* 阶段三：向量数据库存储与索引                                        */
/* ================================================================== */

/** 3.1 数据库初始化与集合创建 */
export function DatabaseWidget({ index = 0, stats }: WidgetProps) {
  const engine = stats?.db_engine ?? 'Qdrant';
  const ping = stats?.db_ping_ms ?? 3;
  const metric = stats?.distance_metric ?? 'Cosine';
  const tone = stats?.db_ping_ms != null ? 'online' : 'idle';
  return (
    <GlassCard
      title="向量数据库"
      subtitle="3.1 · Collection"
      badge={<StatusDot tone={tone} label={stats?.db_ping_ms != null ? '在线' : '等待'} />}
      index={index}
    >
      <div className="grid grid-cols-2 gap-4">
        <Metric value={engine} label="引擎" />
        <Metric value={ping} unit="ms" label="Ping" />
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-white/50">
        <span>距离度量</span>
        <Badge>{metric} 余弦</Badge>
      </div>
    </GlassCard>
  );
}

/** 3.2 批量高速写入 */
export function UpsertWidget({ index = 0, stats }: WidgetProps) {
  const { value, series } = useLiveSeries(42000, 6000);
  const qps = stats?.write_qps ? Math.round(stats.write_qps) : Math.round(value);
  const concurrency = stats?.write_concurrency ?? 16;
  const tone = stats?.write_qps ? 'busy' : 'idle';
  return (
    <GlassCard
      title="批量高速写入"
      subtitle="3.2 · Upsert"
      badge={<StatusDot tone={tone} label={stats?.write_qps ? '写入中' : '待命'} />}
      index={index}
    >
      <div className="flex items-end justify-between">
        <Metric value={qps.toLocaleString()} unit="QPS" label="写入吞吐" />
        <Sparkline data={series} color="#34d399" />
      </div>
      <div className="mt-4">
        <Metric value={concurrency} unit="线程" label="写入并发" />
      </div>
    </GlassCard>
  );
}

/** 3.3 构建 HNSW 近似最近邻索引 */
export function IndexWidget({ index = 0, stats }: WidgetProps) {
  const { series } = useLiveSeries(620, 60);
  const progress = stats?.hnsw_progress ?? 92;
  const nodes = stats?.hnsw_nodes ?? 128540;
  return (
    <GlassCard
      title="HNSW 索引构建"
      subtitle="3.3 · Indexing"
      badge={<Badge>{Math.round(progress)}%</Badge>}
      index={index}
    >
      <ProgressBar value={progress} tone="emerald" />
      <div className="mt-4 flex items-end justify-between">
        <Metric value={nodes.toLocaleString()} label="图网节点" />
        <div className="text-right">
          <Sparkline data={series} color="#a78bfa" width={90} />
          <div className="mt-1 text-[10px] text-white/40">内存消耗</div>
        </div>
      </div>
    </GlassCard>
  );
}

/* ================================================================== */
/* 阶段四：实时检索流与算法优化                                        */
/* ================================================================== */

/** 4.1 用户提问向量化 */
export function QueryEmbedWidget({ index = 0, stats }: WidgetProps) {
  const embedMs = stats?.last_query_embed_ms ? stats.last_query_embed_ms.toFixed(1) : '–';
  const dim = stats?.model_dim ?? 768;
  return (
    <GlassCard
      title="提问向量化"
      subtitle="4.1 · Query Embed"
      badge={<StatusDot tone="idle" label="就绪" />}
      index={index}
    >
      <div className="grid grid-cols-2 gap-4">
        <Metric value={embedMs} unit="ms" label="向量生成耗时" />
        <Metric value={dim} unit="维" label="查询向量" />
      </div>
    </GlassCard>
  );
}

/** 4.2 向量空间近似搜索 */
export function AnnSearchWidget({ index = 0, stats }: WidgetProps) {
  const { value } = useLiveSeries(8, 2.4);
  const searchMs = stats?.last_search_ms ? stats.last_search_ms.toFixed(1) : value.toFixed(1);
  const scores = stats?.last_scores.length ? stats.last_scores : [0.94, 0.89, 0.82];
  const tone = stats?.last_search_ms ? 'online' : 'busy';
  return (
    <GlassCard
      title="ANN 近似搜索"
      subtitle="4.2 · Retrieval"
      badge={<StatusDot tone={tone} label={stats?.last_search_ms ? '已检索' : '检索中'} />}
      index={index}
    >
      <Metric value={searchMs} unit="ms" label="检索延迟" />
      <div className="mt-4 space-y-1.5">
        {scores.slice(0, 3).map((s, i) => (
          <ScoreBar key={i} label={`#${i + 1}`} score={s} />
        ))}
      </div>
    </GlassCard>
  );
}

/** 4.3 混合检索与重排优化 */
export function RerankWidget({ index = 0, stats }: WidgetProps) {
  const before = stats?.scores_before_rerank?.length ? stats.scores_before_rerank : [0.62, 0.58, 0.71, 0.55, 0.66, 0.6];
  const after = stats?.scores_after_rerank?.length ? stats.scores_after_rerank : [0.91, 0.88, 0.85, 0.83, 0.8, 0.78];
  const mergeRate = stats?.recall_merge_rate ?? 88;
  return (
    <GlassCard title="混合检索 · 重排" subtitle="4.3 · Rerank" index={index}>
      <Metric value={Math.round(mergeRate)} unit="%" label="召回合并率" />
      <div className="mt-4 flex items-center gap-4">
        <div className="text-center">
          <Sparkline data={before} color="#f472b6" width={80} />
          <div className="mt-1 text-[10px] text-white/40">重排前</div>
        </div>
        <div className="text-center">
          <Sparkline data={after} color="#34d399" width={80} />
          <div className="mt-1 text-[10px] text-white/40">重排后</div>
        </div>
      </div>
    </GlassCard>
  );
}

/* ================================================================== */
/* 阶段五：前端可视化与 RAG 交付                                       */
/* ================================================================== */

/** 5.1 高维空间降维处理 */
export function ReduceWidget({ index = 0, stats }: WidgetProps) {
  const iters = stats?.reduce_iters ?? 480;
  const dim = stats?.model_dim ?? 768;
  const coord = stats?.reduce_last_coord ?? [-0.42, 1.08, 0.37];
  const coordStr = `[${coord.map((v) => v.toFixed(2)).join(', ')}]`;
  return (
    <GlassCard
      title="高维降维"
      subtitle="5.1 · Reduction"
      badge={<Badge>随机投影</Badge>}
      index={index}
    >
      <div className="grid grid-cols-2 gap-4">
        <Metric value={iters.toLocaleString()} label="收敛迭代" />
        <Metric value={`${dim}→3`} label="维度映射" />
      </div>
      <div className="mt-3 font-mono text-[11px] text-sky-200/70">
        [x, y, z] = {coordStr}
      </div>
    </GlassCard>
  );
}

/** 5.2 WebGL 3D 粒子星空渲染 */
export function RenderWidget({ index = 0, stats }: WidgetProps) {
  const { value, series } = useLiveSeries(60, 3, 24, 800);
  const particles = stats?.particle_count ?? 128540;
  return (
    <GlassCard
      title="WebGL 星空渲染"
      subtitle="5.2 · Rendering"
      badge={<StatusDot tone="online" label={`${Math.round(value)} FPS`} />}
      index={index}
    >
      <div className="flex items-end justify-between">
        <Metric value={Math.round(value)} unit="FPS" label="渲染帧率" />
        <Sparkline data={series} color="#22d3ee" />
      </div>
      <div className="mt-4">
        <Metric value={particles.toLocaleString()} label="粒子数量" />
      </div>
    </GlassCard>
  );
}

/** 5.3 液态玻璃面板流式交互与 RAG 交付 */
export function RagWidget({ index = 0, stats: _stats }: WidgetProps) {
  const { value } = useLiveSeries(48, 10);
  return (
    <GlassCard
      title="液态玻璃 · RAG 交付"
      subtitle="5.3 · Glass UI · LLM"
      badge={<StatusDot tone="busy" label="生成中" />}
      index={index}
    >
      <div className="grid grid-cols-2 gap-4">
        <Metric value={Math.round(value)} unit="tok/s" label="LLM 吐字速率" />
        <Metric value="1.20" label="玻璃折射率" />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-white/45">
          <span>流体动态位移</span>
          <span className="tabular-nums">0.40</span>
        </div>
        <ProgressBar value={40} />
      </div>
    </GlassCard>
  );
}
