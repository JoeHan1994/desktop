'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Icon } from '@/components/ui/Icon';

const SIDECAR_BASE = 'http://127.0.0.1:8765';

// ── Types ─────────────────────────────────────────────────────────────────

interface VectorOverview {
  backend: 'chroma' | 'qdrant';
  collection: string;
  collections: string[];
  vector_count: number;
  dimension?: number;
  error?: string;
  sqlite?: { ku_count: number; chunk_count: number };
}

interface VectorItem {
  id: string;
  text: string;
  source: string;
  metadata: Record<string, unknown>;
}

interface ItemsResponse {
  backend: string;
  total: number;
  offset: number;
  limit: number;
  items: VectorItem[];
}

// ── helpers ───────────────────────────────────────────────────────────────

function Badge({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="glass glass-control flex flex-col gap-0.5 rounded-xl px-4 py-3">
      <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${accent ? 'text-[rgb(var(--accent-rgb))]' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

function MetadataChip({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === '' || v === false) return null;
  const strVal = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
  return (
    <span className="glass glass-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]">
      <span className="text-white/40">{k}:</span>
      <span className="text-white/80 max-w-[120px] truncate">{strVal}</span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function VectorDbView() {
  const [overview, setOverview] = useState<VectorOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [items, setItems] = useState<VectorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const PAGE = 20;

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const res = await fetch(`${SIDECAR_BASE}/vectordb/overview`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOverview(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchItems = useCallback(async (off: number) => {
    setLoadingItems(true);
    try {
      const res = await fetch(`${SIDECAR_BASE}/vectordb/items?limit=${PAGE}&offset=${off}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ItemsResponse = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setOffset(off);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchItems(0);
  }, [fetchOverview, fetchItems]);

  const handleDeleteAll = useCallback(async (alsoSqlite: boolean) => {
    if (!window.confirm(
      alsoSqlite
        ? '确认清空向量库并同步删除所有 KU / Chunk 记录？此操作不可恢复。'
        : '确认清空向量库（向量数据）？此操作不可恢复。'
    )) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `${SIDECAR_BASE}/vectordb/collection?also_sqlite=${alsoSqlite}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems([]);
      setTotal(0);
      setOffset(0);
      await fetchOverview();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }, [fetchOverview]);

  const totalPages = Math.ceil(total / PAGE);
  const currentPage = Math.floor(offset / PAGE) + 1;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="glass glass-chip px-2.5 py-0.5 card-label">Vector DB</span>
          <h1 className="text-sm font-semibold tracking-tight card-title">向量数据库浏览</h1>
          {overview && (
            <span className={`glass glass-chip px-2 py-0.5 text-[11px] font-medium ${
              overview.backend === 'qdrant'
                ? 'text-emerald-300/80'
                : 'text-violet-300/80'
            }`}>
              {overview.backend === 'qdrant' ? 'Qdrant (远端)' : 'ChromaDB (本地)'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDeleteAll(false)}
            disabled={deleting || loadingOverview || loadingItems}
            className="glass glass-icon-button glass-control h-8 w-8 rounded-full text-red-400/60 hover:text-red-400 disabled:opacity-40"
            title="清空向量库（保留 KU 记录）"
          >
            <Icon name="trash" className={`h-3.5 w-3.5 ${deleting ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={() => { fetchOverview(); fetchItems(0); }}
            disabled={loadingOverview || loadingItems}
            className="glass glass-icon-button glass-control h-8 w-8 rounded-full text-white/50 hover:text-white/90 disabled:opacity-40"
            title="刷新"
          >
            <Icon name="loader" className={`h-3.5 w-3.5 ${loadingOverview || loadingItems ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="glass glass-control rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300/80">
          {error}
        </div>
      )}

      {/* ── Stats row ── */}
      {overview && (
        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Badge label="后端" value={overview.backend.toUpperCase()} accent />
          <Badge label="向量总数" value={overview.vector_count.toLocaleString()} />
          <Badge label="KU 记录" value={overview.sqlite?.ku_count ?? '—'} />
          <Badge label="Chunk 记录" value={overview.sqlite?.chunk_count ?? '—'} />
        </div>
      )}

      {/* ── Collection chips ── */}
      {overview?.collections && overview.collections.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-2">
          {overview.collections.map((c) => (
            <span
              key={c}
              className={`glass glass-chip rounded-full px-3 py-1 text-xs ${
                c === overview.collection ? 'text-white' : 'text-white/40'
              }`}
            >
              {c === overview.collection && (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent-rgb))] align-middle" />
              )}
              {c}
            </span>
          ))}
        </div>
      )}

      {/* ── Items list ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-1">
          <span className="text-[11px] text-white/40">
            共 <span className="font-semibold text-white/70">{total.toLocaleString()}</span> 个向量块
            {total > 0 && ` · 第 ${offset + 1}–${Math.min(offset + PAGE, total)} 条`}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1 || loadingItems}
              onClick={() => fetchItems(Math.max(0, offset - PAGE))}
              className="glass glass-icon-button glass-control h-7 w-7 rounded-full text-white/50 hover:text-white/90 disabled:opacity-30"
            >
              <Icon name="chevron-left" className="h-3 w-3" />
            </button>
            <span className="text-[11px] text-white/50">{currentPage} / {totalPages || 1}</span>
            <button
              disabled={currentPage >= totalPages || loadingItems}
              onClick={() => fetchItems(offset + PAGE)}
              className="glass glass-icon-button glass-control h-7 w-7 rounded-full text-white/50 hover:text-white/90 disabled:opacity-30"
            >
              <Icon name="chevron-right" className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loadingItems && items.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/30">
              <Icon name="loader" className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          )}
          {!loadingItems && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-white/30">
              <Icon name="database" className="h-6 w-6" />
              <span>向量库为空或 sidecar 未运行</span>
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {items.map((item, idx) => {
              const isOpen = expanded === item.id;
              const metaEntries = Object.entries(item.metadata).filter(
                ([k]) => !['page_content'].includes(k)
              );
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ delay: idx * 0.02, duration: 0.18 }}
                  className="glass glass-control rounded-xl overflow-hidden"
                >
                  <button
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                  >
                    {/* index badge */}
                    <span className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.07] text-[10px] font-semibold text-white/50">
                      {offset + idx + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-xs font-medium text-white/80">{item.source || item.id}</span>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-white/45">{item.text}</p>
                    </div>
                    <Icon
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-white/30"
                    />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/[0.06]"
                      >
                        <div className="px-4 py-3 space-y-3">
                          {/* Full text */}
                          <div>
                            <span className="text-[10px] uppercase tracking-widest text-white/30">原文</span>
                            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-[11px] leading-relaxed text-white/70">
                              {item.text}
                            </pre>
                          </div>
                          {/* ID */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-widest text-white/30">ID</span>
                            <code className="text-[11px] text-white/50 font-mono">{item.id}</code>
                          </div>
                          {/* Metadata chips */}
                          {metaEntries.length > 0 && (
                            <div>
                              <span className="text-[10px] uppercase tracking-widest text-white/30">Metadata</span>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {metaEntries.map(([k, v]) => (
                                  <MetadataChip key={k} k={k} v={v} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default VectorDbView;
