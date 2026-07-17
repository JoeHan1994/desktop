'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';

/* ──────────────────────────────────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────────────────────────────────── */

const SIDECAR_BASE = 'http://127.0.0.1:8765';

/* ──────────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────────── */

interface TraceCandidate {
	id: string;
	text: string;
	source: string;
	score: number;
	title: string;
	metadata: Record<string, unknown>;
}

interface RankedItem {
	id: string;
	text: string;
	source: string;
	title: string;
	rerank_score: number;
	prob: number;
	vector_score: number;
	passed: boolean;
	selected: boolean;
}

interface RetrieveData {
	query: string;
	k: number;
	hit_count: number;
	candidates: TraceCandidate[];
}

interface RerankData {
	prob_threshold: number;
	top_n: number;
	input_count: number;
	output_count: number;
	all_ranked: RankedItem[];
	selected_ids: string[];
	skipped?: boolean;
	reason?: string;
}

interface ContextData {
	source_count: number;
	context: string;
	system_prompt: string;
	sources: Array<{ source: string; title: string }>;
	fallback_mode?: boolean;
}

interface TraceStep {
	step_id: 'retrieve' | 'rerank' | 'context';
	name: string;
	duration_ms: number;
	status: 'done' | 'skipped' | 'error';
	summary: string;
	data: RetrieveData | RerankData | ContextData;
}

interface TraceResult {
	question: string;
	steps: TraceStep[];
	fallback_mode: boolean;
}

interface DetailItem {
	title: string;
	source: string;
	text: string;
	metadata?: Record<string, unknown>;
	scores?: {
		vector?: number;
		rerank?: number;
		prob?: number;
	};
}

/* ──────────────────────────────────────────────────────────────────────────
   Primitives
   ────────────────────────────────────────────────────────────────────────── */

function MiniBar({ value, max = 1, color = '#60a5fa' }: { value: number; max?: number; color?: string }) {
	const pct = Math.min(100, Math.max(0, (value / max) * 100));
	return (
		<div className="glass-track h-1 w-full overflow-hidden rounded-full">
			<motion.div
				className="h-full rounded-full"
				style={{ backgroundColor: color }}
				initial={{ width: 0 }}
				animate={{ width: `${pct}%` }}
				transition={{ duration: 0.5, ease: 'easeOut' }}
			/>
		</div>
	);
}

function DurationBadge({ ms }: { ms: number }) {
	if (ms <= 0) return null;
	const label = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
	return <span className="glass glass-chip shrink-0 px-2 py-0.5 font-mono text-[10px] text-white/35">{label}</span>;
}

/* ──────────────────────────────────────────────────────────────────────────
   Ingest Bar  — 导入知识库 / 显示库状态
   ────────────────────────────────────────────────────────────────────────── */

interface IngestStats {
	file_count: number;
	chunk_count: number;
	collection_count: number;
	video_chunks: number;
	table_chunks: number;
	step_chunks: number;
	code_chunks: number;
}

function IngestBar() {
	const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
	const [stats, setStats] = useState<IngestStats | null>(null);
	const [errorMsg, setErrorMsg] = useState('');

	async function handleIngest() {
		if (status === 'running') return;
		setStatus('running');
		setErrorMsg('');
		try {
			const res = await fetch(`${SIDECAR_BASE}/ingest/docs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docs_dir: null }),
			});
			if (!res.ok) {
				const detail = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
			}
			const data: IngestStats = await res.json();
			setStats(data);
			setStatus('done');
		} catch (e) {
			setErrorMsg(e instanceof Error ? e.message : String(e));
			setStatus('error');
		}
	}

	const dotColor =
		status === 'done' ? '#34d399' : status === 'running' ? '#fbbf24' : status === 'error' ? '#f87171' : '#ffffff30';

	return (
		<div className="glass app-card shrink-0 flex items-center gap-3 rounded-2xl px-4 py-2.5">
			{/* status dot */}
			<motion.div
				className="h-2 w-2 shrink-0 rounded-full"
				style={{ backgroundColor: dotColor }}
				animate={status === 'running' ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
				transition={{ duration: 1, repeat: status === 'running' ? Infinity : 0 }}
			/>

			{/* label */}
			<span className="text-[11px] font-medium text-white/50">知识库</span>

			{/* stats chips */}
			{stats && status === 'done' && (
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
					<span className="glass glass-chip px-2 py-0.5 text-[9px] text-emerald-300">
						{stats.file_count} 文档
					</span>
					<span className="glass glass-chip px-2 py-0.5 text-[9px] text-blue-300">
						{stats.chunk_count.toLocaleString()} 分块
					</span>
					<span className="glass glass-chip px-2 py-0.5 text-[9px] text-white/35">
						{stats.collection_count.toLocaleString()} 向量
					</span>
					{stats.video_chunks > 0 && (
						<span className="glass glass-chip px-2 py-0.5 text-[9px] text-purple-300">
							{stats.video_chunks} 视频
						</span>
					)}
				</div>
			)}

			{status === 'error' && (
				<span className="min-w-0 flex-1 truncate text-[11px] text-rose-400" title={errorMsg}>
					{errorMsg}
				</span>
			)}

			{status === 'idle' && <span className="flex-1 text-[11px] text-white/25">未初始化</span>}
			{status === 'running' && <span className="flex-1 text-[11px] text-white/40">导入中，请稍候…</span>}

			{/* action button */}
			<button
				type="button"
				onClick={handleIngest}
				disabled={status === 'running'}
				className="glass glass-control shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
			>
				{status === 'running' ? (
					<span className="flex items-center gap-1.5">
						<motion.span
							className="block h-2.5 w-2.5 rounded-full border border-white/30 border-t-white"
							animate={{ rotate: 360 }}
							transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
						/>
						导入中
					</span>
				) : status === 'done' ? (
					'重新导入'
				) : (
					'导入知识库'
				)}
			</button>
		</div>
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   Detail Modal (slide-in panel from the right)
   ────────────────────────────────────────────────────────────────────────── */

function DetailModal({ item, onClose }: { item: DetailItem; onClose: () => void }) {
	return createPortal(
		<>
			<motion.div
				key="overlay"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>
			<motion.div
				key="panel"
				initial={{ opacity: 0, x: 48, scale: 0.97 }}
				animate={{ opacity: 1, x: 0, scale: 1 }}
				exit={{ opacity: 0, x: 48, scale: 0.97 }}
				transition={{ type: 'spring', stiffness: 280, damping: 26 }}
				className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(90vw,500px)] flex-col"
			>
				<div className="glass app-popover flex h-full flex-col overflow-hidden rounded-2xl shadow-2xl">
					{/* Header */}
					<div className="shrink-0 flex items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
						<div className="min-w-0">
							<div className="truncate text-xs font-semibold text-white">{item.title || item.source}</div>
							<div className="mt-0.5 truncate text-[10px] text-white/35">{item.source}</div>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="glass glass-icon-button glass-control h-6 w-6 shrink-0 rounded-full"
							aria-label="关闭"
						>
							<svg
								viewBox="0 0 12 12"
								className="h-3 w-3"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
							>
								<line x1="2" y1="2" x2="10" y2="10" />
								<line x1="10" y1="2" x2="2" y2="10" />
							</svg>
						</button>
					</div>

					{/* Score bars */}
					{item.scores && (
						<div className="shrink-0 grid grid-cols-3 gap-3 border-b border-white/[0.06] px-4 py-3">
							{item.scores.vector != null && (
								<div>
									<div className="mb-1 text-[9px] uppercase tracking-wider text-white/30">Vector Score</div>
									<MiniBar value={item.scores.vector} color="#60a5fa" />
									<div className="mt-1 font-mono text-[10px] text-blue-300">{item.scores.vector.toFixed(4)}</div>
								</div>
							)}
							{item.scores.prob != null && (
								<div>
									<div className="mb-1 text-[9px] uppercase tracking-wider text-white/30">Rerank Prob</div>
									<MiniBar value={item.scores.prob} color="#34d399" />
									<div className="mt-1 font-mono text-[10px] text-emerald-300">{item.scores.prob.toFixed(4)}</div>
								</div>
							)}
							{item.scores.rerank != null && (
								<div>
									<div className="mb-1 text-[9px] uppercase tracking-wider text-white/30">Rerank Logit</div>
									<div className="font-mono text-[10px] text-purple-300">{item.scores.rerank.toFixed(4)}</div>
								</div>
							)}
						</div>
					)}

					{/* Content */}
					<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
						<div>
							<div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/35">文本内容</div>
							<div className="glass glass-control rounded-xl p-3 text-[12px] leading-relaxed text-white/75 whitespace-pre-wrap">
								{item.text}
							</div>
						</div>

						{item.metadata && Object.keys(item.metadata).length > 0 && (
							<div>
								<div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/35">元数据</div>
								<pre className="glass glass-control overflow-x-auto rounded-xl p-3 font-mono text-[10px] text-white/50">
									{JSON.stringify(item.metadata, null, 2)}
								</pre>
							</div>
						)}
					</div>
				</div>
			</motion.div>
		</>,
		document.body,
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   Step body: Retrieve
   ────────────────────────────────────────────────────────────────────────── */

function RetrieveBody({ data, onItemClick }: { data: RetrieveData; onItemClick: (item: DetailItem) => void }) {
	const maxScore = Math.max(...data.candidates.map((c) => c.score), 0.01);

	if (data.candidates.length === 0) {
		return (
			<div className="px-1 pt-2 text-[12px] text-white/35">
				向量库为空或查询无匹配 —— 请先点击顶部「导入知识库」完成摄取。
			</div>
		);
	}

	return (
		<div className="space-y-1.5 pt-2">
			<div className="mb-2 flex items-center gap-2 px-1 text-[10px] text-white/30">
				<span>共 {data.candidates.length} 条候选</span>
				<span>·</span>
				<span className="truncate">
					查询：{data.query.slice(0, 40)}
					{data.query.length > 40 ? '…' : ''}
				</span>
			</div>

			{data.candidates.map((c, i) => (
				<motion.button
					key={c.id || i}
					type="button"
					initial={{ opacity: 0, x: -6 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ delay: i * 0.025 }}
					onClick={() =>
						onItemClick({
							title: c.title || c.source,
							source: c.source,
							text: c.text,
							metadata: c.metadata,
							scores: { vector: c.score },
						})
					}
					className="glass glass-control group w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
				>
					<div className="flex items-center gap-2">
						<span className="w-5 shrink-0 text-[9px] text-white/25 font-mono text-right">{i + 1}</span>
						<div className="min-w-0 flex-1">
							<div className="truncate text-[11px] font-medium text-white/75 group-hover:text-white">
								{c.title || c.source}
							</div>
							<div className="mt-0.5 truncate text-[9px] text-white/25">{c.source}</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<div className="w-20">
								<MiniBar value={c.score} max={maxScore} color="#60a5fa" />
							</div>
							<span className="w-12 text-right font-mono text-[10px] tabular-nums text-blue-300">
								{c.score.toFixed(4)}
							</span>
							<svg
								viewBox="0 0 10 10"
								className="h-2.5 w-2.5 text-white/20 transition-colors group-hover:text-white/50"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
							>
								<path d="M3 2l4 3-4 3" />
							</svg>
						</div>
					</div>
				</motion.button>
			))}
		</div>
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   Step body: Rerank
   ────────────────────────────────────────────────────────────────────────── */

function RerankBody({ data, onItemClick }: { data: RerankData; onItemClick: (item: DetailItem) => void }) {
	if (data.skipped) {
		return <div className="px-1 pt-2 text-[12px] text-white/35">{data.reason ?? '已跳过'}</div>;
	}

	return (
		<div className="space-y-1.5 pt-2">
			<div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-[10px] text-white/30">
				<span>
					{data.input_count} → {data.output_count} 条
				</span>
				<span>·</span>
				<span>阈值 prob &gt; {data.prob_threshold}</span>
				<span>·</span>
				<span>保留 top-{data.top_n}</span>
			</div>

			{data.all_ranked.map((r, i) => {
				const isSelected = r.selected;
				const isPassed = r.passed;
				const rowColor = isSelected ? '#34d399' : isPassed ? '#60a5fa' : 'rgba(255,255,255,0.2)';

				return (
					<motion.button
						key={r.id || i}
						type="button"
						initial={{ opacity: 0, x: -6 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: i * 0.025 }}
						onClick={() =>
							onItemClick({
								title: r.title || r.source,
								source: r.source,
								text: r.text,
								scores: {
									vector: r.vector_score,
									rerank: r.rerank_score,
									prob: r.prob,
								},
							})
						}
						className={`glass glass-control group w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.06] ${
							!isPassed ? 'opacity-40 hover:opacity-60' : ''
						}`}
					>
						<div className="flex items-center gap-2">
							{/* status dot */}
							<div
								className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
								style={{ backgroundColor: rowColor + '28', color: rowColor }}
							>
								{isSelected ? '✓' : isPassed ? '○' : '✗'}
							</div>

							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="w-4 shrink-0 text-[9px] text-white/25 font-mono text-right">{i + 1}</span>
									<span
										className="truncate text-[11px] font-medium group-hover:text-white"
										style={{ color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)' }}
									>
										{r.title || r.source}
									</span>
								</div>
								<div className="mt-1 flex items-center gap-3">
									<div className="w-16">
										<MiniBar value={r.prob} color={rowColor} />
									</div>
									<span className="font-mono text-[9px]" style={{ color: rowColor }}>
										prob {r.prob.toFixed(3)}
									</span>
									<span className="font-mono text-[9px] text-white/25">vec {r.vector_score.toFixed(3)}</span>
									<span className="font-mono text-[9px] text-white/25">logit {r.rerank_score.toFixed(3)}</span>
								</div>
							</div>

							<svg
								viewBox="0 0 10 10"
								className="h-2.5 w-2.5 shrink-0 text-white/20 transition-colors group-hover:text-white/50"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
							>
								<path d="M3 2l4 3-4 3" />
							</svg>
						</div>
					</motion.button>
				);
			})}
		</div>
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   Step body: Context
   ────────────────────────────────────────────────────────────────────────── */

function ContextBody({ data }: { data: ContextData }) {
	const [tab, setTab] = useState<'context' | 'prompt'>('context');

	if (data.fallback_mode) {
		return <div className="px-1 pt-2 text-[12px] text-white/35">无相关文档，将使用 LLM 直接回答（无 RAG 增强）</div>;
	}

	return (
		<div className="space-y-2 pt-2">
			{/* source chips */}
			<div className="flex flex-wrap gap-1.5 px-0.5">
				{data.sources?.map((s, i) => (
					<span key={i} className="glass glass-chip px-2 py-0.5 text-[9px] text-white/45">
						{s.title || s.source}
					</span>
				))}
			</div>

			{/* tab picker */}
			<div className="flex gap-1">
				{(['context', 'prompt'] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						className={`glass glass-chip rounded-lg px-2.5 py-1 text-[10px] transition-colors ${
							tab === t ? 'bg-white/[0.1] text-white' : 'text-white/35 hover:text-white/60'
						}`}
					>
						{t === 'context' ? '检索上下文' : '系统提示词'}
					</button>
				))}
			</div>

			<pre className="glass glass-control max-h-64 overflow-y-auto overflow-x-hidden rounded-xl p-3 font-mono text-[10px] leading-relaxed text-white/55 whitespace-pre-wrap">
				{tab === 'context' ? data.context : data.system_prompt}
			</pre>
		</div>
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   Step icons
   ────────────────────────────────────────────────────────────────────────── */

const STEP_ICON: Record<string, React.ReactNode> = {
	retrieve: (
		<svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
			<circle cx="5.5" cy="5.5" r="4" />
			<line x1="8.7" y1="8.7" x2="12" y2="12" />
		</svg>
	),
	rerank: (
		<svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
			<path d="M2 3.5h10M4 7h6M6.5 10.5h1" />
		</svg>
	),
	context: (
		<svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
			<rect x="1.5" y="1.5" width="11" height="11" rx="2" />
			<path d="M4 5h6M4 7h6M4 9h3.5" />
		</svg>
	),
	generate: (
		<svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
			<path d="M2 8l2-0.5 2-5 2 8 2-5 2 2.5" />
		</svg>
	),
};

const STEP_COLOR: Record<string, string> = {
	retrieve: '#60a5fa',
	rerank: '#fbbf24',
	context: '#a78bfa',
	generate: '#34d399',
};

/* ──────────────────────────────────────────────────────────────────────────
   Generic Step Card (collapsible)
   ────────────────────────────────────────────────────────────────────────── */

function TraceStepCard({
	step,
	index,
	onItemClick,
}: {
	step: TraceStep;
	index: number;
	onItemClick: (item: DetailItem) => void;
}) {
	const [expanded, setExpanded] = useState(true);
	const color = STEP_COLOR[step.step_id] ?? '#60a5fa';
	const isSkipped = step.status === 'skipped';

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.1, type: 'spring', stiffness: 220, damping: 24 }}
		>
			<div className="glass app-card overflow-hidden rounded-2xl">
				{/* Header row */}
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
				>
					{/* Step indicator */}
					<div
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
						style={{ backgroundColor: color + '22', color }}
					>
						{STEP_ICON[step.step_id] ?? <span className="text-xs font-bold">{index + 1}</span>}
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="text-[13px] font-semibold text-white">{step.name}</span>
							{isSkipped && <span className="glass glass-chip px-1.5 py-0.5 text-[9px] text-white/35">已跳过</span>}
						</div>
						<div className="mt-0.5 truncate text-[11px] text-white/40">{step.summary}</div>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<DurationBadge ms={step.duration_ms} />
						<svg
							viewBox="0 0 12 12"
							className={`h-3 w-3 text-white/30 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<path d="M2 4l4 4 4-4" />
						</svg>
					</div>
				</button>

				{/* Collapsible body */}
				<AnimatePresence initial={false}>
					{expanded && !isSkipped && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: 'auto', opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.18, ease: 'easeInOut' }}
							className="overflow-hidden"
						>
							<div className="border-t border-white/[0.06] px-4 pb-4">
								{step.step_id === 'retrieve' && (
									<RetrieveBody data={step.data as RetrieveData} onItemClick={onItemClick} />
								)}
								{step.step_id === 'rerank' && <RerankBody data={step.data as RerankData} onItemClick={onItemClick} />}
								{step.step_id === 'context' && <ContextBody data={step.data as ContextData} />}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   LLM Answer Card (streams from /qa/ask)
   ────────────────────────────────────────────────────────────────────────── */

function LlmAnswerCard({ question }: { question: string }) {
	const [answer, setAnswer] = useState('');
	const [streaming, setStreaming] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState('');
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

		const run = async () => {
			setStreaming(true);
			setAnswer('');
			setDone(false);
			setError('');

			try {
				const res = await fetch(`${SIDECAR_BASE}/qa/ask`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ question, history: [] }),
				});

				if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

				reader = res.body.getReader();
				const decoder = new TextDecoder();
				let full = '';

				while (!cancelledRef.current) {
					const { done: streamDone, value } = await reader.read();
					if (streamDone) break;
					full += decoder.decode(value, { stream: true });
					setAnswer(full);
				}

				if (!cancelledRef.current) setDone(true);
			} catch (e) {
				if (!cancelledRef.current) {
					setError(e instanceof Error ? e.message : String(e));
				}
			} finally {
				if (!cancelledRef.current) setStreaming(false);
			}
		};

		run();

		return () => {
			cancelledRef.current = true;
			reader?.cancel().catch(() => {});
		};
	}, [question]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.35, type: 'spring', stiffness: 220, damping: 24 }}
		>
			<div className="glass app-card overflow-hidden rounded-2xl">
				{/* Header */}
				<div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
					<div
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
						style={{ backgroundColor: '#34d39922', color: '#34d399' }}
					>
						{STEP_ICON.generate}
					</div>
					<div className="flex-1">
						<span className="text-[13px] font-semibold text-white">LLM 生成</span>
					</div>
					{streaming && (
						<div className="flex items-center gap-1">
							{[0, 1, 2].map((i) => (
								<motion.div
									key={i}
									className="h-1.5 w-1.5 rounded-full bg-emerald-400/70"
									animate={{ opacity: [0.3, 1, 0.3] }}
									transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
								/>
							))}
						</div>
					)}
					{done && <span className="glass glass-chip px-2 py-0.5 text-[10px] text-white/35">完成</span>}
				</div>

				{/* Answer text */}
				<div className="px-4 py-3">
					{error ? (
						<div className="text-[12px] text-rose-400">{error}</div>
					) : (
						<div className="min-h-[1.5rem] text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap">
							{answer}
							{streaming && (
								<span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-emerald-400/80 align-text-bottom" />
							)}
						</div>
					)}
				</div>
			</div>
		</motion.div>
	);
}

/* ──────────────────────────────────────────────────────────────────────────
   Main: RagWorkspaceView
   ────────────────────────────────────────────────────────────────────────── */

export function RagWorkspaceView() {
	const [question, setQuestion] = useState('');
	const [tracing, setTracing] = useState(false);
	const [traceResult, setTraceResult] = useState<TraceResult | null>(null);
	const [traceError, setTraceError] = useState('');
	const [showAnswer, setShowAnswer] = useState(false);
	const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);

	const handleRun = useCallback(async () => {
		const q = question.trim();
		if (!q || tracing) return;

		setTracing(true);
		setTraceResult(null);
		setTraceError('');
		setShowAnswer(false);
		setSelectedItem(null);

		try {
			const res = await fetch(`${SIDECAR_BASE}/qa/trace`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: q }),
			});

			if (!res.ok) {
				const detail = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
			}

			const data: TraceResult = await res.json();
			setTraceResult(data);
			setShowAnswer(true);
		} catch (e) {
			setTraceError(e instanceof Error ? e.message : String(e));
		} finally {
			setTracing(false);
		}
	}, [question, tracing]);

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			handleRun();
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
			{/* ── Ingest bar ─────────────────────────────────────────────── */}
			<IngestBar />

			{/* ── Input bar ──────────────────────────────────────────────────── */}
			<div className="glass app-card shrink-0 flex items-end gap-3 rounded-2xl px-4 py-3">
				<textarea
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					onKeyDown={handleKeyDown}
					rows={2}
					disabled={tracing}
					placeholder="输入问题，按 Ctrl+Enter 运行 RAG 管道…"
					className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
				/>
				<button
					type="button"
					onClick={handleRun}
					disabled={!question.trim() || tracing}
					className="glass glass-control h-9 shrink-0 rounded-xl px-4 text-xs font-medium text-white transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-30"
				>
					{tracing ? (
						<span className="flex items-center gap-1.5">
							<motion.span
								className="block h-3 w-3 rounded-full border border-white/40 border-t-white"
								animate={{ rotate: 360 }}
								transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
							/>
							追踪中
						</span>
					) : (
						'▶ 运行'
					)}
				</button>
			</div>

			{/* ── Error banner ────────────────────────────────────────────── */}
			{traceError && (
				<motion.div
					initial={{ opacity: 0, y: -4 }}
					animate={{ opacity: 1, y: 0 }}
					className="glass app-card shrink-0 rounded-xl px-4 py-2.5 text-[12px] text-rose-400"
				>
					⚠ {traceError}
				</motion.div>
			)}

			{/* ── Trace steps (scrollable) ──────────────────────────────── */}
			<div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
				{traceResult &&
					traceResult.steps.map((step, i) => (
						<TraceStepCard key={step.step_id} step={step} index={i} onItemClick={setSelectedItem} />
					))}

				{showAnswer && traceResult && <LlmAnswerCard key={traceResult.question} question={traceResult.question} />}
			</div>

			{/* ── Detail modal ───────────────────────────────────────────── */}
			<AnimatePresence>
				{selectedItem && <DetailModal key="detail" item={selectedItem} onClose={() => setSelectedItem(null)} />}
			</AnimatePresence>
		</div>
	);
}
