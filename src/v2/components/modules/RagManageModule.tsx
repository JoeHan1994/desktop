'use client';

import { useMemo, useRef, useState } from 'react';
import { BentoCard, BentoGrid } from '../ui/Bento';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Pill } from '../ui/Pill';
import { Led } from '../ui/Led';
import { Track } from '../ui/Meter';
import { useToast } from '../ui/Toast';
import { usePipelineStats } from '@/v2/hooks/usePipelineStats';
import { ChunkScatterMap, type ChunkPoint } from './ChunkScatterMap';
import { IconFile, IconUpload } from '../ui/icons';

/* ------------------------------------------------------------------ */
/* 演示数据                                                             */
/* ------------------------------------------------------------------ */

type ParseStatus = 'pending' | 'chunking' | 'indexed';

interface DocRow {
	id: string;
	name: string;
	format: string;
	chunks: number;
	status: ParseStatus;
	color: string;
}

const DOCS: DocRow[] = [
	{ id: 'doc-a', name: 'infra-handbook.pdf', format: 'PDF', chunks: 312, status: 'indexed', color: '#6366f1' },
	{ id: 'doc-b', name: 'api-spec.md', format: 'MD', chunks: 148, status: 'indexed', color: '#10b981' },
	{ id: 'doc-c', name: 'security-audit.docx', format: 'DOCX', chunks: 96, status: 'chunking', color: '#f59e0b' },
	{ id: 'doc-d', name: 'onboarding.pdf', format: 'PDF', chunks: 0, status: 'pending', color: '#8b5cf6' },
];

const SAMPLE_TEXT = [
	'The ingestion pipeline normalizes whitespace and strips control characters before chunking.',
	'Retrieval augments the prompt with the top-k nearest chunks ranked by cosine similarity.',
	'Certificate rotation runs nightly and alerts operators 7 days before expiry.',
	'HNSW index build progresses incrementally as new vectors stream from the embedder.',
	'Overlap of 50 tokens preserves semantic continuity across adjacent chunks.',
];

function makeChunks(): ChunkPoint[] {
	const out: ChunkPoint[] = [];
	const clustered = DOCS.filter((d) => d.status !== 'pending');
	let n = 0;
	clustered.forEach((doc, di) => {
		const cx = Math.cos((di / clustered.length) * Math.PI * 2) * 0.55;
		const cy = Math.sin((di / clustered.length) * Math.PI * 2) * 0.55;
		const count = 50;
		for (let i = 0; i < count; i++) {
			const a = Math.random() * Math.PI * 2;
			const r = Math.random() * 0.32;
			out.push({
				id: `chk-${(90000 + n).toString()}`,
				x: cx + Math.cos(a) * r,
				y: cy + Math.sin(a) * r,
				color: doc.color,
				docId: doc.id,
				token: 256 + Math.floor(Math.random() * 256),
				score: 0.7 + Math.random() * 0.29,
				text: SAMPLE_TEXT[(i + di) % SAMPLE_TEXT.length],
			});
			n++;
		}
	});
	return out;
}

const statusMeta: Record<ParseStatus, { tone: 'neutral' | 'warning' | 'success'; label: string; led: 'idle' | 'warn' | 'vector' }> = {
	pending: { tone: 'neutral', label: '待处理', led: 'idle' },
	chunking: { tone: 'warning', label: '分块中', led: 'warn' },
	indexed: { tone: 'success', label: '已索引', led: 'vector' },
};

/* ------------------------------------------------------------------ */
/* 模块                                                                 */
/* ------------------------------------------------------------------ */

export function RagManageModule() {
	const stats = usePipelineStats();
	const { notify } = useToast();
	const fileInput = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [docFilter, setDocFilter] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const allChunks = useMemo(makeChunks, []);
	const chunks = useMemo(
		() => (docFilter ? allChunks.filter((c) => c.docId === docFilter) : allChunks),
		[allChunks, docFilter],
	);
	const selected = allChunks.find((c) => c.id === selectedId) ?? null;

	const totalDocs = stats?.file_count || 1420;
	const totalChunks = stats?.chunk_count || 842100;
	const vectorDim = stats?.model_dim || 1536;

	function ingest(files: FileList | null) {
		if (!files || files.length === 0) return;
		notify({ tone: 'info', title: '已加入摄取队列', body: `${files.length} 个文件 · PDF / MD / DOCX` });
	}

	const sampleVector = selected
		? Array.from({ length: 8 }, (_, i) => (Math.sin((selected.x + i) * 3.1) * 0.5).toFixed(4)).join(', ')
		: '';

	return (
		<div className="v2-module">
			<header className="v2-module__head">
				<div>
					<h1 className="v2-module__title">RAG 知识库与向量可视化</h1>
					<p className="v2-module__desc">文档摄取 · 分块检查 · 高维嵌入散点探索</p>
				</div>
				<Button variant="primary" onClick={() => fileInput.current?.click()}>
					<IconUpload width={16} height={16} /> 上传文档
				</Button>
			</header>

			<BentoGrid>
				{/* 知识库状态 1x1 */}
				<BentoCard span="1x1" label="知识库状态">
					<div className="v2-stack-4 v2-fill">
						<div className="v2-col">
							<span className="v2-kpi">{totalDocs.toLocaleString()}</span>
							<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
								文档总数
							</span>
						</div>
						<div className="v2-row v2-between">
							<div className="v2-col">
								<span className="v2-kpi v2-kpi--sm">{(totalChunks / 1000).toFixed(1)}k</span>
								<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
									分块
								</span>
							</div>
							<div className="v2-col" style={{ alignItems: 'flex-end' }}>
								<span className="v2-kpi v2-kpi--sm">{vectorDim}</span>
								<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
									向量维度
								</span>
							</div>
						</div>
					</div>
				</BentoCard>

				{/* 文档上传区 2x1 */}
				<BentoCard span="2x1" label="文档摄取管线">
					<input
						ref={fileInput}
						type="file"
						multiple
						hidden
						accept=".pdf,.md,.docx,.txt"
						onChange={(e) => ingest(e.target.files)}
					/>
					<div
						className={`v2-dropzone${dragging ? ' v2-dropzone--active' : ''}`}
						onClick={() => fileInput.current?.click()}
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={(e) => {
							e.preventDefault();
							setDragging(false);
							ingest(e.dataTransfer.files);
						}}
					>
						<span className="v2-dropzone__ring" />
						<span className="v2-dropzone__icon">
							<IconUpload />
						</span>
						<div className="v2-col" style={{ alignItems: 'center' }}>
							<span className="v2-subtitle">拖拽 PDF / MD / DOCX 到此处</span>
							<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-sm)' }}>
								或点击浏览 · 自动进入分块与嵌入管线
							</span>
						</div>
					</div>
				</BentoCard>

				{/* 交互式向量散点图 3x2 */}
				<BentoCard span="3x2" label="交互式向量散点图" padded={false}>
					<div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--v2-space-5)', gap: 'var(--v2-space-3)' }}>
						<div className="v2-row v2-between v2-wrap v2-gap-2">
							<span className="v2-bento-card__label">按文档着色 · 空间距离 ≈ 向量相似度</span>
							<div className="v2-row v2-gap-2 v2-wrap">
								<Pill active={docFilter === null} onClick={() => setDocFilter(null)}>
									全部
								</Pill>
								{DOCS.filter((d) => d.status !== 'pending').map((d) => (
									<Pill key={d.id} active={docFilter === d.id} onClick={() => setDocFilter(d.id)}>
										<span className="v2-led" style={{ background: d.color }} /> {d.name}
									</Pill>
								))}
							</div>
						</div>
						<div className="v2-fill" style={{ minHeight: 320 }}>
							<ChunkScatterMap points={chunks} selectedId={selectedId} onSelect={setSelectedId} />
						</div>
					</div>
				</BentoCard>

				{/* 分块检查器 1x2 */}
				<BentoCard span="1x2" label="分块检查器">
					{selected ? (
						<div className="v2-drawer">
							<div className="v2-row v2-between">
								<span className="v2-mono v2-subtitle">#{selected.id}</span>
								<Led tone="vector" />
							</div>
							<div className="v2-drawer__scroll">
								<div className="v2-surface-block v2-row v2-between">
									<span className="v2-text-muted">Token</span>
									<span className="v2-mono">{selected.token}</span>
								</div>
								<div className="v2-surface-block v2-row v2-between">
									<span className="v2-text-muted">重叠</span>
									<span className="v2-mono">50</span>
								</div>
								<div className="v2-surface-block v2-col v2-gap-2">
									<span className="v2-text-muted">相似度得分</span>
									<Track value={selected.score * 100} color="var(--v2-accent-vector)" />
									<span className="v2-mono v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
										{selected.score.toFixed(3)}
									</span>
								</div>
								<div className="v2-col v2-gap-2">
									<span className="v2-label">原始文本</span>
									<div className="v2-chunk-text">{selected.text}</div>
								</div>
								<div className="v2-col v2-gap-2">
									<span className="v2-label">向量数组 (前 8 维)</span>
									<code className="v2-vector-array">[{sampleVector}, …]</code>
								</div>
							</div>
						</div>
					) : (
						<div className="v2-col v2-gap-2 v2-fill" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
							<span className="v2-dropzone__icon">
								<IconFile />
							</span>
							<span className="v2-text-muted">在散点图中点击一个分块节点</span>
							<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-sm)' }}>
								查看元数据、Token 指标与原始向量
							</span>
						</div>
					)}
				</BentoCard>

				{/* 文档列表 4x1 */}
				<BentoCard span="4x1" label="文档列表">
					<div className="v2-table-wrap">
						<table className="v2-table">
							<thead>
								<tr>
									<th>文档</th>
									<th>格式</th>
									<th>分块数</th>
									<th>解析状态</th>
									<th style={{ textAlign: 'right' }}>操作</th>
								</tr>
							</thead>
							<tbody>
								{DOCS.map((d) => {
									const meta = statusMeta[d.status];
									return (
										<tr key={d.id}>
											<td>
												<span className="v2-row v2-gap-2">
													<span className="v2-led" style={{ background: d.color }} />
													{d.name}
												</span>
											</td>
											<td>
												<span className="v2-badge">{d.format}</span>
											</td>
											<td className="v2-mono">{d.chunks.toLocaleString()}</td>
											<td>
												<Badge tone={meta.tone} dot>
													{meta.label}
												</Badge>
											</td>
											<td>
												<div className="v2-table__actions">
													<Button size="sm" variant="ghost" onClick={() => setDocFilter(d.id)}>
														聚焦
													</Button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</BentoCard>
			</BentoGrid>
		</div>
	);
}
