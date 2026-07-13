'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ContentSearchResult } from '../domain/types';
import { classifyLine, logLevelClasses, parseLogLine, renderHighlightedLine } from '../domain/logParser';
import { MAX_LINES } from '../domain/logFilter';
import { Icon } from '@/components/ui/Icon';

// ── Copy button ────────────────────────────────────────────────────────────

export function FileContentCopyButton({
	content,
	disabled = false,
	className = '',
}: {
	content: string;
	disabled?: boolean;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		};
	}, []);

	async function handleCopy() {
		if (disabled) return;
		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
			copiedTimer.current = setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			title="Copy entire file"
			aria-label="Copy entire file"
			disabled={disabled}
			className={`inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-white/35 shadow-sm ring-1 ring-white/[0.08] backdrop-blur transition-colors hover:bg-white/[0.08] hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
		>
			<Icon
				name={copied ? 'check' : 'copy'}
				className="h-3.5 w-3.5"
				aria-hidden="true"
			/>
		</button>
	);
}

// ── CMTrace structured log viewer ──────────────────────────────────────────

export function CmTraceLogContent({
	searchQuery,
	searchResult,
}: {
	searchQuery: string;
	searchResult: ContentSearchResult;
}) {
	const { lines, clipped, rawLineCount, hasQuery, problemFiltered } = searchResult;
	const scrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight;
		});
	}, [searchResult]);

	return (
		<div
			ref={scrollRef}
			className="remote-file-scrollbar min-h-0 flex-1 overflow-auto select-text"
		>
			<table className="w-full min-w-[520px] border-collapse font-mono text-[12px] leading-[1.55]">
				<tbody>
					{lines.map((line) => {
						const log = parseLogLine(line);
						return (
							<tr
								key={line.originalIndex}
								className={`border-b border-white/[0.025] ${logLevelClasses(log.level)}`}
							>
								<td className="select-none px-3 py-1.5 text-right text-[11px] text-white/22 align-top">
									{log.lineNumber}
								</td>
								<td
									className="px-2 py-1.5 break-all whitespace-pre-wrap align-top text-white/78"
									title={log.source || undefined}
								>
									{renderHighlightedLine(log.message, searchQuery)}
								</td>
							</tr>
						);
					})}

					{(hasQuery || problemFiltered) && lines.length === 0 && (
						<tr>
							<td
								colSpan={2}
								className="py-8 text-center text-[12px] text-white/30"
							>
								{problemFiltered ? '未发现错误/异常/警告' : '没有匹配结果'}
							</td>
						</tr>
					)}

					{clipped && (
						<tr>
							<td
								colSpan={2}
								className="py-2 text-center text-[11px] text-white/25"
							>
								文件较大，仅显示最新 {MAX_LINES.toLocaleString()} 行（共{' '}
								{rawLineCount.toLocaleString()} 行）
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

// ── Generic highlighted content viewer ─────────────────────────────────────

export function HighlightedContent({
	searchQuery,
	searchResult,
}: {
	searchQuery: string;
	searchResult: ContentSearchResult;
}) {
	const { lines, clipped, rawLineCount, hasQuery, problemFiltered } = searchResult;
	const scrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight;
		});
	}, [searchResult]);

	return (
		<div
			ref={scrollRef}
			className="remote-file-scrollbar min-h-0 flex-1 overflow-y-auto select-text"
		>
			<table className="w-full border-collapse font-mono text-[12.5px] leading-[1.65]">
				<tbody>
					{lines.map((line) => {
						const text = line.text;
						const lvl = classifyLine(text);
						return (
							<tr
								key={line.originalIndex}
								className={`group ${
									lvl === 'error'
										? 'bg-rose-500/[0.09] hover:bg-rose-500/[0.14]'
										: lvl === 'warn'
											? 'bg-amber-400/[0.08] hover:bg-amber-400/[0.13]'
											: 'hover:bg-white/[0.03]'
								}`}
							>
								<td className="w-12 shrink-0 select-none pr-4 pl-3 text-right text-[11px] text-white/20 align-top pt-px">
									{line.originalIndex + 1}
								</td>
								<td
									className={`pr-5 break-all whitespace-pre-wrap align-top ${
										lvl === 'error'
											? 'text-rose-300'
											: lvl === 'warn'
												? 'text-amber-300'
												: 'text-white/78'
									}`}
								>
									{lvl !== 'normal' && (
										<span
											className={`mr-2 inline-block h-full w-0.5 rounded-full align-middle ${
												lvl === 'error' ? 'bg-rose-400' : 'bg-amber-400'
											}`}
										/>
									)}
									{renderHighlightedLine(text, searchQuery)}
								</td>
							</tr>
						);
					})}

					{(hasQuery || problemFiltered) && lines.length === 0 && (
						<tr>
							<td className="w-12 select-none pr-4 pl-3 text-right text-[11px] text-white/20 align-top pt-px" />
							<td className="py-8 text-center text-[12px] text-white/30">
								{problemFiltered ? '未发现错误/异常/警告' : '没有匹配结果'}
							</td>
						</tr>
					)}

					{clipped && (
						<tr>
							<td
								colSpan={2}
								className="py-2 text-center text-[11px] text-white/25"
							>
								文件较大，仅显示最新 {MAX_LINES.toLocaleString()} 行（共{' '}
								{rawLineCount.toLocaleString()} 行）
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}
