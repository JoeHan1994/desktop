import type { AnalysisContentPayload, AnalysisLanguage, AnalysisLanguageContent, LogAnalysisBlock } from './types';
import type { LLMMessage } from '@/services/llmClient';
import { classifyLine, parseLogLine } from './logParser';

// ── Constants ──────────────────────────────────────────────────────────────

export const MAX_ANALYSIS_REMOTE_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_ANALYSIS_CONTENT_CHARS = 180_000;
export const ANALYSIS_READ_TIMEOUT_MS = 45_000;
export const ANALYSIS_STREAM_IDLE_TIMEOUT_MS = 120_000;

const LOG_ANALYSIS_CONTEXT_BLOCKS = 5;
const LOG_ANALYSIS_NO_ERROR_BLOCK_LIMIT = 40;

// ── Custom errors ──────────────────────────────────────────────────────────

export class AnalysisAbortError extends Error {}
export class AnalysisTimeoutError extends Error {}

// ── CMTrace block extraction ───────────────────────────────────────────────

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
			blocks.push({ startLine: currentStart, endLine: index - 1, text: currentLines.join('\n') });
			currentStart = index;
			currentLines = [];
		}
		if (currentLines.length === 0) currentStart = index;
		currentLines.push(line);
	}

	if (currentLines.length > 0) {
		blocks.push({ startLine: currentStart, endLine: lines.length - 1, text: currentLines.join('\n') });
	}

	return blocks;
}

function isErrorLogAnalysisBlock(block: LogAnalysisBlock): boolean {
	const firstLine = block.text.split('\n')[0] ?? '';
	const parsed = parseLogLine({ text: firstLine, originalIndex: block.startLine, matchCount: 0 });
	return parsed.level === 'error' || classifyLine(block.text) === 'error';
}

function mergeRanges(
	ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const merged: Array<{ start: number; end: number }> = [];
	for (const range of sorted) {
		const prev = merged[merged.length - 1];
		if (!prev || range.start > prev.end + 1) merged.push({ ...range });
		else prev.end = Math.max(prev.end, range.end);
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

	const ranges = mergeRanges(
		errorIndexes.map((index) => ({
			start: Math.max(0, index - LOG_ANALYSIS_CONTEXT_BLOCKS),
			end: Math.min(blocks.length - 1, index + LOG_ANALYSIS_CONTEXT_BLOCKS),
		})),
	);
	const extractedBlockCount = ranges.reduce((sum, r) => sum + r.end - r.start + 1, 0);
	const extractedSections = ranges.map((range, index) =>
		[
			`--- 抽取片段 ${index + 1} / ${ranges.length}：错误/异常块上下 ${LOG_ANALYSIS_CONTEXT_BLOCKS} 个 <![LOG[ 块，重叠范围已合并 ---`,
			blocks.slice(range.start, range.end + 1).map((b) => b.text).join('\n'),
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

// ── Public API ─────────────────────────────────────────────────────────────

/** Filters CMTrace log content to only error blocks + context before sending to LLM. */
export function buildAnalysisContent(path: string | null, content: string): AnalysisContentPayload {
	if (!shouldFilterLogForAnalysis(path, content)) return { content, isFilteredLog: false };
	return { content: buildFilteredLogAnalysisContent(content), isFilteredLog: true };
}

/** Truncates analysis payload to stay within model context limits. */
export function limitAnalysisContentForModel(
	payload: AnalysisContentPayload,
): AnalysisContentPayload {
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

export function splitAnalysisLanguageSections(output: string): Record<AnalysisLanguage, string> {
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

export function getAnalysisLanguageContent(
	output: string,
	language: AnalysisLanguage,
): AnalysisLanguageContent {
	const sections = splitAnalysisLanguageSections(output);
	const hasLanguageSections = Boolean(sections.ch || sections.en);
	return {
		content: hasLanguageSections ? sections[language] : output.trim(),
		hasLanguageSections,
	};
}

/** Builds the LLM message array for the file analysis prompt. */
export function buildAnalysisMessages(
	path: string,
	content: string,
	isFilteredLog = false,
): LLMMessage[] {
	return [
		{
			role: 'system',
			content: [
				'你是一个严谨的软件与运维文件分析助手。你的任务是只根据用户提供的远程文件路径和文件内容进行分析。',
				'',
				'硬性约束：',
				'1. 只能分析原文件中实际出现的内容，不得引入外部背景、通用教程、假设场景、历史上下文或与文件无关的话题。',
				'2. 不得臆测文件未体现的信息；如果某项无法从原文判断，必须明确写"原文件未体现"。',
				'3. 每个结论、风险、建议或判断都必须引用原文件中的具体内容作为依据。',
				'4. 引用依据时使用原文片段，不要编造行号；如果原文片段较长，只摘取能支撑论点的最小必要片段。',
				'5. 不要分析用户未提供的其他文件、系统状态、运行环境、部署方式或命令执行结果。',
				'6. 不要给出与当前文件无关的安全建议、部署建议、代码风格建议或泛泛最佳实践。',
				'7. 如果文件内容不足以支持完整分析，应说明信息不足，并列出还需要哪些原文件内容。',
				'8. 对原文件明确体现的高风险、错误或失败线索使用 🔴；对需要关注但不一定构成错误的问题、警告或不确定线索使用 🟡。不要为了凑格式强行添加表情。',
				'9. 如果输入内容包含"日志预处理说明"或"抽取片段"分隔线，它们只用于限定分析范围，不属于原文件内容，不得作为依据引用。',
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
				'每个条目都必须包含原文依据：CH 段写"依据：`原文片段`"，EN 段写"Evidence: `原文片段`"。建议按以下结构输出：',
				'<!-- ANALYSIS:CH -->',
				'## 配置或逻辑\n- 结论：...\n  依据：`原文片段`\n\n## 潜在风险或异常线索\n- 🔴 风险：...\n  依据：`原文片段`\n  影响：...\n- 🟡 注意：...\n  依据：`原文片段`\n  影响：...\n\n## 建议的下一步\n- 建议：...\n  依据：`原文片段`',
				'<!-- ANALYSIS:EN -->',
				'## Configuration Or Logic\n- Finding: ...\n  Evidence: `original excerpt`\n\n## Potential Risks Or Exception Signals\n- 🔴 Risk: ...\n  Evidence: `original excerpt`\n  Impact: ...\n- 🟡 Note: ...\n  Evidence: `original excerpt`\n  Impact: ...\n\n## Recommended Next Steps\n- Recommendation: ...\n  Evidence: `original excerpt`',
				'',
				'如果没有发现风险或异常线索，也必须基于原文件内容说明"未从当前文件内容中发现明确风险"，并引用支持该判断的相关片段。',
				'If no risk or exception signal is found, the EN section must also say that no explicit risk was found from the current file content, with supporting original excerpts.',
			].join('\n'),
		},
		{
			role: 'user',
			content: `远程文件路径：${path}\n\n文件内容：\n\n${content}`,
		},
	];
}

// ── Timeout & streaming helpers ────────────────────────────────────────────

export async function withAnalysisTimeout<T>(
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
		timeoutId = setTimeout(
			() => finish(() => reject(new AnalysisTimeoutError(timeoutMessage))),
			timeoutMs,
		);
		signal?.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => finish(() => resolve(value)),
			(err: unknown) => finish(() => reject(err)),
		);
	});
}

export async function* withAnalysisStreamIdleTimeout<T>(
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
