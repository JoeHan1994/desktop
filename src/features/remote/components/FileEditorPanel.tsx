'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ContentSearchResult } from '../domain/types';
import { PROBLEM_CONTEXT_LINES } from '../domain/logFilter';
import { sftpToDisplay } from '../domain/pathUtils';
import { CmTraceLogContent, FileContentCopyButton, HighlightedContent } from './FileViewer';
import { Icon } from '@/components/ui/Icon';

interface ContentContextMenu {
	x: number;
	y: number;
	selectedText: string;
}

interface BugReportModal {
	selectedText: string;
}

interface FileEditorPanelProps {
	activeConnectionId: string | null;
	activeConnectionLabel: string | null;
	selectedFile: string | null;
	editorDraft: string;
	fileReadError: boolean;
	loadingFile: boolean;
	isEditing: boolean;
	saving: boolean;
	saveMsg: string;
	autoRefresh: boolean;
	textSearchQuery: string;
	filterProblemContext: boolean;
	textSearchResult: ContentSearchResult;
	useLogViewer: boolean;
	onToggleAutoRefresh: () => void;
	onForceReload: () => void;
	onToggleEdit: () => void;
	onDraftChange: (v: string) => void;
	onSave: () => void;
	onSearchChange: (v: string) => void;
	onClearSearch: () => void;
	onToggleFilter: () => void;
}

export function FileEditorPanel({
	activeConnectionId,
	activeConnectionLabel,
	selectedFile,
	editorDraft,
	fileReadError,
	loadingFile,
	isEditing,
	saving,
	saveMsg,
	autoRefresh,
	textSearchQuery,
	filterProblemContext,
	textSearchResult,
	useLogViewer,
	onToggleAutoRefresh,
	onForceReload,
	onToggleEdit,
	onDraftChange,
	onSave,
	onSearchChange,
	onClearSearch,
	onToggleFilter,
}: FileEditorPanelProps) {
	const [contextMenu, setContextMenu] = useState<ContentContextMenu | null>(null);
	const [bugModal, setBugModal] = useState<BugReportModal | null>(null);
	const [bugNotes, setBugNotes] = useState('');
	const [bugCopied, setBugCopied] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!contextMenu) return;
		const closeMenu = () => setContextMenu(null);
		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest('[data-content-context-menu]')) return;
			closeMenu();
		};
		window.addEventListener('mousedown', onMouseDown);
		window.addEventListener('contextmenu', closeMenu);
		window.addEventListener('resize', closeMenu);
		window.addEventListener('scroll', closeMenu, true);
		return () => {
			window.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('contextmenu', closeMenu);
			window.removeEventListener('resize', closeMenu);
			window.removeEventListener('scroll', closeMenu, true);
		};
	}, [contextMenu]);

	function handleContentContextMenu(e: React.MouseEvent) {
		e.preventDefault();
		const selectedText = window.getSelection()?.toString() ?? '';
		setContextMenu({ x: e.clientX, y: e.clientY, selectedText });
	}

	async function handleCopy() {
		if (contextMenu?.selectedText) {
			try {
				await navigator.clipboard.writeText(contextMenu.selectedText);
			} catch {
				/* ignore */
			}
		}
		setContextMenu(null);
	}

	async function handlePaste() {
		if (!isEditing) {
			setContextMenu(null);
			return;
		}
		try {
			const text = await navigator.clipboard.readText();
			const textarea = textareaRef.current;
			if (textarea && text) {
				const start = textarea.selectionStart ?? 0;
				const end = textarea.selectionEnd ?? 0;
				const newVal = editorDraft.slice(0, start) + text + editorDraft.slice(end);
				onDraftChange(newVal);
				requestAnimationFrame(() => {
					textarea.selectionStart = start + text.length;
					textarea.selectionEnd = start + text.length;
					textarea.focus();
				});
			}
		} catch {
			/* clipboard read failed */
		}
		setContextMenu(null);
	}

	function handleCreateBug() {
		setBugNotes('');
		setBugCopied(false);
		setBugModal({ selectedText: contextMenu?.selectedText ?? '' });
		setContextMenu(null);
	}

	async function handleCopyBugReport() {
		const timestamp = new Date().toLocaleString('zh-CN');
		const lines: string[] = [
			'[Bug Report]',
			`文件: ${sftpToDisplay(selectedFile ?? '')}`,
			`机器: ${activeConnectionLabel ?? ''}`,
			`时间: ${timestamp}`,
			'',
			'日志内容:',
			bugModal?.selectedText ?? '',
		];
		if (bugNotes) lines.push('', '备注:', bugNotes);
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
			setBugCopied(true);
			setTimeout(() => setBugCopied(false), 2000);
		} catch {
			/* ignore */
		}
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<AnimatePresence mode="wait">
				{selectedFile ? (
					<motion.div
						key={`${activeConnectionId ?? 'none'}:${selectedFile}`}
						initial={{ opacity: 0, x: 12 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="glass app-card relative flex h-full min-h-0 flex-col overflow-hidden"
					>
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

						{/* Toolbar */}
						<div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
							<span
								className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/50"
								title={sftpToDisplay(selectedFile)}
							>
								{sftpToDisplay(selectedFile)}
							</span>

							<button
								type="button"
								onClick={onToggleAutoRefresh}
								disabled={fileReadError}
								className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
									autoRefresh
										? 'bg-emerald-500/15 text-emerald-400'
										: 'bg-white/[0.04] text-white/35 hover:text-white/65'
								}`}
							>
								<span
									className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`}
								/>
								{autoRefresh ? '监视中' : '实时监视'}
							</button>

							<button
								type="button"
								onClick={onForceReload}
								className="shrink-0 rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/35 transition-colors hover:text-white/65"
							>
								刷新
							</button>

							<button
								type="button"
								onClick={onToggleEdit}
								disabled={fileReadError}
								className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
									isEditing
										? 'bg-white/[0.08] text-white/70 hover:text-white'
										: 'bg-white/[0.04] text-white/35 hover:text-white/65'
								}`}
							>
								{isEditing ? '🔒 退出编辑' : '✏️ 编辑'}
							</button>

							<FileContentCopyButton content={editorDraft} disabled={loadingFile || fileReadError} />

							{isEditing && !fileReadError && (
								<button
									type="button"
									onClick={onSave}
									disabled={saving}
									className="shrink-0 rounded-lg px-3 py-1 text-[11px] font-medium text-white transition-all disabled:opacity-40"
									style={{
										background: 'rgb(var(--accent-rgb) / 0.14)',
										border: '1px solid rgb(var(--accent-rgb) / 0.3)',
									}}
								>
									{saving ? '保存中…' : '保 存'}
								</button>
							)}

							<AnimatePresence>
								{saveMsg && (
									<motion.span
										initial={{ opacity: 0, x: 6 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0 }}
										className={`shrink-0 text-[11px] ${saveMsg.startsWith('✗') ? 'text-rose-400' : 'text-emerald-400'}`}
									>
										{saveMsg}
									</motion.span>
								)}
							</AnimatePresence>
						</div>

						{/* Search/filter bar */}
						{!isEditing && !fileReadError && (
							<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.05] px-4 py-2">
								<div className="glass glass-input flex h-8 min-w-[180px] flex-1 items-center gap-2 rounded-lg px-2.5">
									<svg
										viewBox="0 0 24 24"
										className="h-3.5 w-3.5 shrink-0 text-white/30"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
									>
										<circle cx="11" cy="11" r="7" />
										<path d="m16.5 16.5 3 3" />
									</svg>
									<input
										value={textSearchQuery}
										onChange={(e) => onSearchChange(e.target.value)}
										placeholder="搜索文本"
										className="min-w-0 flex-1 bg-transparent text-[12px] text-white/75 placeholder:text-white/28 focus:outline-none"
									/>
									{textSearchQuery && (
										<button
											type="button"
											onClick={onClearSearch}
											aria-label="清除搜索"
											className="shrink-0 rounded-md px-1.5 text-[13px] text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
										>
											×
										</button>
									)}
								</div>
								<button
									type="button"
									onClick={onToggleFilter}
									title={`过滤错误/异常/警告及上下 ${PROBLEM_CONTEXT_LINES} 行`}
									className={`remote-toolbar-button h-8 shrink-0 rounded-lg px-2.5 text-[11px] transition-colors ${
										filterProblemContext ? 'remote-toolbar-button-active' : ''
									}`}
								>
									Filter
								</button>
								<span
									className={`remote-toolbar-badge shrink-0 rounded-lg px-2.5 py-1 text-[11px] ${
										useLogViewer ? 'remote-toolbar-badge-active' : ''
									}`}
								>
									{useLogViewer ? 'CMTrace' : 'Text'}
								</span>
								<span className="remote-toolbar-meta shrink-0 text-[11px]">
									{filterProblemContext && textSearchResult.problemFiltered
										? `${textSearchResult.problemLineCount.toLocaleString()} 条问题 · ${textSearchResult.problemContextLineCount.toLocaleString()} 行上下文`
										: textSearchResult.hasQuery
											? `${textSearchResult.totalMatches.toLocaleString()} 个匹配 · ${textSearchResult.matchedLineCount.toLocaleString()} 行`
											: `${textSearchResult.rawLineCount.toLocaleString()} 行`}
								</span>
							</div>
						)}

						{/* Content area */}
						<div className="min-h-0 flex-1 flex flex-col overflow-hidden" onContextMenu={handleContentContextMenu}>
							{loadingFile ? (
								<div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/30">
									<Icon name="loader" className="h-4 w-4 animate-spin" aria-hidden="true" />
									加载中…
								</div>
							) : isEditing ? (
								<textarea
									ref={textareaRef}
									className="remote-file-scrollbar min-h-0 flex-1 resize-none overflow-y-auto bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-white/80 placeholder:text-white/20 focus:outline-none"
									spellCheck={false}
									value={editorDraft}
									onChange={(e) => onDraftChange(e.target.value)}
									placeholder="选择文件后显示内容…"
									autoFocus
								/>
							) : useLogViewer ? (
								<CmTraceLogContent searchQuery={textSearchQuery} searchResult={textSearchResult} />
							) : (
								<HighlightedContent searchQuery={textSearchQuery} searchResult={textSearchResult} />
							)}
						</div>
					</motion.div>
				) : (
					<motion.div
						key="empty"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						className="flex h-full flex-col items-center justify-center gap-3 text-white/20"
					>
						<svg
							viewBox="0 0 24 24"
							className="h-12 w-12 opacity-30"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.2"
							strokeLinecap="round"
						>
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
							<line x1="16" y1="13" x2="8" y2="13" />
							<line x1="16" y1="17" x2="8" y2="17" />
							<polyline points="10 9 9 9 8 9" />
						</svg>
						<span className="text-sm">{activeConnectionLabel ? '← 在左侧选择一个文件' : '请先连接或选择远程机器'}</span>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Content area right-click context menu */}
			{typeof window !== 'undefined' &&
				contextMenu !== null &&
				createPortal(
					<div
						data-content-context-menu
						className="glass app-popover fixed z-[9999] min-w-[148px] overflow-hidden rounded-xl py-1 text-[12px]"
						style={{ left: contextMenu.x, top: contextMenu.y }}
					>
						<button
							type="button"
							onClick={() => void handleCopy()}
							disabled={!contextMenu.selectedText}
							className="context-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-white/65 transition-colors hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-35"
						>
							<Icon name="copy" className="h-3.5 w-3.5" aria-hidden="true" />
							复制
						</button>
						<button
							type="button"
							onClick={() => void handlePaste()}
							disabled={!isEditing}
							className="context-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-white/65 transition-colors hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-35"
						>
							<svg
								viewBox="0 0 24 24"
								className="h-3.5 w-3.5"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.75"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
								<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
								<path d="M12 11v6" />
								<path d="M9 14h6" />
							</svg>
							粘贴
						</button>
						<div className="my-1 border-t border-white/[0.06]" />
						<button
							type="button"
							onClick={handleCreateBug}
							className="context-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-white/65 transition-colors hover:text-white/85"
						>
							<svg
								viewBox="0 0 24 24"
								className="h-3.5 w-3.5"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.75"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="13" r="4" />
								<path d="M12 9V3" />
								<path d="m8 11-4-3" />
								<path d="m16 11 4-3" />
								<path d="M8 21 5 19" />
								<path d="m16 21 3-2" />
								<path d="M8 16H4" />
								<path d="M20 16h-4" />
							</svg>
							Create Bug
						</button>
					</div>,
					document.body,
				)}

			{/* Create Bug modal */}
			{typeof window !== 'undefined' &&
				bugModal !== null &&
				createPortal(
					<div
						className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
						onMouseDown={() => setBugModal(null)}
					>
						<div
							className="glass app-popover relative flex w-full max-w-[560px] max-h-[80vh] flex-col overflow-hidden shadow-2xl rounded-2xl"
							onMouseDown={(e) => e.stopPropagation()}
						>
							{/* Header */}
							<div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
								<span className="text-[13px] font-medium text-white/85">Create Bug Report</span>
								<button
									type="button"
									onClick={() => setBugModal(null)}
									className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
								>
									<Icon name="x" className="h-3.5 w-3.5" aria-hidden="true" />
								</button>
							</div>

							{/* Body */}
							<div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
								<div>
									<label className="text-[11px] text-white/45 mb-1 block">文件</label>
									<div className="rounded-lg bg-white/[0.04] px-3 py-1.5 font-mono text-[12px] text-white/55 truncate">
										{sftpToDisplay(selectedFile ?? '')}
									</div>
								</div>
								{activeConnectionLabel && (
									<div>
										<label className="text-[11px] text-white/45 mb-1 block">机器</label>
										<div className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/55">
											{activeConnectionLabel}
										</div>
									</div>
								)}
								<div>
									<label className="text-[11px] text-white/45 mb-1 block">
										日志内容{!bugModal.selectedText && <span className="ml-1 text-white/30">（未选中文本）</span>}
									</label>
									<textarea
										readOnly
										value={bugModal.selectedText}
										placeholder="未选中任何内容"
										className="remote-file-scrollbar w-full rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-[12px] text-white/65 placeholder:text-white/25 focus:outline-none resize-none"
										rows={6}
									/>
								</div>
								<div>
									<label className="text-[11px] text-white/45 mb-1 block">备注</label>
									<textarea
										value={bugNotes}
										onChange={(e) => setBugNotes(e.target.value)}
										placeholder="添加额外说明…"
										className="remote-file-scrollbar w-full rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] text-white/65 placeholder:text-white/25 focus:outline-none resize-none focus:ring-1 focus:ring-white/[0.12]"
										rows={3}
									/>
								</div>
							</div>

							{/* Footer */}
							<div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
								<button
									type="button"
									onClick={() => setBugModal(null)}
									className="rounded-lg px-3 py-1.5 text-[12px] text-white/45 transition-colors hover:text-white/70"
								>
									关闭
								</button>
								<button
									type="button"
									onClick={() => void handleCopyBugReport()}
									className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-white/80 transition-all"
									style={{
										background: 'rgb(var(--accent-rgb) / 0.14)',
										border: '1px solid rgb(var(--accent-rgb) / 0.3)',
									}}
								>
									<Icon name={bugCopied ? 'check' : 'copy'} className="h-3.5 w-3.5" aria-hidden="true" />
									{bugCopied ? '已复制' : '复制报告'}
								</button>
							</div>
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
