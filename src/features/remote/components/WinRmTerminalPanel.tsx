'use client';

import React from 'react';
import type { WinRmTerminalLine, WinRmTerminalStatus } from '../domain/types';
import { Icon } from '@/components/ui/Icon';

interface WinRmTerminalPanelProps {
	open: boolean;
	status: WinRmTerminalStatus;
	lines: WinRmTerminalLine[];
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onToggle: () => void;
}

const STATUS_CLASS: Record<WinRmTerminalStatus, string> = {
	idle: 'bg-white/[0.04] text-white/30',
	running: 'bg-sky-400/10 text-sky-200',
	done: 'bg-emerald-400/10 text-emerald-200',
	error: 'bg-rose-500/10 text-rose-300',
};

const STATUS_LABEL: Record<WinRmTerminalStatus, string> = {
	idle: 'idle',
	running: 'running',
	done: 'done',
	error: 'error',
};

export function WinRmTerminalPanel({
	open,
	status,
	lines,
	scrollRef,
	onToggle,
}: WinRmTerminalPanelProps) {
	return (
		<div
			className={`glass app-card relative shrink-0 overflow-hidden transition-[height] duration-200 ${
				open ? 'h-48' : 'h-10'
			}`}
		>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />

			{/* Header bar */}
			<div className="flex h-10 items-center gap-2 border-b border-white/[0.05] px-3">
				<button
					type="button"
					onClick={onToggle}
					className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-medium text-white/55 transition-colors hover:text-white/80"
				>
					<span className="w-3 text-center text-[10px] text-white/30">
						{open ? '▾' : '▸'}
					</span>
					<Icon name="gear" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span className="min-w-0 flex-1 truncate">WinRM SSH Setup</span>
				</button>
				<span
					className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[status]}`}
				>
					{STATUS_LABEL[status]}
				</span>
			</div>

			{/* Terminal output */}
			{open && (
				<div
					ref={scrollRef}
					className="remote-file-scrollbar h-[calc(100%-40px)] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.65]"
				>
					{lines.length === 0 ? (
						<span className="text-white/25">等待输出…</span>
					) : (
						lines.map((line) => (
							<div
								key={line.id}
								className={
									line.stream === 'error'
										? 'text-rose-300'
										: line.stream === 'status'
											? 'text-white/30'
											: 'text-white/65'
								}
							>
								{line.text}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}
