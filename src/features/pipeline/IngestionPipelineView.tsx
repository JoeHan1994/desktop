'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

const SIDECAR_BASE = 'http://127.0.0.1:8765';

// ── Types ─────────────────────────────────────────────────────────────────

interface KuRecord {
  kuid: string;
  filename: string;
  filepath: string;
  project_name: string;
  tags: string;
  created_at: string;
  chunk_count?: number;
}

interface PipelineEvent {
  step: string;
  status: 'running' | 'done' | 'error';
  message: string;
  data?: Record<string, unknown>;
  file_index: number;
  total_files: number;
  current_file: string;
}

type PipelineStatus = 'idle' | 'running' | 'done' | 'error';

const STEP_LABELS: Record<string, { label: string; icon: string }> = {
  ku:        { label: '1. 创建 KU', icon: 'database' },
  parse:     { label: '2. 切块', icon: 'workflow' },
  embed:     { label: '3. 向量化', icon: 'layers' },
  sqlite:    { label: '4. SQLite', icon: 'inbox' },
  file_done: { label: '完成', icon: 'check' },
};

// ── small components ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'running' | 'done' | 'error' | 'pending' }) {
  const cls =
    status === 'done'    ? 'bg-emerald-400' :
    status === 'error'   ? 'bg-red-400' :
    status === 'running' ? 'animate-pulse bg-[rgb(var(--accent-rgb))]' :
                           'bg-white/20';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function FileStepBar({
  events,
  fileIndex,
  totalFiles,
  filename,
}: {
  events: PipelineEvent[];
  fileIndex: number;
  totalFiles: number;
  filename: string;
}) {
  const getStepStatus = (step: string): 'running' | 'done' | 'error' | 'pending' => {
    const match = [...events].reverse().find(e => e.step === step && e.file_index === fileIndex);
    return match ? match.status : 'pending';
  };
  return (
    <div className="glass glass-control rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="truncate text-[11px] font-medium text-white/70">{filename}</span>
        <span className="text-[10px] text-white/35 shrink-0 ml-2">{fileIndex + 1} / {totalFiles}</span>
      </div>
      <div className="flex items-center gap-0">
        {Object.entries(STEP_LABELS).map(([stepKey, { label }], i, arr) => {
          const status = getStepStatus(stepKey);
          return (
            <React.Fragment key={stepKey}>
              <div className="flex flex-col items-center gap-1">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[9px] ${
                  status === 'done'    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' :
                  status === 'error'   ? 'border-red-400/40 bg-red-400/10 text-red-300' :
                  status === 'running' ? 'border-[rgb(var(--accent-rgb))]/40 bg-[rgb(var(--accent-rgb))]/10 text-[rgb(var(--accent-rgb))]' :
                  'border-white/10 text-white/20'
                }`}>
                  {status === 'done' ? '✓' : status === 'error' ? '✗' : i + 1}
                </div>
                <span className={`text-[8px] leading-none ${
                  status === 'pending' ? 'text-white/20' : 'text-white/50'
                }`}>{label.replace(/^\d+\.\s/, '')}</span>
              </div>
              {i < arr.length - 1 && (
                <div className={`mb-3.5 h-px flex-1 min-w-[4px] ${
                  status === 'done' ? 'bg-emerald-400/30' : 'bg-white/[0.08]'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function KuBadge({ ku, onDelete }: { ku: KuRecord; onDelete: (id: string) => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass glass-control rounded-xl px-4 py-3 flex items-start gap-3"
    >
      <Icon name="database" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent-rgb))]/70" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-white/90">{ku.filename}</span>
          {ku.chunk_count !== undefined && ku.chunk_count > 0 && (
            <span className="glass glass-chip rounded-full px-2 py-0.5 text-[10px] text-white/50">
              {ku.chunk_count} chunks
            </span>
          )}
        </div>
        {ku.project_name && (
          <span className="text-[11px] text-white/40">项目: {ku.project_name}</span>
        )}
        {ku.tags && (
          <div className="flex flex-wrap gap-1 mt-1">
            {ku.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
              <span key={t} className="glass glass-chip rounded-full px-2 py-0.5 text-[10px] text-violet-300/70">
                {t}
              </span>
            ))}
          </div>
        )}
        <span className="text-[10px] text-white/25 font-mono">{ku.kuid.slice(0, 8)}…</span>
      </div>
      <button
        onClick={() => onDelete(ku.kuid)}
        className="glass glass-icon-button glass-control h-6 w-6 shrink-0 rounded-full text-white/30 hover:text-red-400/80"
        title="删除 KU"
      >
        <Icon name="trash" className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────

export function IngestionPipelineView() {
  // KU list
  const [kus, setKus] = useState<KuRecord[]>([]);
  const [loadingKus, setLoadingKus] = useState(false);

  // New run form
  const [filepath, setFilepath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [tags, setTags] = useState('');

  // Pipeline execution
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('idle');
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── fetch KUs ──────────────────────────────────────────────────────────
  const fetchKus = useCallback(async () => {
    setLoadingKus(true);
    try {
      const res = await fetch(`${SIDECAR_BASE}/pipeline/kus`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKus(await res.json());
    } catch {
      // sidecar may not be running yet
    } finally {
      setLoadingKus(false);
    }
  }, []);

  useEffect(() => { fetchKus(); }, [fetchKus]);

  // Scroll log to bottom on new events
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  // ── delete KU ──────────────────────────────────────────────────────────
  const deleteKu = useCallback(async (kuid: string) => {
    try {
      await fetch(`${SIDECAR_BASE}/pipeline/ku/${kuid}`, { method: 'DELETE' });
      setKus(prev => prev.filter(k => k.kuid !== kuid));
    } catch { /* ignore */ }
  }, []);

  // ── run pipeline ───────────────────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    if (!filepath.trim()) return;
    setEvents([]);
    setTotalFiles(0);
    setPipelineStatus('running');
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${SIDECAR_BASE}/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath: filepath.trim(),
          project_name: projectName.trim(),
          tags: tags.trim(),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const msg = await res.text();
        setEvents(prev => [...prev, { step: 'init', status: 'error', message: msg, file_index: 0, total_files: 1, current_file: '' }]);
        setPipelineStatus('error');
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buf = '';
      let finalStatus: PipelineStatus = 'done';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev: PipelineEvent = JSON.parse(line.slice(6));
            if (ev.step === 'scan' && ev.data?.total_files) {
              setTotalFiles(ev.data.total_files as number);
            }
            setEvents(prev => [...prev, ev]);
            if (ev.status === 'error') finalStatus = 'error';
          } catch { /* malformed line */ }
        }
      }

      setPipelineStatus(finalStatus);
      if (finalStatus === 'done') {
        fetchKus();
      }
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'AbortError') {
        setPipelineStatus('idle');
      } else {
        setEvents(prev => [...prev, { step: 'init', status: 'error', message: String(e), file_index: 0, total_files: 1, current_file: '' }]);
        setPipelineStatus('error');
      }
    }
  }, [filepath, projectName, tags, fetchKus]);

  const cancelPipeline = () => {
    abortRef.current?.abort();
    setPipelineStatus('idle');
  };

  const isRunning = pipelineStatus === 'running';

  // Unique file indices that have had a file_start event
  const startedFiles = [...new Set(
    events.filter(e => e.step === 'file_start').map(e => e.file_index)
  )];
  const completedCount = events.filter(e => e.step === 'file_done' && e.status === 'done').length;
  const overallProgress = totalFiles > 0 ? Math.round((completedCount / totalFiles) * 100) : 0;
  const currentFileEvent = [...events].reverse().find(e => e.step === 'file_start' && e.status === 'running');

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="glass glass-chip px-2.5 py-0.5 card-label">Pipeline</span>
        <h1 className="text-sm font-semibold tracking-tight card-title">文档预处理流水线</h1>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        {/* ── Left: KU list ── */}
        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center justify-between">
            <span className="text-[11px] text-white/40 uppercase tracking-widest">KU 列表</span>
            <button
              onClick={fetchKus}
              disabled={loadingKus}
              className="glass glass-icon-button glass-control h-6 w-6 rounded-full text-white/40 hover:text-white/80 disabled:opacity-30"
              title="刷新"
            >
              <Icon name="loader" className={`h-3 w-3 ${loadingKus ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {kus.length === 0 && !loadingKus && (
              <div className="flex flex-col items-center gap-2 py-8 text-white/25 text-xs text-center">
                <Icon name="inbox" className="h-5 w-5" />
                <span>暂无 KU 记录<br />运行流水线后自动创建</span>
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {kus.map(ku => (
                <KuBadge key={ku.kuid} ku={ku} onDelete={deleteKu} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right: run panel + log ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Run form */}
          <div className="glass glass-control shrink-0 rounded-2xl p-4 space-y-3">
            <span className="text-[11px] uppercase tracking-widest text-white/40">新建处理任务</span>

            <div className="space-y-2">
              <label className="block">
                <span className="text-[11px] text-white/50 mb-1 block">
                  文件或文件夹绝对路径 *
                  <span className="ml-2 text-white/25">（单个 .md 文件，或包含 .md 的目录）</span>
                </span>
                <input
                  value={filepath}
                  onChange={e => setFilepath(e.target.value)}
                  placeholder="C:\Users\...\docs\guide.md  或  C:\Users\...\docs\"
                  disabled={isRunning}
                  className="glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-white/50 mb-1 block">项目名称</span>
                  <input
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="TerraForge"
                    disabled={isRunning}
                    className="glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-white/50 mb-1 block">Tags (逗号分隔)</span>
                  <input
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="guide,setup"
                    disabled={isRunning}
                    className="glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={runPipeline}
                disabled={isRunning || !filepath.trim()}
                className="flex items-center gap-2 rounded-xl bg-[rgb(var(--accent-rgb))] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[rgb(var(--accent-rgb))/0.3] transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              >
                <Icon name={isRunning ? 'loader' : 'play'} className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                {isRunning ? '处理中…' : '开始处理'}
              </button>
              {isRunning && (
                <button
                  onClick={cancelPipeline}
                  className="glass glass-control flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-white/60 hover:text-red-400"
                >
                  <Icon name="stop" className="h-3 w-3" />
                  取消
                </button>
              )}
            </div>
          </div>

          {/* Overall progress bar (multi-file) */}
          {totalFiles > 1 && events.length > 0 && (
            <div className="glass glass-control shrink-0 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/50">
                  总进度 — {completedCount} / {totalFiles} 个文件
                  {currentFileEvent && isRunning && (
                    <span className="ml-2 text-white/30">当前: {currentFileEvent.current_file}</span>
                  )}
                </span>
                <span className="text-white/50 tabular-nums">{overallProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-[rgb(var(--accent-rgb))]"
                  initial={{ width: 0 }}
                  animate={{ width: `${overallProgress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.4 }}
                />
              </div>
            </div>
          )}

          {/* Per-file step bars */}
          {startedFiles.length > 0 && (
            <div className="shrink-0 space-y-2 max-h-44 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {startedFiles.map(fi => {
                  const startEv = events.find(e => e.step === 'file_start' && e.file_index === fi);
                  const fname = startEv?.current_file ?? `file_${fi}`;
                  return (
                    <motion.div
                      key={fi}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <FileStepBar
                        events={events}
                        fileIndex={fi}
                        totalFiles={totalFiles || 1}
                        filename={fname}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Log */}
          {events.length > 0 ? (
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto rounded-2xl bg-black/20 p-4 font-mono text-[11px] space-y-1"
            >
              <AnimatePresence initial={false}>
                {events.map((ev, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2.5"
                  >
                    <StatusDot status={ev.status} />
                    <span className={
                      ev.status === 'error'    ? 'text-red-300' :
                      ev.status === 'done'     ? 'text-emerald-300/80' :
                      ev.step === 'file_start' ? 'text-[rgb(var(--accent-rgb))]/80 font-semibold' :
                      'text-white/60'
                    }>
                      {ev.message}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {pipelineStatus === 'done' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-center gap-2 text-emerald-400/80 font-sans text-xs">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  全部完成
                </motion.div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/20">
              <Icon name="flow" className="h-10 w-10" />
              <div className="text-center text-sm">
                <p className="font-medium">文档预处理流水线</p>
                <p className="mt-1 text-xs text-white/30">
                  支持单个 .md 文件或整个文件夹<br />
                  KU 创建 → MD 切块 → 向量化 → SQLite 持久化
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IngestionPipelineView;
