import type { ContentDisplayLine, ContentSearchResult } from './types';
import { classifyLine } from './logParser';

export const MAX_LINES = 8000;
export const PROBLEM_CONTEXT_LINES = 5;

// ── Problem detection ──────────────────────────────────────────────────────

export function isProblemLine(line: string): boolean {
	return classifyLine(line) !== 'normal' || /\btype="(?:2|3)"/i.test(line);
}

// ── Range merging ──────────────────────────────────────────────────────────

export function mergeBlockRanges(
	ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const merged: Array<{ start: number; end: number }> = [];
	for (const range of sorted) {
		const prev = merged[merged.length - 1];
		if (!prev || range.start > prev.end + 1) {
			merged.push({ ...range });
		} else {
			prev.end = Math.max(prev.end, range.end);
		}
	}
	return merged;
}

// ── Problem-context filtering ──────────────────────────────────────────────

export function buildProblemContextLines(
	indexedLines: ContentDisplayLine[],
): ContentDisplayLine[] {
	const ranges = indexedLines
		.map((line, index) => (isProblemLine(line.text) ? index : -1))
		.filter((index) => index >= 0)
		.map((index) => ({
			start: Math.max(0, index - PROBLEM_CONTEXT_LINES),
			end: Math.min(indexedLines.length - 1, index + PROBLEM_CONTEXT_LINES),
		}));

	if (ranges.length === 0) return [];
	return mergeBlockRanges(ranges).flatMap((range) =>
		indexedLines.slice(range.start, range.end + 1),
	);
}

// ── Main search/filter builder ─────────────────────────────────────────────

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

/**
 * Processes raw file content into a `ContentSearchResult` ready for the viewer.
 * Applies optional query-based line filtering and problem-context extraction.
 */
export function buildContentSearchResult(
	content: string,
	query: string,
	filterProblems: boolean,
): ContentSearchResult {
	const raw = content.split('\n');
	const clipped = raw.length > MAX_LINES;
	const startLineIndex = clipped ? raw.length - MAX_LINES : 0;
	const limited = raw.slice(startLineIndex);
	const normalizedQuery = query.trim();
	const hasQuery = normalizedQuery.length > 0;

	const indexedLines: ContentDisplayLine[] = limited.map((text, index) => ({
		text,
		originalIndex: startLineIndex + index,
		matchCount: countMatches(text, normalizedQuery),
	}));

	const matchedLineCount = hasQuery ? indexedLines.filter((l) => l.matchCount > 0).length : 0;
	const totalMatches = hasQuery
		? indexedLines.reduce((sum, l) => sum + l.matchCount, 0)
		: 0;
	const problemLineCount = indexedLines.filter((l) => isProblemLine(l.text)).length;
	const shouldFilterProblems = filterProblems && !hasQuery;
	const matchedLines = hasQuery ? indexedLines.filter((l) => l.matchCount > 0) : indexedLines;
	const problemContextLines = shouldFilterProblems
		? buildProblemContextLines(indexedLines)
		: indexedLines;
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
