'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { searchVectors, type PipelineStats, type SearchResult } from '@/services/tauriBridge';

/**
 * 液态玻璃浮窗控制台。
 *
 * 接收来自 Dashboard 的 `stats` prop，展示向量库实时指标。
 * 检索输入框执行真实的语义向量检索，结果展示在控制台底部。
 */
export function ControlPanel({
  className = '',
  stats,
}: {
  className?: string;
  stats?: PipelineStats | null;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  // 从 pipeline stats 派生实时指标，回退到占位值
  const vectorCount = stats?.hnsw_nodes
    ? stats.hnsw_nodes.toLocaleString()
    : '128,540';
  const embedDim = stats?.model_dim ? stats.model_dim.toString() : '768';
  const searchLatency = stats?.last_search_ms
    ? `${stats.last_search_ms.toFixed(1)} ms`
    : '– ms';

  async function handleSearch() {
    if (!query.trim() || busy) return;
    setBusy(true);
    try {
      const res = await searchVectors({ query, topK: 5 });
      setResults(res);
    } catch (err) {
      console.warn('[ControlPanel] 检索失败或非 Tauri 环境:', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16, mass: 0.9 }}
      className={`glass relative overflow-hidden ${className || 'w-[min(92vw,480px)]'}`}
    >
      {/* 顶部高光描边，模拟玻璃边缘的清漆反光 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      {/* 柔和的内发光 */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-white/[0.10] blur-3xl" />

      <div className="relative p-6">
        {/* 标题栏 */}
        <div className="mb-5 flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white/90" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-wide card-title">
              向量控制台
            </h2>
            <p className="text-xs text-white/50">Vector Console · 私有向量库</p>
          </div>
        </div>

        {/* 语义检索输入 */}
        <div className="glass glass-input flex items-center gap-2 rounded-2xl px-3 py-2.5">
          <svg
            className="h-4 w-4 shrink-0 text-white/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入语义检索，例如：差旅费怎么报销？"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
        </div>

        {/* 状态指标（实时来自 pipeline stats） */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: '向量总数', value: vectorCount },
            { label: '嵌入维度', value: embedDim },
            { label: '检索延迟', value: searchLatency },
          ].map((s) => (
            <div
              key={s.label}
              className="glass glass-control rounded-2xl px-3 py-2.5 text-center"
            >
              <div className="truncate text-base font-semibold text-white">{s.value}</div>
              <div className="mt-0.5 text-[11px] text-white/45">{s.label}</div>
            </div>
          ))}
        </div>

        {/* 主操作按钮 */}
        <motion.button
          type="button"
          onClick={handleSearch}
          disabled={busy}
          whileHover={{ scale: busy ? 1 : 1.02 }}
          whileTap={{ scale: busy ? 1 : 0.98 }}
          className="glass glass-button glass-control mt-5 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? '检索中…' : '开始检索'}
        </motion.button>

        {/* 检索结果列表 */}
        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[11px] text-white/40">
              共 {results.length} 条结果
            </div>
            {results.map((r) => (
              <div
                key={r.id}
                className="glass glass-control rounded-xl px-3 py-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-white/50">{r.source}</span>
                  <span className="glass glass-chip shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                    {(r.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-white/70">{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}

export default ControlPanel;

