import React from 'react';
import type { ContentDisplayLine, ContentSearchResult, LineLevel, LogLevel, ParsedLogLine } from './types';

// ── Line classification ────────────────────────────────────────────────────

export const RE_ERROR =
	/\b(error|errors|exception|exceptions|fatal|critical|traceback|panic|crash|crashed|failed|failure)\b|\b(Error|Exception|Fatal)\b|\[\ *ERROR\b|\[\ *FATAL\b|错误|异常|失败|崩溃/i;

export const RE_WARN = /\b(warn(?:ing)?|caution|deprecated|deprecation)\b|\[\ *WARN\b|警告|注意/i;

const RE_STACK = /^\s+at\s+|^\s+caused\s+by\s*:|^\s+\.{3}\s+\d+\s+more\b|^\s+File\s+".+",\s+line\s+\d+/i;

export function classifyLine(line: string): LineLevel {
	if (RE_ERROR.test(line) || RE_STACK.test(line)) return 'error';
	if (RE_WARN.test(line)) return 'warn';
	return 'normal';
}

// ── CMTrace log parsing ────────────────────────────────────────────────────

export function parseCmTraceAttributes(raw: string): Record<string, string> {
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

export function parseLogLine(line: ContentDisplayLine): ParsedLogLine {
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

// ── Rendering ──────────────────────────────────────────────────────────────

/** CSS classes for a log row based on severity level. */
export function logLevelClasses(level: LogLevel): string {
	if (level === 'error') return 'bg-rose-500/[0.11] text-rose-200 hover:bg-rose-500/[0.16]';
	if (level === 'warn') return 'bg-amber-400/[0.1] text-amber-200 hover:bg-amber-400/[0.15]';
	return 'text-white/72 hover:bg-white/[0.03]';
}

/** Renders a line with the search query highlighted. */
export function renderHighlightedLine(line: string, query: string): React.ReactNode {
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

/** Returns true if the file content should use the structured CMTrace log viewer. */
export function shouldUseLogViewer(path: string | null, searchResult: ContentSearchResult): boolean {
	const normalizedPath = path?.toLowerCase() ?? '';
	if (/\.(log|lo_)$/i.test(normalizedPath)) return true;
	return searchResult.lines.slice(0, 80).some((line) => /^<!\[LOG\[/.test(line.text));
}
