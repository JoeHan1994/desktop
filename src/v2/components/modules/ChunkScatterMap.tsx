'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { IconTarget, IconZoomIn, IconZoomOut } from '../ui/icons';

export interface ChunkPoint {
	id: string;
	x: number;
	y: number;
	color: string;
	docId: string;
	token: number;
	score: number;
	text: string;
}

interface ScatterProps {
	points: ChunkPoint[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}

/** k 近邻（数据空间欧氏距离）。 */
function knn(points: ChunkPoint[], target: ChunkPoint, k: number): ChunkPoint[] {
	return points
		.filter((p) => p.id !== target.id)
		.map((p) => ({ p, d: (p.x - target.x) ** 2 + (p.y - target.y) ** 2 }))
		.sort((a, b) => a.d - b.d)
		.slice(0, k)
		.map((e) => e.p);
}

/**
 * 交互式向量散点图（ChunkScatterMap）。
 * Canvas 2D 渲染降维后的分块嵌入；悬停高亮 KNN，点击锁定 Inspector。
 */
export function ChunkScatterMap({ points, selectedId, onSelect }: ScatterProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const [zoom, setZoom] = useState(1);
	const pan = useRef({ x: 0, y: 0 });
	const drag = useRef<{ x: number; y: number } | null>(null);
	const [hovered, setHovered] = useState<ChunkPoint | null>(null);
	const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

	const bounds = useMemo(() => {
		if (points.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const p of points) {
			minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
			minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
		}
		return { minX, maxX, minY, maxY };
	}, [points]);

	const project = useCallback(
		(p: ChunkPoint, w: number, h: number) => {
			const pad = 28;
			const sx = (p.x - bounds.minX) / (bounds.maxX - bounds.minX || 1);
			const sy = (p.y - bounds.minY) / (bounds.maxY - bounds.minY || 1);
			const x = pad + sx * (w - pad * 2);
			const y = pad + sy * (h - pad * 2);
			return {
				x: (x - w / 2) * zoom + w / 2 + pan.current.x,
				y: (y - h / 2) * zoom + h / 2 + pan.current.y,
			};
		},
		[bounds, zoom],
	);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!canvas || !wrap) return;
		const dpr = window.devicePixelRatio || 1;
		const w = wrap.clientWidth;
		const h = wrap.clientHeight;
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		// KNN 连线
		if (hovered) {
			const neighbors = knn(points, hovered, 6);
			const hp = project(hovered, w, h);
			ctx.strokeStyle = 'rgba(139, 92, 246, 0.45)';
			ctx.lineWidth = 1;
			for (const n of neighbors) {
				const np = project(n, w, h);
				ctx.beginPath();
				ctx.moveTo(hp.x, hp.y);
				ctx.lineTo(np.x, np.y);
				ctx.stroke();
			}
		}

		// 点
		for (const p of points) {
			const { x, y } = project(p, w, h);
			const isSel = p.id === selectedId;
			const isHover = hovered?.id === p.id;
			const r = isSel ? 6 : isHover ? 5 : 3;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = p.color;
			ctx.globalAlpha = isSel || isHover ? 1 : 0.75;
			ctx.fill();
			if (isSel) {
				ctx.globalAlpha = 1;
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
		}
	}, [points, project, hovered, selectedId]);

	useEffect(() => {
		draw();
		const ro = new ResizeObserver(draw);
		if (wrapRef.current) ro.observe(wrapRef.current);
		return () => ro.disconnect();
	}, [draw]);

	const pick = useCallback(
		(clientX: number, clientY: number): ChunkPoint | null => {
			const canvas = canvasRef.current;
			const wrap = wrapRef.current;
			if (!canvas || !wrap) return null;
			const rect = canvas.getBoundingClientRect();
			const mx = clientX - rect.left;
			const my = clientY - rect.top;
			const w = wrap.clientWidth;
			const h = wrap.clientHeight;
			let best: ChunkPoint | null = null;
			let bestD = 196; // 14px²
			for (const p of points) {
				const { x, y } = project(p, w, h);
				const d = (x - mx) ** 2 + (y - my) ** 2;
				if (d < bestD) {
					bestD = d;
					best = p;
				}
			}
			return best;
		},
		[points, project],
	);

	return (
		<div
			ref={wrapRef}
			className="v2-scatter"
			onMouseMove={(e) => {
				if (drag.current) {
					pan.current = {
						x: pan.current.x + (e.clientX - drag.current.x),
						y: pan.current.y + (e.clientY - drag.current.y),
					};
					drag.current = { x: e.clientX, y: e.clientY };
					draw();
					return;
				}
				const p = pick(e.clientX, e.clientY);
				setHovered(p);
				const rect = wrapRef.current?.getBoundingClientRect();
				if (p && rect) setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
				else setTooltip(null);
			}}
			onMouseDown={(e) => {
				drag.current = { x: e.clientX, y: e.clientY };
			}}
			onMouseUp={(e) => {
				const wasDrag = drag.current;
				drag.current = null;
				const moved = wasDrag && (Math.abs(e.clientX - wasDrag.x) > 3 || Math.abs(e.clientY - wasDrag.y) > 3);
				if (!moved) {
					const p = pick(e.clientX, e.clientY);
					if (p) onSelect(p.id);
				}
			}}
			onMouseLeave={() => {
				drag.current = null;
				setHovered(null);
				setTooltip(null);
			}}
			onWheel={(e) => {
				setZoom((z) => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
			}}
		>
			<canvas ref={canvasRef} />
			<div className="v2-scatter__tools">
				<Button size="sm" variant="outline" iconOnly aria-label="放大" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
					<IconZoomIn width={15} height={15} />
				</Button>
				<Button size="sm" variant="outline" iconOnly aria-label="缩小" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
					<IconZoomOut width={15} height={15} />
				</Button>
				<Button
					size="sm"
					variant="outline"
					iconOnly
					aria-label="复位"
					onClick={() => {
						setZoom(1);
						pan.current = { x: 0, y: 0 };
						draw();
					}}
				>
					<IconTarget width={15} height={15} />
				</Button>
			</div>
			{hovered && tooltip && (
				<div className="v2-scatter__tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
					{hovered.id} · {hovered.token} tok · score {hovered.score.toFixed(3)}
				</div>
			)}
		</div>
	);
}
