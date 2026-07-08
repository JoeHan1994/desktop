'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useModelProviders, type ModelProvider } from '@/features/models/ModelProvidersContext';
import { streamChat, type LLMMessage, type TokenStats } from '@/services/llmClient';
import {
	getSetting,
	rdpOpen,
	setSetting,
	sshConnect,
	sshDisconnect,
	sshGetDisks,
	sshListHyperVVMs,
	sshListDir,
	sshReadFile,
	sshSetHyperVVMState,
	sshUnwatchFile,
	sshWatchFile,
	sshWriteFile,
	subscribeRemoteFileChanged,
	subscribeWinRmOpenSshSetupOutput,
	winRmRunOpenSshSetup,
	type HyperVVirtualMachine,
	type RemoteConnection,
	type RemoteFileEntry,
	type RemoteMachineProfile,
	type WinRmOpenSshSetupOutputPayload,
} from '@/services/tauriBridge';

// ── 类型 ───────────────────────────────────────────────────────────────────

type FileEntry = RemoteFileEntry;

interface TreeNode extends FileEntry {
	/** null = 目录但尚未加载子项；[] = 已加载且为空 */
	children: TreeNode[] | null;
	expanded: boolean;
}

type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';
type WinRmTerminalStatus = 'idle' | 'running' | 'done' | 'error';

interface WinRmTerminalLine {
	id: string;
	stream: WinRmOpenSshSetupOutputPayload['stream'];
	text: string;
}

interface HyperVVmCredentialProfile {
	id: string;
	label: string;
	host: string;
	port: string;
	username: string;
	password: string;
	parentProfileId: string;
	vmId: string;
	vmName: string;
	lastConnectedAt: string;
}

interface PendingVmConnection {
	parentConnection: RemoteConnection;
	vm: HyperVVirtualMachine;
	host: string;
	credentialKey: string;
}

interface RdpCredential {
	username?: string;
	password?: string;
}

interface WinRmOpenSshSetupTarget {
	key: string;
	label: string;
	host: string;
	username?: string;
	password?: string;
	sshPort?: string;
}

const EMPTY_TREE_RECORD: Record<string, TreeNode[]> = {};

// ── 工具函数 ───────────────────────────────────────────────────────────────

function buildNodes(entries: FileEntry[]): TreeNode[] {
	return entries.map((e) => ({
		...e,
		children: e.is_dir ? null : [],
		expanded: false,
	}));
}

/** 将 SFTP 路径（/C:/...）转换为可读的 Windows 路径（C:\...）。 */
function sftpToDisplay(path: string): string {
	// /C:/ → C:\
	return path.replace(/^\/([A-Za-z]):\//, '$1:\\').replace(/\//g, '\\');
}

/** 从 SFTP 磁盘路径（/C:/）提取盘符显示名（C:）。 */
function diskLabel(sftpDisk: string): string {
	const m = sftpDisk.match(/^\/([A-Za-z]):\//);
	return m ? `${m[1].toUpperCase()}:` : sftpDisk;
}

function formatSize(bytes: number | null): string {
	if (bytes === null || bytes === 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 深度更新树中匹配 targetPath 的节点。 */
function updateNode(nodes: TreeNode[], targetPath: string, updater: (n: TreeNode) => TreeNode): TreeNode[] {
	return nodes.map((n) => {
		if (n.path === targetPath) return updater(n);
		if (n.children && n.children.length > 0) {
			return { ...n, children: updateNode(n.children, targetPath, updater) };
		}
		return n;
	});
}

function collectTreeFileSizes(nodes: TreeNode[], target: Map<string, number | null>) {
	for (const node of nodes) {
		if (!node.is_dir) target.set(node.path, node.size);
		if (node.children) collectTreeFileSizes(node.children, target);
	}
}

// ── 错误 / 警告行分类与高亮显示 ─────────────────────────────────

/** 匹配错误级别的日志行模式（英文 + 中文 + 堆栈跟踪） */
const RE_ERROR =
	/\b(error|errors|exception|exceptions|fatal|critical|traceback|panic|crash|crashed|failed|failure)\b|\b(Error|Exception|Fatal)\b|\[\ *ERROR\b|\[\ *FATAL\b|错误|异常|失败|崩溃/i;

const RE_WARN = /\b(warn(?:ing)?|caution|deprecated|deprecation)\b|\[\ *WARN\b|警告|注意/i;

/** Java/Python/.NET 堆栈跟踪行 */
const RE_STACK = /^\s+at\s+|^\s+caused\s+by\s*:|^\s+\.{3}\s+\d+\s+more\b|^\s+File\s+".+",\s+line\s+\d+/i;

type LineLevel = 'error' | 'warn' | 'normal';

function classifyLine(line: string): LineLevel {
	if (RE_ERROR.test(line) || RE_STACK.test(line)) return 'error';
	if (RE_WARN.test(line)) return 'warn';
	return 'normal';
}

const MAX_LINES = 8000;
const PROBLEM_CONTEXT_LINES = 5;
const LOG_ANALYSIS_CONTEXT_BLOCKS = 5;
const LOG_ANALYSIS_NO_ERROR_BLOCK_LIMIT = 40;
const MAX_ANALYSIS_REMOTE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_ANALYSIS_CONTENT_CHARS = 180_000;
const ANALYSIS_READ_TIMEOUT_MS = 45_000;
const ANALYSIS_STREAM_IDLE_TIMEOUT_MS = 120_000;

class AnalysisAbortError extends Error {}

class AnalysisTimeoutError extends Error {}

interface ContentDisplayLine {
	text: string;
	originalIndex: number;
	matchCount: number;
}

interface ContentSearchResult {
	lines: ContentDisplayLine[];
	totalMatches: number;
	matchedLineCount: number;
	problemLineCount: number;
	problemContextLineCount: number;
	rawLineCount: number;
	clipped: boolean;
	hasQuery: boolean;
	problemFiltered: boolean;
}

type AnalysisLanguage = 'ch' | 'en';

function countMatches(line: string, query: string): number {
	const q = query.trim();
	if (!q) return 0;
	const haystack = line.toLowerCase();
	const needle = q.toLowerCase();
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

function isProblemLine(line: string): boolean {
	return classifyLine(line) !== 'normal' || /\btype="(?:2|3)"/i.test(line);
}

function buildProblemContextLines(indexedLines: ContentDisplayLine[]): ContentDisplayLine[] {
	const ranges = indexedLines
		.map((line, index) => (isProblemLine(line.text) ? index : -1))
		.filter((index) => index >= 0)
		.map((index) => ({
			start: Math.max(0, index - PROBLEM_CONTEXT_LINES),
			end: Math.min(indexedLines.length - 1, index + PROBLEM_CONTEXT_LINES),
		}));

	if (ranges.length === 0) return [];
	return mergeBlockRanges(ranges).flatMap((range) => indexedLines.slice(range.start, range.end + 1));
}

function buildContentSearchResult(content: string, query: string, filterProblems: boolean): ContentSearchResult {
	const raw = content.split('\n');
	const clipped = raw.length > MAX_LINES;
	const startLineIndex = clipped ? raw.length - MAX_LINES : 0;
	const limited = raw.slice(startLineIndex);
	const normalizedQuery = query.trim();
	const hasQuery = normalizedQuery.length > 0;
	const indexedLines = limited.map((text, index) => ({
		text,
		originalIndex: startLineIndex + index,
		matchCount: countMatches(text, normalizedQuery),
	}));
	const matchedLineCount = hasQuery ? indexedLines.filter((line) => line.matchCount > 0).length : 0;
	const totalMatches = hasQuery ? indexedLines.reduce((sum, line) => sum + line.matchCount, 0) : 0;
	const problemLineCount = indexedLines.filter((line) => isProblemLine(line.text)).length;
	const shouldFilterProblems = filterProblems && !hasQuery;
	const matchedLines = hasQuery ? indexedLines.filter((line) => line.matchCount > 0) : indexedLines;
	const problemContextLines = shouldFilterProblems ? buildProblemContextLines(indexedLines) : indexedLines;
	const lines = hasQuery ? matchedLines : problemContextLines;

	return {
		lines,
		totalMatches,
		matchedLineCount,
		problemLineCount,
		problemContextLineCount: shouldFilterProblems ? problemContextLines.length : 0,
		rawLineCount: raw.length,
		clipped,
		hasQuery,
		problemFiltered: shouldFilterProblems,
	};
}

function renderHighlightedLine(line: string, query: string): React.ReactNode {
	const q = query.trim();
	if (!q) return line || '\u00a0';
	const haystack = line.toLowerCase();
	const needle = q.toLowerCase();
	const parts: React.ReactNode[] = [];
	let cursor = 0;
	let index = haystack.indexOf(needle);

	while (index !== -1) {
		if (index > cursor) parts.push(line.slice(cursor, index));
		const end = index + needle.length;
		parts.push(
			<mark key={`${index}-${end}`} className="rounded bg-emerald-400/25 px-0.5 text-emerald-100">
				{line.slice(index, end)}
			</mark>,
		);
		cursor = end;
		index = haystack.indexOf(needle, cursor);
	}

	if (cursor < line.length) parts.push(line.slice(cursor));
	return parts.length > 0 ? parts : '\u00a0';
}

type LogLevel = 'error' | 'warn' | 'info' | 'normal';

interface ParsedLogLine {
	lineNumber: number;
	raw: string;
	message: string;
	time: string;
	level: LogLevel;
	component: string;
	thread: string;
	source: string;
	isCmTrace: boolean;
}

function parseCmTraceAttributes(raw: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const re = /([A-Za-z_][\w-]*)="([^"]*)"/g;
	let match = re.exec(raw);
	while (match) {
		attrs[match[1].toLowerCase()] = match[2];
		match = re.exec(raw);
	}
	return attrs;
}

function cmTraceLevel(typeValue: string | undefined, fallbackText: string): LogLevel {
	if (typeValue === '3') return 'error';
	if (typeValue === '2') return 'warn';
	const fallback = classifyLine(fallbackText);
	if (fallback === 'error') return 'error';
	if (fallback === 'warn') return 'warn';
	return typeValue === '1' ? 'info' : 'normal';
}

function parseLogLine(line: ContentDisplayLine): ParsedLogLine {
	const raw = line.text;
	const cmTrace = raw.match(/^<!\[LOG\[(.*)\]LOG\]!><(.*)>$/);
	if (cmTrace) {
		const attrs = parseCmTraceAttributes(cmTrace[2]);
		const date = attrs.date ?? '';
		const time = attrs.time ?? '';
		return {
			lineNumber: line.originalIndex + 1,
			raw,
			message: cmTrace[1] || raw,
			time: [date, time].filter(Boolean).join(' '),
			level: cmTraceLevel(attrs.type, cmTrace[1]),
			component: attrs.component ?? '',
			thread: attrs.thread ?? '',
			source: attrs.file ?? '',
			isCmTrace: true,
		};
	}

	const timestamp = raw.match(
		/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\d{1,2}\/\d{1,2}\/\d{4}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(.*)$/,
	);
	const text = timestamp ? timestamp[2] : raw;
	const lvl = classifyLine(raw);
	return {
		lineNumber: line.originalIndex + 1,
		raw,
		message: text || raw,
		time: timestamp?.[1] ?? '',
		level: lvl === 'error' ? 'error' : lvl === 'warn' ? 'warn' : 'normal',
		component: '',
		thread: '',
		source: '',
		isCmTrace: false,
	};
}

function shouldUseLogViewer(path: string | null, searchResult: ContentSearchResult): boolean {
	const normalizedPath = path?.toLowerCase() ?? '';
	if (/\.(log|lo_)$/i.test(normalizedPath)) return true;
	return searchResult.lines.slice(0, 80).some((line) => /^<!\[LOG\[/.test(line.text));
}

interface LogAnalysisBlock {
	startLine: number;
	endLine: number;
	text: string;
}

interface AnalysisContentPayload {
	content: string;
	isFilteredLog: boolean;
}

type AnalysisFileStatus = 'pending' | 'running' | 'done' | 'error' | 'aborted';

interface AnalysisFileResult {
	path: string;
	displayPath: string;
	status: AnalysisFileStatus;
	statusDetail: string;
	language: AnalysisLanguage;
	output: string;
	error: string;
	stats: TokenStats | null;
	isFilteredLog: boolean;
}

interface AnalysisLanguageContent {
	content: string;
	hasLanguageSections: boolean;
}

function splitAnalysisLanguageSections(output: string): Record<AnalysisLanguage, string> {
	const sections: Record<AnalysisLanguage, string> = { ch: '', en: '' };
	const markerRegex = /^\s*<!--\s*ANALYSIS:(CH|EN)\s*-->\s*$/gim;
	const matches = Array.from(output.matchAll(markerRegex));

	for (const [index, match] of matches.entries()) {
		const language = match[1].toLowerCase() as AnalysisLanguage;
		const start = (match.index ?? 0) + match[0].length;
		const end = matches[index + 1]?.index ?? output.length;
		sections[language] = output.slice(start, end).trim();
	}

	return sections;
}

function getAnalysisLanguageContent(output: string, language: AnalysisLanguage): AnalysisLanguageContent {
	const sections = splitAnalysisLanguageSections(output);
	const hasLanguageSections = Boolean(sections.ch || sections.en);
	return {
		content: hasLanguageSections ? sections[language] : output.trim(),
		hasLanguageSections,
	};
}

function isCmTraceBlockStart(line: string): boolean {
	return /^<!\[LOG\[/.test(line);
}

function hasCmTraceBlocks(content: string): boolean {
	return content.split('\n').some(isCmTraceBlockStart);
}

function shouldFilterLogForAnalysis(path: string | null, content: string): boolean {
	const normalizedPath = path?.toLowerCase() ?? '';
	return /\.(log|lo_)$/i.test(normalizedPath) && hasCmTraceBlocks(content);
}

function splitLogAnalysisBlocks(content: string): LogAnalysisBlock[] {
	const lines = content.split('\n');
	const blocks: LogAnalysisBlock[] = [];
	let currentStart = 0;
	let currentLines: string[] = [];

	for (const [index, line] of lines.entries()) {
		if (isCmTraceBlockStart(line) && currentLines.length > 0) {
			blocks.push({
				startLine: currentStart,
				endLine: index - 1,
				text: currentLines.join('\n'),
			});
			currentStart = index;
			currentLines = [];
		}

		if (currentLines.length === 0) currentStart = index;
		currentLines.push(line);
	}

	if (currentLines.length > 0) {
		blocks.push({
			startLine: currentStart,
			endLine: lines.length - 1,
			text: currentLines.join('\n'),
		});
	}

	return blocks;
}

function isErrorLogAnalysisBlock(block: LogAnalysisBlock): boolean {
	const firstLine = block.text.split('\n')[0] ?? '';
	const parsed = parseLogLine({ text: firstLine, originalIndex: block.startLine, matchCount: 0 });
	return parsed.level === 'error' || classifyLine(block.text) === 'error';
}

function mergeBlockRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
	const sortedRanges = ranges.sort((a, b) => a.start - b.start);
	const merged: Array<{ start: number; end: number }> = [];

	for (const range of sortedRanges) {
		const previous = merged[merged.length - 1];
		if (!previous || range.start > previous.end + 1) {
			merged.push({ ...range });
		} else {
			previous.end = Math.max(previous.end, range.end);
		}
	}

	return merged;
}

function buildFilteredLogAnalysisContent(content: string): string {
	const blocks = splitLogAnalysisBlocks(content);
	const errorIndexes = blocks
		.map((block, index) => ({ block, index }))
		.filter(({ block }) => isErrorLogAnalysisBlock(block))
		.map(({ index }) => index);

	if (errorIndexes.length === 0) {
		const fallbackBlocks = blocks.slice(-LOG_ANALYSIS_NO_ERROR_BLOCK_LIMIT);
		return [
			'日志预处理说明：当前文件识别为 CMTrace 日志，但未筛选到明确错误/异常块。',
			`原始日志共有 ${blocks.length.toLocaleString()} 个 <![LOG[ 块；以下仅保留最新 ${fallbackBlocks.length.toLocaleString()} 个块供确认。`,
			'分析时只能把下面的原始日志行作为证据，不要引用本说明。',
			'',
			fallbackBlocks.map((block) => block.text).join('\n'),
		].join('\n');
	}

	const ranges = mergeBlockRanges(
		errorIndexes.map((index) => ({
			start: Math.max(0, index - LOG_ANALYSIS_CONTEXT_BLOCKS),
			end: Math.min(blocks.length - 1, index + LOG_ANALYSIS_CONTEXT_BLOCKS),
		})),
	);
	const extractedBlockCount = ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
	const extractedSections = ranges.map((range, index) =>
		[
			`--- 抽取片段 ${index + 1} / ${ranges.length}：错误/异常块上下 ${LOG_ANALYSIS_CONTEXT_BLOCKS} 个 <![LOG[ 块，重叠范围已合并 ---`,
			blocks
				.slice(range.start, range.end + 1)
				.map((block) => block.text)
				.join('\n'),
		].join('\n'),
	);

	return [
		'日志预处理说明：当前文件识别为 CMTrace 日志，已先筛选错误/异常块及其上下文后再提交给模型。',
		`命中 ${errorIndexes.length.toLocaleString()} 个错误/异常块；从原始 ${blocks.length.toLocaleString()} 个 <![LOG[ 块中抽取并合并为 ${ranges.length.toLocaleString()} 个片段，共 ${extractedBlockCount.toLocaleString()} 个块。`,
		'分析时只能把抽取片段中的原始日志行作为证据，不要引用本说明或片段分隔线。',
		'',
		...extractedSections,
	].join('\n');
}

function buildAnalysisContent(path: string | null, content: string): AnalysisContentPayload {
	if (!shouldFilterLogForAnalysis(path, content)) return { content, isFilteredLog: false };
	return { content: buildFilteredLogAnalysisContent(content), isFilteredLog: true };
}

function isTransientRemoteReadError(err: unknown): boolean {
	return /channel send error|channel closed|connection reset|broken pipe/i.test(String(err));
}

async function readRemoteFileWithRetry(connectionId: string, path: string): Promise<string> {
	try {
		return await sshReadFile(connectionId, path);
	} catch (err: unknown) {
		if (!isTransientRemoteReadError(err)) throw err;
		await delay(250);
		return sshReadFile(connectionId, path);
	}
}

function analysisErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function withAnalysisTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutMessage: string,
	signal?: AbortSignal,
): Promise<T> {
	if (signal?.aborted) return Promise.reject(new AnalysisAbortError('分析已停止。'));

	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timeoutId: ReturnType<typeof setTimeout>;
		const onAbort = () => finish(() => reject(new AnalysisAbortError('分析已停止。')));
		const cleanup = () => {
			clearTimeout(timeoutId);
			signal?.removeEventListener('abort', onAbort);
		};
		const finish = (complete: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			complete();
		};

		timeoutId = setTimeout(() => finish(() => reject(new AnalysisTimeoutError(timeoutMessage))), timeoutMs);
		signal?.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => finish(() => resolve(value)),
			(err: unknown) => finish(() => reject(err)),
		);
	});
}

async function* withAnalysisStreamIdleTimeout<T>(
	stream: AsyncIterable<T>,
	timeoutMs: number,
	timeoutMessage: string,
	signal: AbortSignal,
): AsyncGenerator<T> {
	const iterator = stream[Symbol.asyncIterator]();
	try {
		while (true) {
			const next = await withAnalysisTimeout(iterator.next(), timeoutMs, timeoutMessage, signal);
			if (next.done) return;
			yield next.value;
		}
	} finally {
		await iterator.return?.();
	}
}

function limitAnalysisContentForModel(payload: AnalysisContentPayload): AnalysisContentPayload {
	if (payload.content.length <= MAX_ANALYSIS_CONTENT_CHARS) return payload;

	const retainedContent = payload.content.slice(-MAX_ANALYSIS_CONTENT_CHARS);
	return {
		...payload,
		content: [
			'分析输入裁剪说明：为避免模型长时间无响应，已裁剪过长输入。',
			`原始预处理内容长度 ${payload.content.length.toLocaleString()} 字符；以下仅保留末尾 ${retainedContent.length.toLocaleString()} 字符。`,
			'分析时只能把下面保留的原始内容作为证据，不要引用本说明。',
			'',
			retainedContent,
		].join('\n'),
	};
}

function logLevelClasses(level: LogLevel): string {
	if (level === 'error') return 'bg-rose-500/[0.11] text-rose-200 hover:bg-rose-500/[0.16]';
	if (level === 'warn') return 'bg-amber-400/[0.1] text-amber-200 hover:bg-amber-400/[0.15]';
	return 'text-white/72 hover:bg-white/[0.03]';
}

function FileContentCopyButton({
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
			<Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" aria-hidden="true" />
		</button>
	);
}

function CmTraceLogContent({ searchQuery, searchResult }: { searchQuery: string; searchResult: ContentSearchResult }) {
	const { lines, clipped, rawLineCount, hasQuery, problemFiltered } = searchResult;
	const scrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;
		requestAnimationFrame(() => {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		});
	}, [searchResult]);

	return (
		<div ref={scrollRef} className="remote-file-scrollbar min-h-0 flex-1 overflow-auto select-text">
			<table className="w-full min-w-[520px] border-collapse font-mono text-[12px] leading-[1.55]">
				<tbody>
					{lines.map((line) => {
						const log = parseLogLine(line);
						return (
							<tr key={line.originalIndex} className={`border-b border-white/[0.025] ${logLevelClasses(log.level)}`}>
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
							<td colSpan={2} className="py-8 text-center text-[12px] text-white/30">
								{problemFiltered ? '未发现错误/异常/警告' : '没有匹配结果'}
							</td>
						</tr>
					)}

					{clipped && (
						<tr>
							<td colSpan={2} className="py-2 text-center text-[11px] text-white/25">
								文件较大，仅显示最新 {MAX_LINES.toLocaleString()} 行（共 {rawLineCount.toLocaleString()} 行）
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

/** 带行号的只读视图，错误行红色高亮，警告行黄色高亮。 */
function HighlightedContent({ searchQuery, searchResult }: { searchQuery: string; searchResult: ContentSearchResult }) {
	const { lines, clipped, rawLineCount, hasQuery, problemFiltered } = searchResult;
	const scrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;
		requestAnimationFrame(() => {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		});
	}, [searchResult]);

	return (
		<div ref={scrollRef} className="remote-file-scrollbar min-h-0 flex-1 overflow-y-auto select-text">
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
								{/* 行号 */}
								<td className="w-12 shrink-0 select-none pr-4 pl-3 text-right text-[11px] text-white/20 align-top pt-px">
									{line.originalIndex + 1}
								</td>

								{/* 行内容 */}
								<td
									className={`pr-5 break-all whitespace-pre-wrap align-top ${
										lvl === 'error' ? 'text-rose-300' : lvl === 'warn' ? 'text-amber-300' : 'text-white/78'
									}`}
								>
									{/* 错误 / 警告左边屏 */}
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
							<td colSpan={2} className="py-2 text-center text-[11px] text-white/25">
								文件较大，仅显示最新 {MAX_LINES.toLocaleString()} 行（共 {rawLineCount.toLocaleString()} 行）
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

// ── 树节点组件 ─────────────────────────────────────────────────────────────

function TreeItem({
	node,
	depth,
	selected,
	analysisSelected,
	onSelect,
	onToggle,
	onToggleAnalysis,
}: {
	node: TreeNode;
	depth: number;
	selected: string | null;
	analysisSelected: Set<string>;
	onSelect: (n: TreeNode) => void;
	onToggle: (n: TreeNode) => void;
	onToggleAnalysis: (n: TreeNode) => void;
}) {
	const isSelected = selected === node.path;
	const isAnalysisSelected = analysisSelected.has(node.path);

	return (
		<>
			<button
				type="button"
				onClick={() => (node.is_dir ? onToggle(node) : onSelect(node))}
				title={sftpToDisplay(node.path)}
				className={`flex w-full items-center gap-1.5 rounded-lg py-[3px] text-left text-[12px] transition-colors
          ${isSelected ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'}`}
				style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: 8 }}
			>
				{/* 展开箭头 */}
				<span className="w-3 shrink-0 text-center text-[10px] text-white/25">
					{node.is_dir ? (node.expanded ? '▾' : '▸') : ''}
				</span>

				{node.is_dir ? (
					<span className="w-3 shrink-0" />
				) : (
					<span
						role="checkbox"
						aria-checked={isAnalysisSelected}
						tabIndex={0}
						title={isAnalysisSelected ? '取消加入 Analyze 队列' : '加入 Analyze 队列'}
						onClick={(event) => {
							event.stopPropagation();
							onToggleAnalysis(node);
						}}
						onKeyDown={(event) => {
							if (event.key !== ' ' && event.key !== 'Enter') return;
							event.preventDefault();
							event.stopPropagation();
							onToggleAnalysis(node);
						}}
						className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] ring-1 transition-colors ${
							isAnalysisSelected
								? 'bg-emerald-400/20 text-emerald-200 ring-emerald-300/45'
								: 'bg-white/[0.03] text-transparent ring-white/[0.12] hover:bg-white/[0.06] hover:ring-white/[0.2]'
						}`}
					>
						<Icon name="check" className="h-2.5 w-2.5" aria-hidden="true" />
					</span>
				)}

				{/* 图标 */}
				<span className="shrink-0 text-[11px] leading-none">
					{node.is_dir ? (node.expanded ? '📂' : '📁') : getFileIcon(node.name)}
				</span>

				<span className="min-w-0 flex-1 truncate">{node.name}</span>

				{!node.is_dir && <span className="shrink-0 text-[10px] text-white/20">{formatSize(node.size)}</span>}
			</button>

			<AnimatePresence initial={false}>
				{node.is_dir && node.expanded && node.children && (
					<motion.div
						key="ch"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.18, ease: 'easeInOut' }}
						className="overflow-hidden"
					>
						{node.children.length === 0 ? (
							<span
								className="block text-[11px] text-white/20 py-0.5"
								style={{ paddingLeft: `${10 + (depth + 1) * 14 + 18}px` }}
							>
								空目录
							</span>
						) : (
							node.children.map((child) => (
								<TreeItem
									key={child.path}
									node={child}
									depth={depth + 1}
									selected={selected}
									analysisSelected={analysisSelected}
									onSelect={onSelect}
									onToggle={onToggle}
									onToggleAnalysis={onToggleAnalysis}
								/>
							))
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}

/** 根据文件扩展名返回对应 emoji 图标。 */
function getFileIcon(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	const map: Record<string, string> = {
		txt: '📝',
		log: '📋',
		md: '📄',
		json: '📋',
		xml: '📋',
		yaml: '📋',
		yml: '📋',
		js: '🟨',
		ts: '🟦',
		jsx: '🟨',
		tsx: '🟦',
		css: '🎨',
		html: '🌐',
		py: '🐍',
		rs: '🦀',
		go: '🐹',
		java: '☕',
		cs: '💠',
		cpp: '⚙️',
		c: '⚙️',
		exe: '⚙️',
		dll: '🔧',
		bat: '📜',
		ps1: '📜',
		cmd: '📜',
		zip: '📦',
		rar: '📦',
		gz: '📦',
		tar: '📦',
		png: '🖼️',
		jpg: '🖼️',
		jpeg: '🖼️',
		gif: '🖼️',
		svg: '🖼️',
		ico: '🖼️',
		mp4: '🎬',
		avi: '🎬',
		mp3: '🎵',
		wav: '🎵',
		pdf: '📕',
		doc: '📘',
		docx: '📘',
		xls: '📗',
		xlsx: '📗',
		ini: '⚙️',
		cfg: '⚙️',
		conf: '⚙️',
		env: '⚙️',
	};
	return map[ext] ?? '📄';
}

// ── 样式常量 ───────────────────────────────────────────────────────────────

const fieldCls =
	'glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none';

const REMOTE_PROFILES_SETTING_KEY = 'remote.machine.profiles.v1';
const VM_CREDENTIALS_SETTING_KEY = 'remote.hyperv.vm.credentials.v1';
const MAX_REMOTE_PROFILES = 12;
const MAX_VM_CREDENTIALS = 80;
const VM_START_IP_REFRESH_ATTEMPTS = 6;
const VM_START_IP_REFRESH_DELAY_MS = 1200;
const DEFAULT_RDP_PORT = '3389';
const DEFAULT_WINRM_PORT = 5985;
const OPENSSH_SETUP_SCRIPT_URL = '/downloads/configure-windows-ssh-server.ps1';

interface RemoteActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon: string;
	label: string;
	size?: 'sm' | 'md';
	tone?: 'default' | 'danger';
	spinning?: boolean;
}

function RemoteActionButton({
	icon,
	label,
	size = 'md',
	tone = 'default',
	spinning = false,
	className = '',
	...buttonProps
}: RemoteActionButtonProps) {
	const sizeClass = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
	const iconSizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
	const toneClass = tone === 'danger' ? 'text-rose-400/90 hover:text-rose-300' : 'text-white/48 hover:text-white/78';

	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			className={`inline-flex shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${sizeClass} ${toneClass} ${className}`}
			{...buttonProps}
		>
			<Icon
				name={icon}
				className={`${iconSizeClass} drop-shadow-[0_1px_0_rgba(255,255,255,0.08)] ${spinning ? 'animate-spin' : ''}`}
				aria-hidden="true"
			/>
		</button>
	);
}

function normalizePort(portValue: string): string {
	return portValue.trim() || '22';
}

function normalizeRdpPort(portValue: string | undefined): string {
	return String(portValue ?? '').trim() || DEFAULT_RDP_PORT;
}

function profileId(hostValue: string, portValue: string, usernameValue: string): string {
	return `${usernameValue.trim().toLowerCase()}@${hostValue.trim().toLowerCase()}:${normalizePort(portValue)}`;
}

function profileLabel(profile: Pick<RemoteMachineProfile, 'host' | 'port' | 'username' | 'label'>): string {
	return profile.label.trim() || `${profile.username}@${profile.host}:${normalizePort(profile.port)}`;
}

function parseProfiles(raw: string | null): RemoteMachineProfile[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((item): item is Partial<RemoteMachineProfile> => !!item && typeof item === 'object')
			.map((item) => {
				const hostValue = String(item.host ?? '').trim();
				const usernameValue = String(item.username ?? '').trim();
				const portValue = normalizePort(String(item.port ?? '22'));
				const rdpPortValue = normalizeRdpPort(item.rdpPort);
				if (!hostValue || !usernameValue) return null;
				const profile: RemoteMachineProfile = {
					id: String(item.id ?? profileId(hostValue, portValue, usernameValue)),
					label: String(item.label ?? ''),
					host: hostValue,
					port: portValue,
					rdpPort: rdpPortValue,
					username: usernameValue,
					password: String(item.password ?? ''),
					lastConnectedAt: String(item.lastConnectedAt ?? ''),
				};
				return { ...profile, label: profileLabel(profile) };
			})
			.filter((item): item is RemoteMachineProfile => item !== null)
			.slice(0, MAX_REMOTE_PROFILES);
	} catch {
		return [];
	}
}

function buildProfile(
	hostValue: string,
	portValue: string,
	rdpPortValue: string,
	usernameValue: string,
	passwordValue: string,
	existing?: RemoteMachineProfile,
	labelValue?: string,
): RemoteMachineProfile {
	const normalizedPort = normalizePort(portValue);
	const profile: RemoteMachineProfile = {
		id: profileId(hostValue, normalizedPort, usernameValue),
		label: labelValue?.trim() || existing?.label || '',
		host: hostValue.trim(),
		port: normalizedPort,
		rdpPort: normalizeRdpPort(rdpPortValue || existing?.rdpPort),
		username: usernameValue.trim(),
		password: passwordValue,
		lastConnectedAt: new Date().toISOString(),
	};
	return { ...profile, label: profileLabel(profile) };
}

function parseVmCredentials(raw: string | null): Record<string, HyperVVmCredentialProfile> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return {};
		return Object.fromEntries(
			parsed
				.filter((item): item is Partial<HyperVVmCredentialProfile> => !!item && typeof item === 'object')
				.map((item) => {
					const id = String(item.id ?? '').trim();
					const hostValue = String(item.host ?? '').trim();
					const usernameValue = String(item.username ?? '').trim();
					const vmIdValue = String(item.vmId ?? '').trim();
					const parentProfileIdValue = String(item.parentProfileId ?? '').trim();
					if (!id || !vmIdValue || !parentProfileIdValue) return null;
					const credential: HyperVVmCredentialProfile = {
						id,
						label: String(item.label ?? ''),
						host: hostValue,
						port: normalizePort(String(item.port ?? '22')),
						username: usernameValue,
						password: String(item.password ?? ''),
						parentProfileId: parentProfileIdValue,
						vmId: vmIdValue,
						vmName: String(item.vmName ?? vmIdValue),
						lastConnectedAt: String(item.lastConnectedAt ?? ''),
					};
					return [credential.id, credential] as const;
				})
				.filter((item): item is readonly [string, HyperVVmCredentialProfile] => item !== null),
		);
	} catch {
		return {};
	}
}

function parentCredentialScope(connection: RemoteConnection): string {
	return connection.parentProfileId || `${connection.username}@${connection.host}:${connection.port}`;
}

function vmIdentity(vm: HyperVVirtualMachine): string {
	return vm.id.trim() || vm.name.trim();
}

function isCredentialForVm(
	credential: HyperVVmCredentialProfile,
	parentConnection: RemoteConnection,
	vm: HyperVVirtualMachine,
): boolean {
	return credential.parentProfileId === parentCredentialScope(parentConnection) && credential.vmId === vmIdentity(vm);
}

function isUsableIpv4(value: string): boolean {
	const ip = value.trim();
	if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
	const parts = ip.split('.').map((part) => Number(part));
	if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
	return !(ip === '0.0.0.0' || ip === '127.0.0.1' || ip.startsWith('169.254.') || ip.startsWith('255.'));
}

function pickVmHost(vm: HyperVVirtualMachine): string | null {
	return vm.ipAddresses.find(isUsableIpv4) ?? null;
}

function vmCredentialKey(parentConnection: RemoteConnection, vm: HyperVVirtualMachine): string {
	return `${parentCredentialScope(parentConnection)}:${vmIdentity(vm)}`;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const PROVIDER_LABELS: Record<ModelProvider['provider'], { label: string; color: string }> = {
	ollama: { label: 'Ollama', color: '#34d399' },
	openai: { label: 'OpenAI', color: '#60a5fa' },
};

function buildAnalysisMessages(path: string, content: string, isFilteredLog = false): LLMMessage[] {
	return [
		{
			role: 'system',
			content: [
				'你是一个严谨的软件与运维文件分析助手。你的任务是只根据用户提供的远程文件路径和文件内容进行分析。',
				'',
				'硬性约束：',
				'1. 只能分析原文件中实际出现的内容，不得引入外部背景、通用教程、假设场景、历史上下文或与文件无关的话题。',
				'2. 不得臆测文件未体现的信息；如果某项无法从原文判断，必须明确写“原文件未体现”。',
				'3. 每个结论、风险、建议或判断都必须引用原文件中的具体内容作为依据。',
				'4. 引用依据时使用原文片段，不要编造行号；如果原文片段较长，只摘取能支撑论点的最小必要片段。',
				'5. 不要分析用户未提供的其他文件、系统状态、运行环境、部署方式或命令执行结果。',
				'6. 不要给出与当前文件无关的安全建议、部署建议、代码风格建议或泛泛最佳实践。',
				'7. 如果文件内容不足以支持完整分析，应说明信息不足，并列出还需要哪些原文件内容。',
				'8. 对原文件明确体现的高风险、错误或失败线索使用 🔴；对需要关注但不一定构成错误的问题、警告或不确定线索使用 🟡。不要为了凑格式强行添加表情。',
				'9. 如果输入内容包含“日志预处理说明”或“抽取片段”分隔线，它们只用于限定分析范围，不属于原文件内容，不得作为依据引用。',
				...(isFilteredLog
					? [
							'10. 当前日志内容已经过预处理，只包含错误/异常块及其上下文；必须明确说明分析范围仅限这些抽取片段，不得推断完整日志中未提供的内容。',
						]
					: []),
				'',
				'输出要求：',
				'必须同时输出 CH 和 EN 两个版本，并严格使用下面的分隔标记；不要在分隔标记之外输出任何内容：',
				'<!-- ANALYSIS:CH -->',
				'[中文 Markdown 分析]',
				'<!-- ANALYSIS:EN -->',
				'[English Markdown analysis]',
				'',
				'CH 段使用中文 Markdown，EN 段使用 English Markdown。两段必须基于同一组原文件依据，EN 段不得新增 CH 段没有覆盖的结论、风险或建议。',
				'每个条目都必须包含原文依据：CH 段写“依据：`原文片段`”，EN 段写“Evidence: `原文片段`”。建议按以下结构输出：',
				'<!-- ANALYSIS:CH -->',
				'## 配置或逻辑',
				'- 结论：...',
				'  依据：`原文片段`',
				'',
				'## 潜在风险或异常线索',
				'- 🔴 风险：...',
				'  依据：`原文片段`',
				'  影响：...',
				'- 🟡 注意：...',
				'  依据：`原文片段`',
				'  影响：...',
				'',
				'## 建议的下一步',
				'- 建议：...',
				'  依据：`原文片段`',
				'',
				'<!-- ANALYSIS:EN -->',
				'## Configuration Or Logic',
				'- Finding: ...',
				'  Evidence: `original excerpt`',
				'',
				'## Potential Risks Or Exception Signals',
				'- 🔴 Risk: ...',
				'  Evidence: `original excerpt`',
				'  Impact: ...',
				'- 🟡 Note: ...',
				'  Evidence: `original excerpt`',
				'  Impact: ...',
				'',
				'## Recommended Next Steps',
				'- Recommendation: ...',
				'  Evidence: `original excerpt`',
				'',
				'如果没有发现风险或异常线索，也必须基于原文件内容说明“未从当前文件内容中发现明确风险”，并引用支持该判断的相关片段。',
				'If no risk or exception signal is found, the EN section must also say that no explicit risk was found from the current file content, with supporting original excerpts.',
			].join('\n'),
		},
		{
			role: 'user',
			content: `远程文件路径：${path}\n\n文件内容：\n\n${content}`,
		},
	];
}

// ── 主视图 ─────────────────────────────────────────────────────────────────

export function RemoteMachineView() {
	const { providers } = useModelProviders();
	// 连接表单
	const [profileName, setProfileName] = useState('');
	const [host, setHost] = useState('');
	const [port, setPort] = useState('22');
	const [rdpPort, setRdpPort] = useState(DEFAULT_RDP_PORT);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [connStatus, setConnStatus] = useState<ConnStatus>('idle');
	const [connError, setConnError] = useState('');
	const [profiles, setProfiles] = useState<RemoteMachineProfile[]>([]);
	const [connectingProfileId, setConnectingProfileId] = useState<string | null>(null);
	const [connectingVmKey, setConnectingVmKey] = useState<string | null>(null);
	const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
	const [configOpen, setConfigOpen] = useState(false);
	const [pendingVmConnection, setPendingVmConnection] = useState<PendingVmConnection | null>(null);
	const [vmCredentials, setVmCredentials] = useState<Record<string, HyperVVmCredentialProfile>>({});
	const [vmPowerBusyKey, setVmPowerBusyKey] = useState<string | null>(null);
	const [fetchingVmIpKey, setFetchingVmIpKey] = useState<string | null>(null);
	const [rdpOpeningTarget, setRdpOpeningTarget] = useState<string | null>(null);
	const [winRmBusyTargetKey, setWinRmBusyTargetKey] = useState<string | null>(null);
	const [winRmTerminalOpen, setWinRmTerminalOpen] = useState(false);
	const [winRmTerminalStatus, setWinRmTerminalStatus] = useState<WinRmTerminalStatus>('idle');
	const [winRmTerminalLines, setWinRmTerminalLines] = useState<WinRmTerminalLine[]>([]);
	const [winRmRunId, setWinRmRunId] = useState<string | null>(null);
	const winRmRunIdRef = useRef<string | null>(null);
	const winRmTerminalScrollRef = useRef<HTMLDivElement | null>(null);

	// 在线连接池
	const [connections, setConnections] = useState<RemoteConnection[]>([]);
	const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
	const [connectionDisks, setConnectionDisks] = useState<Record<string, string[]>>({});
	const [connectionTrees, setConnectionTrees] = useState<Record<string, Record<string, TreeNode[]>>>({});
	const [connectionDiskExpanded, setConnectionDiskExpanded] = useState<Record<string, Record<string, boolean>>>({});
	const [connectionHypervVms, setConnectionHypervVms] = useState<Record<string, HyperVVirtualMachine[]>>({});
	const [hypervExpanded, setHypervExpanded] = useState<Record<string, boolean>>({});

	// 文件树
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [analysisSelectedFiles, setAnalysisSelectedFiles] = useState<string[]>([]);

	// 编辑器
	const [fileContent, setFileContent] = useState('');
	const [editorDraft, setEditorDraft] = useState('');
	const [isEditing, setIsEditing] = useState(false);
	const [loadingFile, setLoadingFile] = useState(false);
	const [fileReadError, setFileReadError] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState('');
	const [autoRefresh, setAutoRefresh] = useState(true);
	const [textSearchQuery, setTextSearchQuery] = useState('');
	const [filterProblemContext, setFilterProblemContext] = useState(false);
	const unlistenRef = useRef<(() => void) | null>(null);
	const isDirty = useRef(false);
	const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 当前文件分析
	const [analysisOpen, setAnalysisOpen] = useState(false);
	const [analysisMinimized, setAnalysisMinimized] = useState(false);
	const [analysisProviderId, setAnalysisProviderId] = useState('');
	const [analysisModelOpen, setAnalysisModelOpen] = useState(false);
	const [analysisError, setAnalysisError] = useState('');
	const [analysisResults, setAnalysisResults] = useState<AnalysisFileResult[]>([]);
	const analysisAbortControllersRef = useRef<Record<string, AbortController>>({});
	const watchedFileRef = useRef<{ connectionId: string; path: string } | null>(null);

	// ── 连接 ────────────────────────────────────────────────────────────────

	const selectedAnalysisProvider = useMemo(
		() => providers.find((provider) => provider.id === analysisProviderId) ?? providers[0] ?? null,
		[analysisProviderId, providers],
	);
	const analysisSelectedSet = useMemo(() => new Set(analysisSelectedFiles), [analysisSelectedFiles]);
	const analysisTargetPaths = useMemo(
		() => (analysisSelectedFiles.length > 0 ? analysisSelectedFiles : selectedFile ? [selectedFile] : []),
		[analysisSelectedFiles, selectedFile],
	);
	const totalAnalysisStats = useMemo<TokenStats | null>(() => {
		const stats = analysisResults.map((result) => result.stats).filter((stats): stats is TokenStats => stats !== null);
		if (stats.length === 0) return null;
		const promptTokens = stats.reduce((sum, item) => sum + item.promptTokens, 0);
		const completionTokens = stats.reduce((sum, item) => sum + item.completionTokens, 0);
		const outputTpsValues = stats.map((item) => item.outputTps).filter((value) => value > 0);
		return {
			promptTokens,
			completionTokens,
			inputTps: 0,
			outputTps:
				outputTpsValues.length > 0
					? outputTpsValues.reduce((sum, value) => sum + value, 0) / outputTpsValues.length
					: 0,
		};
	}, [analysisResults]);
	const isAnalyzing = useMemo(
		() => analysisResults.some((result) => result.status === 'pending' || result.status === 'running'),
		[analysisResults],
	);
	const currentTargetsAnalyzing = useMemo(
		() =>
			analysisResults.some(
				(result) =>
					analysisTargetPaths.includes(result.path) && (result.status === 'pending' || result.status === 'running'),
			),
		[analysisResults, analysisTargetPaths],
	);
	useEffect(() => {
		if (providers.length === 0) {
			if (analysisProviderId) setAnalysisProviderId('');
			return;
		}
		if (!analysisProviderId || !providers.some((provider) => provider.id === analysisProviderId)) {
			setAnalysisProviderId(providers[0].id);
		}
	}, [analysisProviderId, providers]);

	useEffect(() => {
		return () => {
			Object.values(analysisAbortControllersRef.current).forEach((controller) => controller.abort());
			analysisAbortControllersRef.current = {};
		};
	}, []);

	useEffect(() => {
		winRmRunIdRef.current = winRmRunId;
	}, [winRmRunId]);

	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | null = null;
		void subscribeWinRmOpenSshSetupOutput((payload) => {
			if (payload.runId !== winRmRunIdRef.current) return;

			const text = payload.line || payload.error || '';
			if (text) {
				setWinRmTerminalLines((current) =>
					[
						...current,
						{
							id: `${payload.runId}:${current.length}:${Date.now()}`,
							stream: payload.stream,
							text,
						},
					].slice(-500),
				);
			}

			if (payload.done) {
				const failed = !!payload.error || payload.stream === 'error' || (payload.exitCode ?? 0) !== 0;
				setWinRmTerminalStatus(failed ? 'error' : 'done');
				setWinRmBusyTargetKey(null);
			}
		})
			.then((dispose) => {
				if (cancelled) dispose();
				else unlisten = dispose;
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			if (unlisten) unlisten();
		};
	}, []);

	useEffect(() => {
		if (!winRmTerminalOpen) return;
		winRmTerminalScrollRef.current?.scrollTo({ top: winRmTerminalScrollRef.current.scrollHeight });
	}, [winRmTerminalLines, winRmTerminalOpen]);

	useEffect(() => {
		let cancelled = false;
		getSetting(REMOTE_PROFILES_SETTING_KEY)
			.then((raw) => {
				if (!cancelled) setProfiles(parseProfiles(raw));
			})
			.catch(() => {
				if (!cancelled) setProfiles([]);
			});
		getSetting(VM_CREDENTIALS_SETTING_KEY)
			.then((raw) => {
				if (!cancelled) setVmCredentials(parseVmCredentials(raw));
			})
			.catch(() => {
				if (!cancelled) setVmCredentials({});
			});
		return () => {
			cancelled = true;
		};
	}, []);

	function persistProfiles(nextProfiles: RemoteMachineProfile[]) {
		setProfiles(nextProfiles);
		void setSetting(REMOTE_PROFILES_SETTING_KEY, JSON.stringify(nextProfiles)).catch(() => {});
	}

	function upsertProfile(nextProfile: RemoteMachineProfile, previousProfileId?: string | null) {
		const nextProfiles = [
			nextProfile,
			...profiles.filter((profile) => profile.id !== nextProfile.id && profile.id !== previousProfileId),
		].slice(0, MAX_REMOTE_PROFILES);
		persistProfiles(nextProfiles);
	}

	function persistVmCredentials(nextCredentials: Record<string, HyperVVmCredentialProfile>) {
		const values = Object.values(nextCredentials)
			.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt))
			.slice(0, MAX_VM_CREDENTIALS);
		const nextMap = Object.fromEntries(values.map((credential) => [credential.id, credential]));
		setVmCredentials(nextMap);
		void setSetting(VM_CREDENTIALS_SETTING_KEY, JSON.stringify(values)).catch(() => {});
	}

	function persistVmCredential(credential: HyperVVmCredentialProfile) {
		persistVmCredentials({
			...Object.fromEntries(
				Object.entries(vmCredentials).filter(
					([id, item]) =>
						id === credential.id ||
						item.parentProfileId !== credential.parentProfileId ||
						item.vmId !== credential.vmId,
				),
			),
			[credential.id]: credential,
		});
	}

	function findVmCredential(
		parentConnection: RemoteConnection,
		vm: HyperVVirtualMachine,
		hostValue = '',
	): HyperVVmCredentialProfile | undefined {
		const stableCredential = vmCredentials[vmCredentialKey(parentConnection, vm)];
		if (stableCredential) return stableCredential;
		const candidates = Object.values(vmCredentials)
			.filter((credential) => isCredentialForVm(credential, parentConnection, vm))
			.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt));
		return candidates.find((credential) => credential.host === hostValue) ?? candidates[0];
	}

	function buildVmCredentialFromForm(pending: PendingVmConnection): HyperVVmCredentialProfile {
		return {
			id: pending.credentialKey,
			label: profileName.trim() || pending.vm.name,
			host: host.trim() || pending.host,
			port: normalizePort(port),
			username: username.trim(),
			password,
			parentProfileId: parentCredentialScope(pending.parentConnection),
			vmId: vmIdentity(pending.vm),
			vmName: pending.vm.name,
			lastConnectedAt: new Date().toISOString(),
		};
	}

	function resetProfileForm() {
		setEditingProfileId(null);
		setProfileName('');
		setHost('');
		setPort('22');
		setRdpPort(DEFAULT_RDP_PORT);
		setUsername('');
		setPassword('');
		setConnError('');
		setPendingVmConnection(null);
	}

	function applyProfile(profile: RemoteMachineProfile) {
		setPendingVmConnection(null);
		setEditingProfileId(profile.id);
		setProfileName(profile.label);
		setHost(profile.host);
		setPort(normalizePort(profile.port));
		setRdpPort(normalizeRdpPort(profile.rdpPort));
		setUsername(profile.username);
		setPassword(profile.password);
		setConnError('');
	}

	function deleteProfile(id: string) {
		persistProfiles(profiles.filter((profile) => profile.id !== id));
	}

	async function handleDeleteProfile(profile: RemoteMachineProfile) {
		deleteProfile(profile.id);
		persistVmCredentials(
			Object.fromEntries(
				Object.entries(vmCredentials).filter(([, credential]) => credential.parentProfileId !== profile.id),
			),
		);
		const connection = connections.find((item) => item.kind === 'host' && item.parentProfileId === profile.id);
		if (connection) await handleDisconnect(connection.id);
	}

	function saveProfileFromForm() {
		if (pendingVmConnection) {
			if (!username.trim()) return;
			const credential = buildVmCredentialFromForm(pendingVmConnection);
			persistVmCredential(credential);
			setConfigOpen(false);
			return;
		}
		if (!host.trim() || !username.trim()) return;
		const nextProfile = buildProfile(host, port, rdpPort, username, password, undefined, profileName);
		upsertProfile(nextProfile, editingProfileId);
		setConfigOpen(false);
	}

	function openNewProfileForm() {
		resetProfileForm();
		setConfigOpen(true);
	}

	function resetEditorState() {
		stopListening();
		resetAnalysisRun();
		setSelectedFile(null);
		setAnalysisSelectedFiles([]);
		setFileContent('');
		setEditorDraft('');
		setIsEditing(false);
		setLoadingFile(false);
		setFileReadError(false);
		setSaving(false);
		setSaveMsg('');
		setAutoRefresh(true);
		setTextSearchQuery('');
		setFilterProblemContext(false);
		isDirty.current = false;
	}

	function switchActiveConnection(connectionId: string | null) {
		if (activeConnectionId && selectedFile) {
			void sshUnwatchFile(activeConnectionId, selectedFile).catch(() => {});
		}
		setActiveConnectionId(connectionId);
		resetEditorState();
	}

	async function loadConnectionFileTree(connectionId: string) {
		const disks = await sshGetDisks(connectionId);
		setConnectionDisks((prev) => ({ ...prev, [connectionId]: disks }));
		setConnectionDiskExpanded((prev) => ({
			...prev,
			[connectionId]: Object.fromEntries(disks.map((disk) => [disk, true])),
		}));

		const initTrees: Record<string, TreeNode[]> = {};
		for (const disk of disks) {
			try {
				const entries = await sshListDir(connectionId, disk);
				initTrees[disk] = buildNodes(entries);
			} catch {
				initTrees[disk] = [];
			}
		}
		setConnectionTrees((prev) => ({ ...prev, [connectionId]: initTrees }));
	}

	async function refreshHyperV(connectionId: string): Promise<HyperVVirtualMachine[]> {
		const vms = await sshListHyperVVMs(connectionId).catch(() => []);
		setConnectionHypervVms((prev) => ({ ...prev, [connectionId]: vms }));
		setHypervExpanded((prev) => ({ ...prev, [connectionId]: vms.length > 0 }));
		return vms;
	}

	function updateVmPowerState(connectionId: string, vm: HyperVVirtualMachine, state: string) {
		setConnectionHypervVms((prev) => {
			const vms = prev[connectionId];
			if (!vms) return prev;
			return {
				...prev,
				[connectionId]: vms.map((item) =>
					vmIdentity(item) === vmIdentity(vm) ? { ...item, state, status: state } : item,
				),
			};
		});
	}

	async function waitForVmHost(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) {
		for (let attempt = 0; attempt < VM_START_IP_REFRESH_ATTEMPTS; attempt += 1) {
			const refreshedVms = await refreshHyperV(parentConnection.id);
			const refreshedVm = refreshedVms.find((item) => vmIdentity(item) === vmIdentity(vm)) ?? vm;
			const vmHost = pickVmHost(refreshedVm);
			if (vmHost) return buildPendingVm(parentConnection, refreshedVm, vmHost);
			if (attempt < VM_START_IP_REFRESH_ATTEMPTS - 1) await delay(VM_START_IP_REFRESH_DELAY_MS);
		}
		return null;
	}

	async function handleConnect(profile?: RemoteMachineProfile) {
		const pendingVm = pendingVmConnection;
		const hostValue = (profile?.host ?? host).trim();
		const portValue = normalizePort(profile?.port ?? port);
		const rdpPortValue = normalizeRdpPort(profile?.rdpPort ?? rdpPort);
		const usernameValue = (profile?.username ?? username).trim();
		const passwordValue = profile?.password ?? password;
		if (!hostValue || !usernameValue) return;

		if (profile) applyProfile(profile);
		setConnStatus('connecting');
		setConnError('');
		setConnectingProfileId(profile?.id ?? null);
		setConnectingVmKey(pendingVm?.credentialKey ?? null);
		try {
			const baseProfile =
				profile ??
				buildProfile(hostValue, portValue, rdpPortValue, usernameValue, passwordValue, undefined, profileName);
			const connection = await sshConnect({
				host: hostValue,
				port: Number(portValue),
				username: usernameValue,
				password: passwordValue,
				label: pendingVm ? profileName.trim() || pendingVm.vm.name : profile ? profile.label : profileName,
				kind: pendingVm ? 'vm' : 'host',
				parentConnectionId: pendingVm?.parentConnection.id,
				parentProfileId: pendingVm ? parentCredentialScope(pendingVm.parentConnection) : baseProfile.id,
				vmId: pendingVm ? vmIdentity(pendingVm.vm) : undefined,
			});

			setConnections((prev) => [...prev, connection]);
			switchActiveConnection(connection.id);
			await loadConnectionFileTree(connection.id);

			if (pendingVm) {
				const credential = buildVmCredentialFromForm(pendingVm);
				persistVmCredential(credential);
			} else {
				upsertProfile(
					buildProfile(
						hostValue,
						portValue,
						rdpPortValue,
						usernameValue,
						passwordValue,
						profile,
						profile ? profile.label : profileName,
					),
					profile?.id ?? editingProfileId,
				);
				void refreshHyperV(connection.id);
			}
			setConnStatus('connected');
			setConfigOpen(false);
			setPendingVmConnection(null);
			setEditingProfileId(null);
		} catch (err: unknown) {
			setConnError(String(err));
			setConnStatus('error');
		} finally {
			setConnectingProfileId(null);
			setConnectingVmKey(null);
		}
	}

	async function handleDisconnect(connectionId = activeConnectionId) {
		if (!connectionId) return;
		const target = connections.find((connection) => connection.id === connectionId);
		const idsToDisconnect = new Set<string>([connectionId]);
		if (target?.kind === 'host') {
			connections
				.filter((connection) => connection.parentConnectionId === connectionId)
				.forEach((connection) => idsToDisconnect.add(connection.id));
		}

		if (activeConnectionId && idsToDisconnect.has(activeConnectionId)) {
			resetEditorState();
		}

		for (const id of idsToDisconnect) {
			try {
				await sshDisconnect(id);
			} catch {
				/* ignore */
			}
		}

		setConnections((prev) => prev.filter((connection) => !idsToDisconnect.has(connection.id)));
		setConnectionDisks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToDisconnect.has(id))));
		setConnectionTrees((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToDisconnect.has(id))));
		setConnectionDiskExpanded((prev) =>
			Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToDisconnect.has(id))),
		);
		setConnectionHypervVms((prev) =>
			Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToDisconnect.has(id))),
		);
		setHypervExpanded((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToDisconnect.has(id))));

		if (activeConnectionId && idsToDisconnect.has(activeConnectionId)) {
			const fallback = connections.find((connection) => !idsToDisconnect.has(connection.id))?.id ?? null;
			setActiveConnectionId(fallback);
		}
		if (connections.every((connection) => idsToDisconnect.has(connection.id))) setConnStatus('idle');
	}

	// ── 文件树展开 ──────────────────────────────────────────────────────────

	function toggleDiskRoot(disk: string) {
		if (!activeConnectionId) return;
		setConnectionDiskExpanded((prev) => ({
			...prev,
			[activeConnectionId]: {
				...(prev[activeConnectionId] ?? {}),
				[disk]: !(prev[activeConnectionId]?.[disk] ?? true),
			},
		}));
	}

	async function handleToggle(node: TreeNode) {
		if (!node.is_dir || !activeConnectionId) return;
		const activeDiskRoots = connectionDisks[activeConnectionId] ?? [];

		// 找到该节点所属的磁盘根
		const diskRoot = activeDiskRoots.find((d) => node.path.startsWith(d));
		if (!diskRoot) return;

		// 已有子节点 → 仅切换展开/折叠
		if (node.children !== null) {
			setConnectionTrees((prev) => ({
				...prev,
				[activeConnectionId]: {
					...(prev[activeConnectionId] ?? {}),
					[diskRoot]: updateNode(prev[activeConnectionId]?.[diskRoot] ?? [], node.path, (n) => ({
						...n,
						expanded: !n.expanded,
					})),
				},
			}));
			return;
		}

		// 首次展开 → 加载子目录
		try {
			const entries = await sshListDir(activeConnectionId, node.path);
			const children = buildNodes(entries);
			setConnectionTrees((prev) => ({
				...prev,
				[activeConnectionId]: {
					...(prev[activeConnectionId] ?? {}),
					[diskRoot]: updateNode(prev[activeConnectionId]?.[diskRoot] ?? [], node.path, (n) => ({
						...n,
						children,
						expanded: true,
					})),
				},
			}));
		} catch {
			// 无权限等情况：标记为已加载空列表
			setConnectionTrees((prev) => ({
				...prev,
				[activeConnectionId]: {
					...(prev[activeConnectionId] ?? {}),
					[diskRoot]: updateNode(prev[activeConnectionId]?.[diskRoot] ?? [], node.path, (n) => ({
						...n,
						children: [],
						expanded: true,
					})),
				},
			}));
		}
	}

	// ── 文件读取 / 编辑 / 保存 ───────────────────────────────────────────────

	const loadFile = useCallback(async (connectionId: string, path: string, silent = false) => {
		if (!silent) setLoadingFile(true);
		try {
			const content = await readRemoteFileWithRetry(connectionId, path);
			setFileReadError(false);
			setFileContent(content);
			if (!isDirty.current) setEditorDraft(content);
		} catch (err: unknown) {
			if (!silent) {
				const message = `[读取失败] ${String(err)}`;
				setFileReadError(true);
				setIsEditing(false);
				setAutoRefresh(false);
				setFileContent(message);
				setEditorDraft(message);
			}
		} finally {
			if (!silent) setLoadingFile(false);
		}
	}, []);

	function handleSelectFile(node: TreeNode) {
		if (!activeConnectionId) return;
		setSelectedFile(node.path);
		setFileContent('');
		setEditorDraft('');
		setIsEditing(false);
		setSaveMsg('');
		setFileReadError(false);
		setAutoRefresh(true);
		setTextSearchQuery('');
		setFilterProblemContext(false);
		isDirty.current = false;
		loadFile(activeConnectionId, node.path);
	}

	function handleToggleAnalysisFile(node: TreeNode) {
		if (node.is_dir) return;
		setAnalysisSelectedFiles((current) =>
			current.includes(node.path) ? current.filter((path) => path !== node.path) : [...current, node.path],
		);
	}

	function handleDraftChange(val: string) {
		isDirty.current = true;
		setEditorDraft(val);
	}

	// 自动刷新：仅在内容发生变化时更新（不覆盖用户正在编辑的 draft）
	useEffect(() => {
		if (!isDirty.current) setEditorDraft(fileContent);
	}, [fileContent]);

	// ── 实时监视（基于 Tauri 事件，不再轮询）──────────────────────────────────

	/** 停止前端事件监听器（同步）。 */
	function stopListening() {
		if (unlistenRef.current) {
			unlistenRef.current();
			unlistenRef.current = null;
		}
	}

	async function stopWatchingRemote(connectionId: string, path: string) {
		stopListening();
		await sshUnwatchFile(connectionId, path).catch(() => {});
		if (watchedFileRef.current?.connectionId === connectionId && watchedFileRef.current.path === path) {
			watchedFileRef.current = null;
		}
	}

	/** 启动实时监视：先注册 Tauri 事件监听器，再启动后端监视任务。 */
	async function startWatching(path: string) {
		if (!activeConnectionId) return;
		const connectionId = activeConnectionId;
		stopListening();
		const previous = watchedFileRef.current;
		if (previous && (previous.connectionId !== connectionId || previous.path !== path)) {
			await sshUnwatchFile(previous.connectionId, previous.path).catch(() => {});
			watchedFileRef.current = null;
		}
		const unlisten = await subscribeRemoteFileChanged((payload) => {
			if (payload.connectionId === connectionId && payload.path === path) {
				setFileReadError(false);
				setFileContent((current) => (payload.kind === 'append' ? current + payload.content : payload.content));
			}
		});
		unlistenRef.current = unlisten;
		watchedFileRef.current = { connectionId, path };
		await sshWatchFile(connectionId, path);
	}

	// autoRefresh 开关或切换文件时自动启停监视
	useEffect(() => {
		if (autoRefresh && selectedFile && !fileReadError) {
			const path = selectedFile;
			void startWatching(path);
		} else {
			stopListening();
			if (activeConnectionId && selectedFile) void stopWatchingRemote(activeConnectionId, selectedFile);
		}
		return () => {
			stopListening();
			if (activeConnectionId && selectedFile) void stopWatchingRemote(activeConnectionId, selectedFile);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoRefresh, activeConnectionId, selectedFile, fileReadError]);

	async function handleSave() {
		if (!activeConnectionId || !selectedFile) return;
		setSaving(true);
		setSaveMsg('');
		try {
			await sshWriteFile(activeConnectionId, selectedFile, editorDraft);
			isDirty.current = false;
			setFileContent(editorDraft);
			setIsEditing(false);
			showSaveMsg('✓ 已保存');
		} catch (err: unknown) {
			showSaveMsg(`✗ 保存失败: ${String(err)}`);
		} finally {
			setSaving(false);
		}
	}

	function openAnalysisModal() {
		const shouldResetError = !analysisOpen;
		setAnalysisOpen(true);
		setAnalysisMinimized(false);
		setAnalysisModelOpen(false);
		if (shouldResetError) setAnalysisError('');
	}

	function restoreAnalysisModal() {
		setAnalysisOpen(true);
		setAnalysisMinimized(false);
		setAnalysisModelOpen(false);
	}

	function minimizeAnalysisModal() {
		setAnalysisMinimized(true);
		setAnalysisModelOpen(false);
	}

	function resetAnalysisRun() {
		Object.values(analysisAbortControllersRef.current).forEach((controller) => controller.abort());
		analysisAbortControllersRef.current = {};
		setAnalysisModelOpen(false);
		setAnalysisError('');
		setAnalysisResults([]);
	}

	function updateAnalysisResult(path: string, updater: (result: AnalysisFileResult) => AnalysisFileResult) {
		setAnalysisResults((current) => current.map((result) => (result.path === path ? updater(result) : result)));
	}

	function getAnalysisFileSizeError(path: string): string {
		const size = analysisFileSizeByPath.get(path);
		const usesLoadedDraft = path === selectedFile && !fileReadError && !!editorDraft.trim();
		if (usesLoadedDraft || size == null || size <= MAX_ANALYSIS_REMOTE_FILE_BYTES) return '';
		return `文件过大（${formatSize(size)}），为避免远程读取长时间卡住，Analyze 队列仅直接读取 ${formatSize(MAX_ANALYSIS_REMOTE_FILE_BYTES)} 以内的文件。请先打开该文件并使用过滤后的当前内容分析，或缩小日志范围后重试。`;
	}

	async function readAnalysisContent(path: string, connectionId: string, signal: AbortSignal): Promise<string> {
		if (path === selectedFile && !fileReadError && editorDraft.trim()) {
			if (signal.aborted) throw new AnalysisAbortError('分析已停止。');
			return editorDraft;
		}
		return withAnalysisTimeout(
			readRemoteFileWithRetry(connectionId, path),
			ANALYSIS_READ_TIMEOUT_MS,
			`远程文件读取超过 ${ANALYSIS_READ_TIMEOUT_MS / 1000} 秒，已停止本次分析。请确认 SSH/SFTP 连接是否正常，或先缩小日志文件后重试。`,
			signal,
		);
	}

	async function startFileAnalysis() {
		if (currentTargetsAnalyzing) {
			for (const path of analysisTargetPaths) {
				analysisAbortControllersRef.current[path]?.abort();
				delete analysisAbortControllersRef.current[path];
				updateAnalysisResult(path, (result) =>
					result.status === 'pending' || result.status === 'running'
						? { ...result, status: 'aborted', statusDetail: '已停止' }
						: result,
				);
			}
			return;
		}

		if (!activeConnectionId || analysisTargetPaths.length === 0 || !selectedAnalysisProvider) return;
		if (analysisSelectedFiles.length === 0 && (loadingFile || fileReadError || !editorDraft.trim())) return;

		const targetPaths = [...analysisTargetPaths];
		const connectionId = activeConnectionId;
		const provider = selectedAnalysisProvider;
		const targetErrors = new Map(targetPaths.map((path) => [path, getAnalysisFileSizeError(path)]));
		const runnablePaths = targetPaths.filter((path) => !targetErrors.get(path));
		setAnalysisModelOpen(false);
		setAnalysisError('');
		setAnalysisResults((current) =>
			[
				...current.filter((result) => !targetPaths.includes(result.path)),
				...targetPaths.map((path) => {
					const error = targetErrors.get(path) ?? '';
					return {
						path,
						displayPath: sftpToDisplay(path),
						status: error ? ('error' as AnalysisFileStatus) : ('pending' as AnalysisFileStatus),
						statusDetail: error ? '文件过大，未读取' : '等待分析任务启动',
						language: 'ch' as AnalysisLanguage,
						output: '',
						error,
						stats: null,
						isFilteredLog: false,
					};
				}),
			].sort((a, b) => a.displayPath.localeCompare(b.displayPath)),
		);

		if (runnablePaths.length === 0) return;

		try {
			await Promise.all(
				runnablePaths.map(async (path) => {
					const controller = new AbortController();
					analysisAbortControllersRef.current[path] = controller;
					updateAnalysisResult(path, (result) => ({ ...result, status: 'running', statusDetail: '正在读取远程文件' }));

					try {
						const rawContent = await readAnalysisContent(path, connectionId, controller.signal);
						if (controller.signal.aborted) {
							updateAnalysisResult(path, (result) => ({ ...result, status: 'aborted', statusDetail: '已停止' }));
							return;
						}
						if (!rawContent.trim()) {
							updateAnalysisResult(path, (result) => ({
								...result,
								status: 'error',
								statusDetail: '文件为空',
								error: '当前文件内容为空，未发起分析。',
							}));
							return;
						}

						updateAnalysisResult(path, (result) => ({ ...result, statusDetail: '正在预处理日志内容' }));
						const analysisContent = limitAnalysisContentForModel(buildAnalysisContent(path, rawContent));
						updateAnalysisResult(path, (result) => ({
							...result,
							isFilteredLog: analysisContent.isFilteredLog,
							statusDetail: '等待模型响应',
						}));
						const messages = buildAnalysisMessages(
							sftpToDisplay(path),
							analysisContent.content,
							analysisContent.isFilteredLog,
						);

						for await (const chunk of withAnalysisStreamIdleTimeout(
							streamChat(provider, messages, controller.signal),
							ANALYSIS_STREAM_IDLE_TIMEOUT_MS,
							`模型超过 ${ANALYSIS_STREAM_IDLE_TIMEOUT_MS / 1000} 秒没有返回新内容，已停止本次分析。请检查模型服务状态或换用更小的日志范围。`,
							controller.signal,
						)) {
							if (controller.signal.aborted) {
								updateAnalysisResult(path, (result) => ({ ...result, status: 'aborted', statusDetail: '已停止' }));
								return;
							}
							if (chunk.content) {
								updateAnalysisResult(path, (result) => ({
									...result,
									statusDetail: '模型正在生成结果',
									output: result.output + chunk.content,
								}));
							}
							if (chunk.stats) {
								updateAnalysisResult(path, (result) => ({ ...result, stats: chunk.stats ?? null }));
							}
						}

						updateAnalysisResult(path, (result) => ({ ...result, status: 'done', statusDetail: '分析完成' }));
					} catch (err: unknown) {
						const timedOut = err instanceof AnalysisTimeoutError;
						if (timedOut) controller.abort();
						const aborted = !timedOut && (controller.signal.aborted || err instanceof AnalysisAbortError);
						updateAnalysisResult(path, (result) => ({
							...result,
							status: aborted ? 'aborted' : 'error',
							statusDetail: aborted ? '已停止' : '分析失败',
							error: aborted ? '' : analysisErrorMessage(err),
						}));
					} finally {
						if (analysisAbortControllersRef.current[path] === controller) {
							delete analysisAbortControllersRef.current[path];
						}
					}
				}),
			);
		} catch (err: unknown) {
			setAnalysisError(String(err));
		}
	}

	function buildPendingVm(
		parentConnection: RemoteConnection,
		vm: HyperVVirtualMachine,
		hostValue?: string,
	): PendingVmConnection {
		const vmHost = hostValue ?? pickVmHost(vm) ?? '';
		const key = vmCredentialKey(parentConnection, vm);
		return { parentConnection, vm, host: vmHost, credentialKey: key };
	}

	function applyVmCredential(pending: PendingVmConnection, saved?: HyperVVmCredentialProfile) {
		setEditingProfileId(null);
		setPendingVmConnection(pending);
		setProfileName(saved?.label || pending.vm.name);
		setHost(pending.host);
		setPort(normalizePort(saved?.port ?? '22'));
		setUsername(saved?.username ?? '');
		setPassword(saved?.password ?? '');
		setConnError('');
	}

	function handleEditVmCredential(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) {
		const pending = buildPendingVm(parentConnection, vm);
		applyVmCredential(pending, findVmCredential(parentConnection, vm, pending.host));
		setConfigOpen(true);
	}

	async function handleFetchPendingVmHost() {
		const pending = pendingVmConnection;
		if (!pending) return;
		const key = pending.credentialKey;
		if (fetchingVmIpKey === key) return;

		setFetchingVmIpKey(key);
		setConnError('');
		try {
			const refreshedVms = await refreshHyperV(pending.parentConnection.id);
			const currentVm = refreshedVms.find((item) => vmIdentity(item) === vmIdentity(pending.vm)) ?? pending.vm;

			if (!isVmRunning(currentVm)) {
				setHost('');
				setPendingVmConnection(buildPendingVm(pending.parentConnection, currentVm, ''));
				setConnError('请先开机，然后再获取虚拟机 IP。');
				return;
			}

			const currentHost = pickVmHost(currentVm);
			if (currentHost) {
				const nextPending = buildPendingVm(pending.parentConnection, currentVm, currentHost);
				setPendingVmConnection(nextPending);
				setHost(nextPending.host);
				return;
			}

			const nextPending = await waitForVmHost(pending.parentConnection, currentVm);
			if (!nextPending) {
				setConnError('暂未获取到可用 IP，请稍后再次点击 IP 输入框。');
				return;
			}
			setPendingVmConnection(nextPending);
			setHost(nextPending.host);
		} catch (err: unknown) {
			setConnError(String(err));
		} finally {
			setFetchingVmIpKey((current) => (current === key ? null : current));
		}
	}

	async function connectVmWithCredential(pending: PendingVmConnection, credential: HyperVVmCredentialProfile) {
		setConnStatus('connecting');
		setConnError('');
		setConnectingVmKey(pending.credentialKey);
		try {
			const nextCredential: HyperVVmCredentialProfile = {
				...credential,
				id: pending.credentialKey,
				host: pending.host,
				vmName: pending.vm.name,
				lastConnectedAt: new Date().toISOString(),
			};
			const connection = await sshConnect({
				host: nextCredential.host,
				port: Number(normalizePort(nextCredential.port)),
				username: nextCredential.username,
				password: nextCredential.password,
				label: nextCredential.label || pending.vm.name,
				kind: 'vm',
				parentConnectionId: pending.parentConnection.id,
				parentProfileId: parentCredentialScope(pending.parentConnection),
				vmId: vmIdentity(pending.vm),
			});

			setConnections((prev) => [...prev, connection]);
			switchActiveConnection(connection.id);
			await loadConnectionFileTree(connection.id);
			persistVmCredential(nextCredential);
			setConnStatus('connected');
			setConfigOpen(false);
			setPendingVmConnection(null);
		} catch (err: unknown) {
			applyVmCredential(pending, credential);
			setConnError(String(err));
			setConnStatus('error');
			setConfigOpen(true);
		} finally {
			setConnectingVmKey(null);
		}
	}

	async function handleConnectVm(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) {
		const connectedVm = connections.find(
			(connection) =>
				connection.kind === 'vm' &&
				connection.parentConnectionId === parentConnection.id &&
				connection.vmId === vmIdentity(vm),
		);
		if (connectedVm) {
			switchActiveConnection(connectedVm.id);
			return;
		}

		const pending = buildPendingVm(parentConnection, vm);
		const saved = findVmCredential(parentConnection, vm, pending.host);
		if (!pending.host) {
			applyVmCredential(pending, saved);
			setConnError('请先开机，并在 IP 输入框中点击获取可用 IP。');
			setConfigOpen(true);
			return;
		}
		if (saved?.username) {
			await connectVmWithCredential(pending, saved);
			return;
		}
		applyVmCredential(pending, saved);
		setConfigOpen(true);
	}

	function isVmRunning(vm: HyperVVirtualMachine): boolean {
		return vm.state.trim().toLowerCase() === 'running';
	}

	function vmPowerAction(vm: HyperVVirtualMachine): 'start' | 'stop' {
		const state = vm.state.trim().toLowerCase();
		return state === 'off' || state === 'offcritical' ? 'start' : 'stop';
	}

	function downloadOpenSshSetupScript() {
		const link = document.createElement('a');
		link.href = OPENSSH_SETUP_SCRIPT_URL;
		link.download = 'configure-windows-ssh-server.ps1';
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	function appendWinRmTerminalLine(stream: WinRmTerminalLine['stream'], text: string) {
		setWinRmTerminalLines((current) =>
			[
				...current,
				{
					id: `local:${current.length}:${Date.now()}`,
					stream,
					text,
				},
			].slice(-500),
		);
	}

	async function handleRunOpenSshSetupViaWinRm(target: WinRmOpenSshSetupTarget) {
		if (winRmBusyTargetKey) return;
		const hostValue = target.host.trim();
		const usernameValue = target.username?.trim() ?? '';
		const passwordValue = target.password ?? '';
		const sshPortValue = Number(normalizePort(target.sshPort ?? '22'));

		if (!hostValue || !usernameValue || !passwordValue) {
			setConnError('通过 WinRM 执行 SSH 配置需要保存目标主机、账号和密码。');
			setWinRmTerminalOpen(true);
			setWinRmTerminalStatus('error');
			setWinRmTerminalLines([
				{
					id: `local:error:${Date.now()}`,
					stream: 'error',
					text: '[local] Missing host, username, or saved password for WinRM execution.',
				},
			]);
			return;
		}

		const runId = `open-ssh:${target.key}:${Date.now()}`;
		setWinRmRunId(runId);
		winRmRunIdRef.current = runId;
		setWinRmBusyTargetKey(target.key);
		setWinRmTerminalOpen(true);
		setWinRmTerminalStatus('running');
		setWinRmTerminalLines([
			{
				id: `local:start:${Date.now()}`,
				stream: 'status',
				text: `[local] Run ${runId}`,
			},
			{
				id: `local:target:${Date.now()}`,
				stream: 'status',
				text: `[local] Target ${target.label} (${usernameValue}@${hostValue}) via WinRM ${DEFAULT_WINRM_PORT}; SSH port ${sshPortValue}`,
			},
		]);
		setConnError('');

		try {
			await winRmRunOpenSshSetup({
				runId,
				host: hostValue,
				winrmPort: DEFAULT_WINRM_PORT,
				username: usernameValue,
				password: passwordValue,
				sshPort: sshPortValue,
				firewallProfile: 'Any',
				setNetworkPrivate: true,
				enablePasswordAuthentication: true,
			});
		} catch (err: unknown) {
			const message = String(err);
			appendWinRmTerminalLine('error', `[local] ${message}`);
			setConnError(message);
			setWinRmTerminalStatus('error');
			setWinRmBusyTargetKey(null);
		}
	}

	function hostProfileForConnection(connection: RemoteConnection): RemoteMachineProfile | undefined {
		return profiles.find((profile) => profile.id === connection.parentProfileId);
	}

	async function handleOpenRdp(hostValue: string, portValue: string, busyKey: string, credential?: RdpCredential) {
		const normalizedHost = hostValue.trim();
		if (!normalizedHost || rdpOpeningTarget === busyKey) return;
		const normalizedPort = Number(normalizeRdpPort(portValue));
		if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
			setConnError('RDP 端口必须在 1-65535 之间。');
			return;
		}

		setRdpOpeningTarget(busyKey);
		setConnError('');
		try {
			await rdpOpen({
				host: normalizedHost,
				port: normalizedPort,
				username: credential?.username?.trim() || undefined,
				password: credential?.password || undefined,
			});
		} catch (err: unknown) {
			setConnError(String(err));
		} finally {
			setRdpOpeningTarget((current) => (current === busyKey ? null : current));
		}
	}

	async function handleToggleVmPower(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) {
		const action = vmPowerAction(vm);
		const busyKey = `${parentConnection.id}:${vmIdentity(vm)}:power`;
		setVmPowerBusyKey(busyKey);
		updateVmPowerState(parentConnection.id, vm, action === 'start' ? 'Starting' : 'Stopping');
		try {
			setConnError('');
			await sshSetHyperVVMState(parentConnection.id, vm.id, action);
		} catch (err: unknown) {
			setConnError(String(err));
		} finally {
			setVmPowerBusyKey((current) => (current === busyKey ? null : current));
			void refreshHyperV(parentConnection.id);
		}
	}

	function showSaveMsg(msg: string) {
		setSaveMsg(msg);
		if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
		saveMsgTimer.current = setTimeout(() => setSaveMsg(''), 3000);
	}

	const activeConnection = activeConnectionId
		? (connections.find((connection) => connection.id === activeConnectionId) ?? null)
		: null;
	const activeDiskRoots = activeConnectionId ? (connectionDisks[activeConnectionId] ?? []) : [];
	const activeTrees = useMemo(
		() => (activeConnectionId ? (connectionTrees[activeConnectionId] ?? EMPTY_TREE_RECORD) : EMPTY_TREE_RECORD),
		[activeConnectionId, connectionTrees],
	);
	const analysisFileSizeByPath = useMemo(() => {
		const sizes = new Map<string, number | null>();
		Object.values(activeTrees).forEach((nodes) => collectTreeFileSizes(nodes, sizes));
		return sizes;
	}, [activeTrees]);
	const activeDiskExpanded = activeConnectionId ? (connectionDiskExpanded[activeConnectionId] ?? {}) : {};
	const hostConnections = connections.filter((connection) => connection.kind === 'host');
	const isConnecting = connStatus === 'connecting';
	const textSearchResult = useMemo(
		() => buildContentSearchResult(editorDraft, textSearchQuery, filterProblemContext),
		[editorDraft, textSearchQuery, filterProblemContext],
	);
	const useLogViewer = useMemo(
		() => shouldUseLogViewer(selectedFile, textSearchResult),
		[selectedFile, textSearchResult],
	);
	const hasCheckedAnalysisFiles = analysisSelectedFiles.length > 0;
	const canOpenAnalysis =
		analysisTargetPaths.length > 0 &&
		(currentTargetsAnalyzing || hasCheckedAnalysisFiles || (!loadingFile && !fileReadError));
	const canStartAnalysis =
		canOpenAnalysis &&
		!!selectedAnalysisProvider &&
		(currentTargetsAnalyzing || hasCheckedAnalysisFiles || !!editorDraft.trim());
	const analysisButtonTitle =
		analysisTargetPaths.length === 0
			? '请先选择或勾选远程文件'
			: !hasCheckedAnalysisFiles && loadingFile
				? '文件加载中'
				: !hasCheckedAnalysisFiles && fileReadError
					? '当前文件读取失败'
					: hasCheckedAnalysisFiles
						? `并行分析 ${analysisSelectedFiles.length} 个文件`
						: '分析当前文件内容';
	const analysisStartTitle = !selectedAnalysisProvider
		? '请先配置或选择大模型'
		: analysisTargetPaths.length === 0
			? '请先选择或勾选远程文件'
			: currentTargetsAnalyzing
				? '停止当前文件分析'
				: !hasCheckedAnalysisFiles && loadingFile
					? '文件加载中'
					: !hasCheckedAnalysisFiles && fileReadError
						? '当前文件读取失败'
						: !hasCheckedAnalysisFiles && !editorDraft.trim()
							? '当前文件内容为空'
							: '开始分析';
	const analysisTargetLabel = hasCheckedAnalysisFiles
		? `${analysisSelectedFiles.length.toLocaleString()} 个文件已加入 Analyze 队列`
		: selectedFile
			? sftpToDisplay(selectedFile)
			: '未选择文件';
	const analysisStatusLabel = (() => {
		const activeResults = analysisResults.filter(
			(result) => result.status === 'pending' || result.status === 'running',
		);
		if (activeResults.length === 1) return activeResults[0].displayPath;
		if (activeResults.length > 1) return `${activeResults.length.toLocaleString()} 个文件正在分析`;
		return analysisTargetLabel;
	})();
	const isVmCredentialForm = !!pendingVmConnection;
	const isFetchingVmIp = !!pendingVmConnection && fetchingVmIpKey === pendingVmConnection.credentialKey;

	// ── 渲染 ────────────────────────────────────────────────────────────────

	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden">
			<div className="flex shrink-0 items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[11px] text-white/35">系统 · Remote Machines</div>
					<div className="flex min-w-0 items-center gap-2">
						<h1 className="truncate text-xl font-semibold tracking-tight text-white/85">远程机器</h1>
						<span
							className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
							title="当前在线数量"
						>
							{connections.length} 在线
						</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={downloadOpenSshSetupScript}
						title="Download OpenSSH setup script"
						className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/65 transition-all hover:text-white"
						style={{
							background: 'rgb(var(--glass-rgb) / 0.08)',
							border: '1px solid rgb(255 255 255 / 0.12)',
						}}
					>
						<Icon name="download" className="h-3.5 w-3.5" aria-hidden="true" />
						Script
					</button>
					<button
						type="button"
						onClick={openAnalysisModal}
						disabled={!canOpenAnalysis}
						title={analysisButtonTitle}
						className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
						style={{
							background: 'rgb(var(--glass-rgb) / 0.08)',
							border: '1px solid rgb(255 255 255 / 0.12)',
						}}
					>
						<Icon name="chat" className="h-3.5 w-3.5" aria-hidden="true" />
						Analyze
					</button>
					<button
						type="button"
						onClick={openNewProfileForm}
						className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all"
						style={{
							background: 'rgb(var(--accent-rgb) / 0.15)',
							border: '1px solid rgb(var(--accent-rgb) / 0.35)',
						}}
					>
						New
					</button>
				</div>
			</div>

			<AnimatePresence>
				{configOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
						onMouseDown={() => setConfigOpen(false)}
					>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 10 }}
							transition={{ duration: 0.18, ease: 'easeOut' }}
							className="glass app-card dark-popover relative w-full max-w-[340px] overflow-hidden px-3.5 py-3.5 shadow-2xl"
							onMouseDown={(event) => event.stopPropagation()}
						>
							<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
							<div className="mb-3 flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="text-[11px] text-white/35">
										{pendingVmConnection ? 'Hyper-V VM' : 'Remote Machine'}
									</div>
									<h2 className="truncate text-base font-semibold text-white/80">
										{pendingVmConnection ? '虚拟机凭据' : '配置预连接'}
									</h2>
								</div>
								<button
									type="button"
									onClick={() => setConfigOpen(false)}
									className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/40 transition-colors hover:text-white/70"
								>
									Close
								</button>
							</div>

							<div className="space-y-2.5">
								<div className="space-y-1">
									<label className="text-[11px] text-white/45">名称</label>
									<input
										className={fieldCls}
										placeholder={pendingVmConnection ? 'VM Name' : 'Lab Server'}
										value={profileName}
										onChange={(e) => setProfileName(e.target.value)}
										autoFocus
									/>
								</div>
								<div
									className={`grid gap-2 ${isVmCredentialForm ? 'grid-cols-[1fr_64px]' : 'grid-cols-[1fr_64px_72px]'}`}
								>
									<div className="space-y-1">
										<label className="text-[11px] text-white/45">IP / 主机名</label>
										<input
											className={`${fieldCls} ${isVmCredentialForm ? 'cursor-pointer' : ''}`}
											placeholder={isVmCredentialForm ? '点击获取虚拟机 IP' : '192.168.1.100'}
											value={host}
											readOnly={isVmCredentialForm}
											title={isVmCredentialForm ? '虚拟机开机后点击自动获取 IP' : undefined}
											onClick={() => {
												if (pendingVmConnection) void handleFetchPendingVmHost();
											}}
											onChange={(e) => {
												if (!pendingVmConnection) setHost(e.target.value);
											}}
										/>
										{isFetchingVmIp && <div className="mt-1 text-[10px] text-white/30">正在获取 IP…</div>}
									</div>
									<div className="space-y-1">
										<label className="text-[11px] text-white/45">SSH</label>
										<input
											className={fieldCls}
											placeholder="22"
											value={port}
											onChange={(e) => setPort(e.target.value)}
										/>
									</div>
									{!isVmCredentialForm && (
										<div className="space-y-1">
											<label className="text-[11px] text-white/45">RDP</label>
											<input
												className={fieldCls}
												placeholder={DEFAULT_RDP_PORT}
												value={rdpPort}
												onChange={(e) => setRdpPort(e.target.value)}
											/>
										</div>
									)}
								</div>
								<div className="space-y-2.5">
									<div className="space-y-1">
										<label className="text-[11px] text-white/45">账号</label>
										<input
											className={fieldCls}
											placeholder="Administrator"
											value={username}
											onChange={(e) => setUsername(e.target.value)}
											autoComplete="username"
										/>
									</div>
									<div className="space-y-1">
										<label className="text-[11px] text-white/45">密码</label>
										<input
											className={fieldCls}
											type="password"
											placeholder="••••••••"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											autoComplete="current-password"
										/>
									</div>
								</div>
							</div>

							<AnimatePresence>
								{connError && (
									<motion.p
										initial={{ opacity: 0, height: 0 }}
										animate={{ opacity: 1, height: 'auto' }}
										exit={{ opacity: 0, height: 0 }}
										className="mt-3 overflow-hidden rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-400"
									>
										{connError}
									</motion.p>
								)}
							</AnimatePresence>

							<div className="mt-3 flex justify-end gap-2">
								<button
									type="button"
									onClick={() => setConfigOpen(false)}
									className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/45 transition-colors hover:text-white/70"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={saveProfileFromForm}
									disabled={isVmCredentialForm ? !username.trim() : !host.trim() || !username.trim()}
									className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/55 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
								>
									{pendingVmConnection ? '保存凭据' : 'Save'}
								</button>
								<button
									type="button"
									onClick={() => {
										saveProfileFromForm();
										void handleConnect();
									}}
									disabled={isConnecting || !host.trim() || !username.trim()}
									className="rounded-lg px-3 py-2 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
									style={{
										background: 'rgb(var(--accent-rgb) / 0.14)',
										border: '1px solid rgb(var(--accent-rgb) / 0.3)',
									}}
								>
									{isConnecting ? '连接中' : '连接'}
								</button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{analysisOpen && !analysisMinimized && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
						onMouseDown={minimizeAnalysisModal}
					>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 10 }}
							transition={{ duration: 0.18, ease: 'easeOut' }}
							className="glass app-card dark-popover relative flex h-[min(78vh,680px)] w-full max-w-[760px] flex-col overflow-hidden shadow-2xl"
							onMouseDown={(event) => event.stopPropagation()}
						>
							<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
							<div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
								<div className="min-w-0">
									<div className="text-[11px] text-white/35">Remote File Analysis</div>
									<h2 className="truncate text-base font-semibold text-white/80">文件内容分析</h2>
									<div className="mt-1 truncate font-mono text-[11px] text-white/35" title={analysisStatusLabel}>
										{analysisStatusLabel}
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<div className="relative">
										<button
											type="button"
											onClick={() => setAnalysisModelOpen((value) => !value)}
											disabled={providers.length === 0}
											className="glass app-card-surface app-card-control glass-control flex h-8 min-w-[168px] max-w-[240px] items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[11px] text-white/65 disabled:cursor-not-allowed disabled:opacity-35"
											title={selectedAnalysisProvider ? selectedAnalysisProvider.model : '请先配置大模型'}
										>
											<span
												className="h-1.5 w-1.5 shrink-0 rounded-full"
												style={{
													backgroundColor: selectedAnalysisProvider
														? PROVIDER_LABELS[selectedAnalysisProvider.provider].color
														: 'rgb(255 255 255 / 0.25)',
												}}
											/>
											<span className="min-w-0 flex-1 truncate">
												{selectedAnalysisProvider ? selectedAnalysisProvider.name : '选择大模型'}
											</span>
											<span className="shrink-0 text-white/30">▾</span>
										</button>

										<AnimatePresence>
											{analysisModelOpen && providers.length > 0 && (
												<motion.div
													initial={{ opacity: 0, y: -4 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: -4 }}
													className="glass app-card dark-popover absolute right-0 top-full z-20 mt-2 max-h-64 w-72 overflow-y-auto rounded-xl p-1.5 shadow-2xl"
												>
													{providers.map((provider) => {
														const meta = PROVIDER_LABELS[provider.provider];
														const selected = selectedAnalysisProvider?.id === provider.id;
														return (
															<button
																key={provider.id}
																type="button"
																onClick={() => {
																	setAnalysisProviderId(provider.id);
																	setAnalysisModelOpen(false);
																}}
																className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
																	selected
																		? 'bg-white/[0.08] text-white'
																		: 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
																}`}
															>
																<span
																	className="h-2 w-2 shrink-0 rounded-full"
																	style={{ backgroundColor: meta.color }}
																/>
																<span className="min-w-0 flex-1">
																	<span className="block truncate text-[12px] font-medium">{provider.name}</span>
																	<span className="block truncate text-[10px] text-white/30">{provider.model}</span>
																</span>
																<span
																	className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px]"
																	style={{ color: meta.color }}
																>
																	{meta.label}
																</span>
															</button>
														);
													})}
												</motion.div>
											)}
										</AnimatePresence>
									</div>
									<button
										type="button"
										onClick={() => void startFileAnalysis()}
										disabled={!currentTargetsAnalyzing && !canStartAnalysis}
										title={analysisStartTitle}
										className="h-8 rounded-lg px-3 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
										style={{
											background: currentTargetsAnalyzing ? 'rgb(244 63 94 / 0.16)' : 'rgb(var(--accent-rgb) / 0.14)',
											border: currentTargetsAnalyzing
												? '1px solid rgb(244 63 94 / 0.35)'
												: '1px solid rgb(var(--accent-rgb) / 0.3)',
										}}
									>
										{currentTargetsAnalyzing ? 'Stop' : 'Start'}
									</button>
								</div>
							</div>

							<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
								{providers.length === 0 ? (
									<div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-center text-white/30">
										<Icon name="chat" className="h-8 w-8 text-white/20" aria-hidden="true" />
										<div className="text-sm text-white/45">暂无可用大模型</div>
										<div className="max-w-sm text-[11px] leading-relaxed text-white/25">
											请先在设置页面添加 Model Provider，然后回到这里选择模型进行分析。
										</div>
									</div>
								) : analysisError ? (
									<div className="rounded-xl bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-300">
										{analysisError}
									</div>
								) : analysisResults.length > 0 ? (
									<div className="space-y-3">
										{analysisResults.map((result) => {
											const active = result.status === 'pending' || result.status === 'running';
											const languageContent = getAnalysisLanguageContent(result.output, result.language);
											const statusText =
												result.status === 'pending'
													? '等待中'
													: result.status === 'running'
														? '分析中'
														: result.status === 'done'
															? '完成'
															: result.status === 'aborted'
																? '已停止'
																: '失败';
											const statusClass =
												result.status === 'error'
													? 'bg-rose-500/10 text-rose-300'
													: active
														? 'bg-sky-400/10 text-sky-200'
														: 'bg-emerald-400/10 text-emerald-200';

											return (
												<div
													key={result.path}
													className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]"
												>
													<div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
														{active && (
															<Icon
																name="loader"
																className="h-3.5 w-3.5 shrink-0 animate-spin text-white/35"
																aria-hidden="true"
															/>
														)}
														<span
															className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/45"
															title={result.displayPath}
														>
															{result.displayPath}
														</span>
														<div className="flex shrink-0 overflow-hidden rounded-md bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
															{(['en', 'ch'] as AnalysisLanguage[]).map((language) => (
																<button
																	key={language}
																	type="button"
																	onClick={() => updateAnalysisResult(result.path, (item) => ({ ...item, language }))}
																	className={`h-5 min-w-8 rounded px-1.5 text-[10px] font-medium transition-colors ${
																		result.language === language
																			? 'bg-white/[0.1] text-white/80'
																			: 'text-white/35 hover:text-white/65'
																	}`}
																>
																	{language === 'en' ? 'EN' : 'CH'}
																</button>
															))}
														</div>
														{result.isFilteredLog && (
															<span className="shrink-0 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-200">
																CMTrace
															</span>
														)}
														<span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${statusClass}`}>
															{statusText}
														</span>
													</div>
													<div className="select-text px-3.5 py-3">
														{result.error ? (
															<div className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-300">
																{result.error}
															</div>
														) : result.output ? (
															languageContent.content ? (
																<MarkdownContent content={languageContent.content} />
															) : (
																<div className="py-6 text-center text-[12px] text-white/30">
																	{result.status === 'done'
																		? `模型未返回 ${result.language === 'en' ? 'EN' : 'CH'} 结果`
																		: `${result.language === 'en' ? 'EN' : 'CH'} 结果生成中…`}
																</div>
															)
														) : (
															<div className="py-6 text-center text-[12px] text-white/30">{result.statusDetail}</div>
														)}
													</div>
												</div>
											);
										})}
									</div>
								) : (
									<div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-center text-white/30">
										<Icon name="chat" className="h-8 w-8 text-white/20" aria-hidden="true" />
										<div className="text-sm text-white/45">点击 Start 开始分析文件</div>
										<div className="max-w-md text-[11px] leading-relaxed text-white/25">
											勾选多个文件时，每个文件会作为独立分析任务并行执行。
										</div>
									</div>
								)}
								{isAnalyzing && (
									<div className="mt-3 flex items-center gap-2 text-[11px] text-white/35">
										<Icon name="loader" className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
										{analysisTargetPaths.length > 1 ? '多文件并行分析中…' : '分析中…'}
									</div>
								)}
							</div>

							{totalAnalysisStats && (
								<div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.05] px-4 py-2 text-[10px] text-white/30">
									<span>Input {totalAnalysisStats.promptTokens.toLocaleString()}</span>
									<span>Output {totalAnalysisStats.completionTokens.toLocaleString()}</span>
									<span>{totalAnalysisStats.outputTps.toFixed(1)} tok/s</span>
								</div>
							)}
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{analysisOpen && analysisMinimized && (
					<motion.button
						type="button"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={{ duration: 0.18, ease: 'easeOut' }}
						onClick={restoreAnalysisModal}
						className="glass app-card dark-popover fixed bottom-4 right-16 z-50 flex max-w-[min(360px,calc(100vw-6rem))] items-center gap-2 rounded-xl px-3 py-2 text-left shadow-2xl transition-colors hover:bg-white/[0.08]"
						title="恢复文件内容分析窗口"
					>
						{isAnalyzing ? (
							<Icon name="loader" className="h-4 w-4 shrink-0 animate-spin text-white/45" aria-hidden="true" />
						) : (
							<Icon name="chat" className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
						)}
						<span className="min-w-0 flex-1">
							<span className="block text-[12px] font-medium text-white/70">
								{isAnalyzing
									? '文件分析中'
									: analysisError
										? '分析出错'
										: analysisResults.length > 0
											? '分析结果'
											: '文件内容分析'}
							</span>
							<span className="block truncate font-mono text-[10px] text-white/35">{analysisStatusLabel}</span>
						</span>
					</motion.button>
				)}
			</AnimatePresence>

			<div className="grid h-full min-h-0 flex-1 grid-cols-[304px_304px_minmax(0,1fr)] gap-3 overflow-hidden">
				<div className="flex min-h-0 flex-col overflow-hidden">
					<div className="glass app-card relative flex min-h-0 flex-1 flex-col overflow-hidden">
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
						<div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3.5 py-2">
							<span className="text-xs font-medium text-white/60">远程机器</span>
							<span className="text-[10px] text-white/25">{profiles.length} 台</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-2">
							{profiles.length === 0 ? (
								<div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 text-center text-white/25">
									<span className="text-sm">暂无配置</span>
									<span className="text-[11px]">点击右上角 New 添加远程机器</span>
								</div>
							) : (
								<div className="space-y-1.5">
									{profiles.map((profile) => {
										const isProfileConnecting = connectingProfileId === profile.id;
										const profileWinRmKey = `host:${profile.id}:winrm`;
										const isProfileWinRmRunning = winRmBusyTargetKey === profileWinRmKey;
										const profileRdpKey = `host:${profile.id}`;
										const isProfileRdpOpening = rdpOpeningTarget === profileRdpKey;
										const hostConnection =
											hostConnections.find((connection) => connection.parentProfileId === profile.id) ?? null;
										const hostActive = activeConnectionId === hostConnection?.id;
										const hostVms = hostConnection ? (connectionHypervVms[hostConnection.id] ?? []) : [];
										const vmsExpanded = hostConnection ? (hypervExpanded[hostConnection.id] ?? true) : false;
										return (
											<div
												key={profile.id}
												className={`rounded-xl border p-1.5 transition-colors ${
													hostConnection
														? 'remote-connected-item bg-emerald-500/[0.035]'
														: hostActive
															? 'border-white/[0.14] bg-white/[0.05]'
															: 'border-white/[0.06] bg-white/[0.025]'
												}`}
											>
												<div className="flex items-center gap-0.5">
													<button
														type="button"
														title={`${profile.username}@${profile.host}:${normalizePort(profile.port)}`}
														onClick={() => {
															if (hostConnection) switchActiveConnection(hostConnection.id);
														}}
														disabled={!hostConnection}
														className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default ${
															hostActive ? 'bg-white/10 text-white' : 'text-white/65'
														}`}
													>
														<span className="block truncate text-[12px] font-medium">{profileLabel(profile)}</span>
													</button>
													<RemoteActionButton
														icon={isProfileRdpOpening ? 'loader' : 'monitor'}
														label={isProfileRdpOpening ? 'Opening RDP' : 'Open RDP'}
														spinning={isProfileRdpOpening}
														onClick={() =>
															void handleOpenRdp(
																profile.host,
																normalizeRdpPort(profile.rdpPort),
																profileRdpKey,
																profile,
															)
														}
														disabled={!profile.host.trim() || (!!rdpOpeningTarget && !isProfileRdpOpening)}
													/>
													<RemoteActionButton
														icon={isProfileWinRmRunning ? 'loader' : 'gear'}
														label={isProfileWinRmRunning ? 'Running SSH setup via WinRM' : 'Run SSH setup via WinRM'}
														spinning={isProfileWinRmRunning}
														onClick={() =>
															void handleRunOpenSshSetupViaWinRm({
																key: profileWinRmKey,
																label: profileLabel(profile),
																host: profile.host,
																username: profile.username,
																password: profile.password,
																sshPort: profile.port,
															})
														}
														disabled={!!winRmBusyTargetKey && !isProfileWinRmRunning}
													/>
													<RemoteActionButton
														icon={hostConnection ? 'plug-off' : isProfileConnecting ? 'loader' : 'plug'}
														label={hostConnection ? 'Disconnect' : isProfileConnecting ? 'Connecting' : 'Connect'}
														tone={hostConnection ? 'danger' : 'default'}
														spinning={isProfileConnecting}
														onClick={() => {
															if (hostConnection) void handleDisconnect(hostConnection.id);
															else {
																applyProfile(profile);
																void handleConnect(profile);
															}
														}}
														disabled={isConnecting && !isProfileConnecting}
													/>
													<RemoteActionButton
														icon="pencil"
														label="Edit"
														onClick={() => {
															applyProfile(profile);
															setConfigOpen(true);
														}}
													/>
													<RemoteActionButton
														icon="trash"
														label="Delete"
														tone="danger"
														onClick={() => void handleDeleteProfile(profile)}
													/>
												</div>

												{hostConnection && hostVms.length > 0 && (
													<div className="mt-1.5">
														<button
															type="button"
															onClick={() =>
																hostConnection &&
																setHypervExpanded((prev) => ({ ...prev, [hostConnection.id]: !vmsExpanded }))
															}
															className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/70"
														>
															<span className="w-3 text-center text-[10px] text-white/25">
																{vmsExpanded ? '▾' : '▸'}
															</span>
															<span className="min-w-0 flex-1 truncate">Hyper-V · {hostVms.length} VM</span>
														</button>
														<AnimatePresence initial={false}>
															{vmsExpanded && (
																<motion.div
																	initial={{ height: 0, opacity: 0 }}
																	animate={{ height: 'auto', opacity: 1 }}
																	exit={{ height: 0, opacity: 0 }}
																	transition={{ duration: 0.18, ease: 'easeInOut' }}
																	className="overflow-hidden"
																>
																	{hostVms.map((vm) => {
																		const vmHost = pickVmHost(vm);
																		const vmKey = vmCredentialKey(hostConnection, vm);
																		const vmPowerKey = `${hostConnection.id}:${vmIdentity(vm)}:power`;
																		const connectedVm = connections.find(
																			(connection) =>
																				connection.kind === 'vm' &&
																				connection.parentConnectionId === hostConnection.id &&
																				connection.vmId === vmIdentity(vm),
																		);
																		const vmActive = connectedVm?.id === activeConnectionId;
																		const vmConnecting = connectingVmKey === vmKey;
																		const vmPowerBusy = vmPowerBusyKey === vmPowerKey;
																		const vmPowerNextAction = vmPowerAction(vm);
																		const vmRdpKey = `vm:${hostConnection.id}:${vmIdentity(vm)}`;
																		const isVmRdpOpening = rdpOpeningTarget === vmRdpKey;
																		const vmWinRmKey = `vm:${hostConnection.id}:${vmIdentity(vm)}:winrm`;
																		const isVmWinRmRunning = winRmBusyTargetKey === vmWinRmKey;
																		const parentProfile = hostProfileForConnection(hostConnection);
																		const savedVmCredential = findVmCredential(hostConnection, vm, vmHost ?? '');
																		const vmRdpCredential = savedVmCredential?.username
																			? savedVmCredential
																			: parentProfile;
																		const vmWinRmCredential = savedVmCredential?.username
																			? savedVmCredential
																			: parentProfile;
																		return (
																			<div
																				key={vmKey}
																				className={`mt-0.5 rounded-lg border px-1 py-0.5 transition-colors ${
																					connectedVm
																						? 'remote-connected-item border-emerald-400/55 bg-emerald-500/[0.035]'
																						: vmActive
																							? 'border-white/[0.12] bg-white/[0.07]'
																							: 'border-transparent bg-white/[0.025]'
																				}`}
																			>
																				<div className="flex items-center gap-0.5">
																					<button
																						type="button"
																						title={vm.name}
																						onClick={() => {
																							if (connectedVm) switchActiveConnection(connectedVm.id);
																						}}
																						disabled={!connectedVm}
																						className={`min-w-0 flex-1 rounded-md px-0.5 py-0.5 text-left transition-colors disabled:cursor-default ${
																							vmActive ? 'bg-white/10 text-white' : 'text-white/55'
																						}`}
																					>
																						<span className="block truncate whitespace-nowrap text-[11px] font-medium leading-none">
																							{vm.name}
																						</span>
																					</button>
																					<RemoteActionButton
																						icon={
																							vmPowerBusy ? 'loader' : vmPowerNextAction === 'stop' ? 'stop' : 'play'
																						}
																						label={
																							vmPowerBusy
																								? 'Power state updating'
																								: vmPowerNextAction === 'stop'
																									? 'Stop'
																									: 'Start'
																						}
																						size="sm"
																						tone={vmPowerNextAction === 'stop' ? 'danger' : 'default'}
																						spinning={vmPowerBusy}
																						onClick={() => void handleToggleVmPower(hostConnection, vm)}
																						disabled={vmPowerBusy}
																					/>
																					<RemoteActionButton
																						icon={isVmRdpOpening ? 'loader' : 'monitor'}
																						label={
																							isVmRdpOpening
																								? 'Opening RDP'
																								: vmHost
																									? 'Open RDP'
																									: 'No usable VM IP address'
																						}
																						size="sm"
																						spinning={isVmRdpOpening}
																						onClick={() =>
																							void handleOpenRdp(
																								vmHost ?? '',
																								normalizeRdpPort(parentProfile?.rdpPort),
																								vmRdpKey,
																								vmRdpCredential,
																							)
																						}
																						disabled={!vmHost || (!!rdpOpeningTarget && !isVmRdpOpening)}
																					/>
																					<RemoteActionButton
																						icon={isVmWinRmRunning ? 'loader' : 'gear'}
																						label={
																							isVmWinRmRunning
																								? 'Running SSH setup via WinRM'
																								: vmHost
																									? 'Run SSH setup via WinRM'
																									: 'No usable VM IP address'
																						}
																						size="sm"
																						spinning={isVmWinRmRunning}
																						onClick={() =>
																							void handleRunOpenSshSetupViaWinRm({
																								key: vmWinRmKey,
																								label: vm.name,
																								host: vmHost ?? '',
																								username: vmWinRmCredential?.username,
																								password: vmWinRmCredential?.password,
																								sshPort: vmWinRmCredential?.port ?? '22',
																							})
																						}
																						disabled={
																							!vmHost ||
																							!vmWinRmCredential?.username ||
																							!vmWinRmCredential?.password ||
																							(!!winRmBusyTargetKey && !isVmWinRmRunning)
																						}
																					/>
																					<RemoteActionButton
																						icon={connectedVm ? 'plug-off' : vmConnecting ? 'loader' : 'plug'}
																						label={
																							connectedVm
																								? 'Disconnect'
																								: vmConnecting
																									? 'Connecting'
																									: vmHost
																										? 'Connect'
																										: 'No usable VM IP address'
																						}
																						size="sm"
																						tone={connectedVm ? 'danger' : 'default'}
																						spinning={vmConnecting}
																						onClick={() => {
																							if (connectedVm) void handleDisconnect(connectedVm.id);
																							else void handleConnectVm(hostConnection, vm);
																						}}
																						disabled={!vmHost || (isConnecting && !vmConnecting)}
																					/>
																					<RemoteActionButton
																						icon="pencil"
																						label="Edit"
																						size="sm"
																						onClick={() => handleEditVmCredential(hostConnection, vm)}
																					/>
																				</div>
																			</div>
																		);
																	})}
																</motion.div>
															)}
														</AnimatePresence>
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-col gap-3 overflow-hidden">
					<div className="glass app-card relative flex min-h-0 flex-1 flex-col overflow-hidden">
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
						<div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3.5 py-2">
							<span className="text-xs font-medium text-white/60">文件系统</span>
							<span className="min-w-0 truncate text-[10px] text-white/25">
								{activeConnection ? `${activeConnection.label} · ${activeDiskRoots.length} 个磁盘` : '未选择'}
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
							{!activeConnection ? (
								<div className="flex h-full min-h-28 items-center justify-center px-5 text-center text-[12px] text-white/25">
									从远程机器列表选择机器后显示文件树
								</div>
							) : (
								activeDiskRoots.map((disk) => {
									const expanded = activeDiskExpanded[disk] ?? true;
									return (
										<div key={disk} className="mb-1">
											<button
												type="button"
												onClick={() => toggleDiskRoot(disk)}
												className="mb-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white/80"
											>
												<span className="w-3 text-center text-[10px] text-white/25">{expanded ? '▾' : '▸'}</span>
												<span className="text-[13px]">💾</span>
												<span className="min-w-0 flex-1 truncate text-[11px] font-bold">{diskLabel(disk)}</span>
											</button>
											<AnimatePresence initial={false}>
												{expanded && (
													<motion.div
														initial={{ height: 0, opacity: 0 }}
														animate={{ height: 'auto', opacity: 1 }}
														exit={{ height: 0, opacity: 0 }}
														transition={{ duration: 0.18, ease: 'easeInOut' }}
														className="overflow-hidden"
													>
														{(activeTrees[disk] ?? []).map((node) => (
															<TreeItem
																key={node.path}
																node={node}
																depth={0}
																selected={selectedFile}
																analysisSelected={analysisSelectedSet}
																onSelect={handleSelectFile}
																onToggle={handleToggle}
																onToggleAnalysis={handleToggleAnalysisFile}
															/>
														))}
													</motion.div>
												)}
											</AnimatePresence>
										</div>
									);
								})
							)}
						</div>
					</div>

					<div
						className={`glass app-card relative shrink-0 overflow-hidden transition-[height] duration-200 ${
							winRmTerminalOpen ? 'h-48' : 'h-10'
						}`}
					>
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
						<div className="flex h-10 items-center gap-2 border-b border-white/[0.05] px-3">
							<button
								type="button"
								onClick={() => setWinRmTerminalOpen((value) => !value)}
								className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-medium text-white/55 transition-colors hover:text-white/80"
							>
								<span className="w-3 text-center text-[10px] text-white/30">{winRmTerminalOpen ? '▾' : '▸'}</span>
								<Icon name="gear" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
								<span className="min-w-0 flex-1 truncate">WinRM SSH Setup</span>
							</button>
							<span
								className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${
									winRmTerminalStatus === 'running'
										? 'bg-sky-400/10 text-sky-200'
										: winRmTerminalStatus === 'done'
											? 'bg-emerald-400/10 text-emerald-200'
											: winRmTerminalStatus === 'error'
												? 'bg-rose-500/10 text-rose-300'
												: 'bg-white/[0.04] text-white/30'
								}`}
							>
								{winRmTerminalStatus === 'running'
									? 'Running'
									: winRmTerminalStatus === 'done'
										? 'Done'
										: winRmTerminalStatus === 'error'
											? 'Failed'
											: 'Ready'}
							</span>
							{winRmTerminalLines.length > 0 && (
								<button
									type="button"
									onClick={() => {
										setWinRmTerminalLines([]);
										if (!winRmBusyTargetKey) setWinRmTerminalStatus('idle');
									}}
									className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white/60"
								>
									Clear
								</button>
							)}
						</div>
						{winRmTerminalOpen && (
							<div
								ref={winRmTerminalScrollRef}
								className="remote-file-scrollbar h-[calc(100%-2.5rem)] overflow-y-auto bg-white/[0.22] px-3 py-2 font-mono text-[11px] font-medium leading-relaxed"
							>
								{winRmTerminalLines.length === 0 ? (
									<div className="py-8 text-center text-slate-500">No WinRM output</div>
								) : (
									winRmTerminalLines.map((line) => (
										<div
											key={line.id}
											className={`whitespace-pre-wrap break-words ${
												line.stream === 'stderr' || line.stream === 'error'
													? 'text-rose-700'
													: line.stream === 'status'
														? 'text-cyan-700'
														: 'text-slate-800'
											}`}
										>
											{line.text}
										</div>
									))
								)}
							</div>
						)}
					</div>
				</div>

				{/* ── 文件内容 ──────────────────────────────────────────────── */}
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
								<div
									className="pointer-events-none absolute inset-x-0 top-0 h-px
                bg-gradient-to-r from-transparent via-white/70 to-transparent"
								/>

								{/* 工具栏 */}
								<div
									className="flex shrink-0 items-center gap-2
                border-b border-white/[0.06] px-4 py-2.5"
								>
									{/* 文件路径 */}
									<span
										className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/50"
										title={sftpToDisplay(selectedFile)}
									>
										{sftpToDisplay(selectedFile)}
									</span>

									{/* 自动刷新 */}
									<button
										type="button"
										onClick={() => setAutoRefresh((v) => !v)}
										disabled={fileReadError}
										className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1
                    text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35
                    ${
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

									{/* 手动刷新 */}
									<button
										type="button"
										onClick={() => {
											if (!activeConnectionId) return;
											isDirty.current = false;
											setIsEditing(false);
											loadFile(activeConnectionId, selectedFile);
										}}
										className="shrink-0 rounded-lg bg-white/[0.04] px-2.5 py-1
                    text-[11px] text-white/35 transition-colors hover:text-white/65"
									>
										刷新
									</button>

									{/* 视图 / 编辑 切换 */}
									<button
										type="button"
										onClick={() => setIsEditing((v) => !v)}
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

									{/* 保存（仅编辑模式显示） */}
									{isEditing && !fileReadError && (
										<button
											type="button"
											onClick={handleSave}
											disabled={saving}
											className="shrink-0 rounded-lg px-3 py-1 text-[11px] font-medium
                    text-white transition-all disabled:opacity-40"
											style={{
												background: 'rgb(var(--accent-rgb) / 0.14)',
												border: '1px solid rgb(var(--accent-rgb) / 0.3)',
											}}
										>
											{saving ? '保存中…' : '保 存'}
										</button>
									)}

									{/* 保存状态提示 */}
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
												onChange={(e) => {
													const next = e.target.value;
													setTextSearchQuery(next);
												}}
												placeholder="搜索文本"
												className="min-w-0 flex-1 bg-transparent text-[12px] text-white/75 placeholder:text-white/28 focus:outline-none"
											/>
											{textSearchQuery && (
												<button
													type="button"
													onClick={() => {
														setTextSearchQuery('');
													}}
													aria-label="清除搜索"
													className="shrink-0 rounded-md px-1.5 text-[13px] text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
												>
													×
												</button>
											)}
										</div>
										<button
											type="button"
											onClick={() => setFilterProblemContext((value) => !value)}
											title={`过滤错误/异常/警告及上下 ${PROBLEM_CONTEXT_LINES} 行`}
											className={`remote-toolbar-button h-8 shrink-0 rounded-lg px-2.5 text-[11px] transition-colors ${
												filterProblemContext ? 'remote-toolbar-button-active' : ''
											}`}
										>
											Filter
										</button>
										<span
											className={`remote-toolbar-badge shrink-0 rounded-lg px-2.5 py-1 text-[11px] ${useLogViewer ? 'remote-toolbar-badge-active' : ''}`}
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

								{/* 查看区 / 编辑区 */}
								{loadingFile ? (
									<div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/30">
										<svg
											className="h-4 w-4 animate-spin"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
										</svg>
										加载中…
									</div>
								) : isEditing ? (
									<textarea
										className="remote-file-scrollbar min-h-0 flex-1 resize-none overflow-y-auto bg-transparent px-5 py-4
                    font-mono text-[13px] leading-relaxed text-white/80
                    placeholder:text-white/20 focus:outline-none"
										spellCheck={false}
										value={editorDraft}
										onChange={(e) => handleDraftChange(e.target.value)}
										placeholder="选择文件后显示内容…"
										autoFocus
									/>
								) : useLogViewer ? (
									<CmTraceLogContent searchQuery={textSearchQuery} searchResult={textSearchResult} />
								) : (
									<HighlightedContent searchQuery={textSearchQuery} searchResult={textSearchResult} />
								)}
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
								<span className="text-sm">{activeConnection ? '← 在左侧选择一个文件' : '请先连接或选择远程机器'}</span>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
