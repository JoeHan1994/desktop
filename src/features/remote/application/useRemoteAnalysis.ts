'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
	AnalysisFileResult,
	AnalysisFileStatus,
	AnalysisLanguage,
	TokenStats,
} from '../domain/types';
import {
	AnalysisAbortError,
	AnalysisTimeoutError,
	ANALYSIS_READ_TIMEOUT_MS,
	ANALYSIS_STREAM_IDLE_TIMEOUT_MS,
	MAX_ANALYSIS_REMOTE_FILE_BYTES,
	buildAnalysisContent,
	buildAnalysisMessages,
	getAnalysisLanguageContent,
	limitAnalysisContentForModel,
	withAnalysisStreamIdleTimeout,
	withAnalysisTimeout,
} from '../domain/logAnalysis';
import { sftpToDisplay } from '../domain/pathUtils';
import { formatSize } from '../domain/fileUtils';
import type { ModelProvider } from '@/features/models/ModelProvidersContext';
import { streamChat } from '@/services/llmClient';
import { sshReadFile } from '@/services/tauriBridge';

// ── Retry helper (same as file editor) ────────────────────────────────────

function isTransientRemoteReadError(err: unknown): boolean {
	return /channel send error|channel closed|connection reset|broken pipe/i.test(String(err));
}

async function readRemoteFileWithRetry(connectionId: string, path: string): Promise<string> {
	try {
		return await sshReadFile(connectionId, path);
	} catch (err: unknown) {
		if (!isTransientRemoteReadError(err)) throw err;
		await new Promise((resolve) => setTimeout(resolve, 250));
		return sshReadFile(connectionId, path);
	}
}

export function useRemoteAnalysis() {
	const [analysisOpen, setAnalysisOpen] = useState(false);
	const [analysisMinimized, setAnalysisMinimized] = useState(false);
	const [analysisProviderId, setAnalysisProviderId] = useState('');
	const [analysisModelOpen, setAnalysisModelOpen] = useState(false);
	const [analysisError, setAnalysisError] = useState('');
	const [analysisResults, setAnalysisResults] = useState<AnalysisFileResult[]>([]);

	const abortControllersRef = useRef<Record<string, AbortController>>({});

	// Abort all on unmount
	useEffect(() => {
		return () => {
			Object.values(abortControllersRef.current).forEach((c) => c.abort());
			abortControllersRef.current = {};
		};
	}, []);

	// ── Provider selection ────────────────────────────────────────────────────

	const syncProvider = useCallback(
		(providers: ModelProvider[]) => {
			if (providers.length === 0) {
				if (analysisProviderId) setAnalysisProviderId('');
				return;
			}
			if (
				!analysisProviderId ||
				!providers.some((p) => p.id === analysisProviderId)
			) {
				setAnalysisProviderId(providers[0].id);
			}
		},
		[analysisProviderId],
	);

	// ── Derived ───────────────────────────────────────────────────────────────

	const totalAnalysisStats = useMemo<TokenStats | null>(() => {
		const stats = analysisResults
			.map((r) => r.stats)
			.filter((s): s is TokenStats => s !== null);
		if (stats.length === 0) return null;
		const promptTokens = stats.reduce((sum, s) => sum + s.promptTokens, 0);
		const completionTokens = stats.reduce((sum, s) => sum + s.completionTokens, 0);
		const outputTpsValues = stats.map((s) => s.outputTps).filter((v) => v > 0);
		return {
			promptTokens,
			completionTokens,
			inputTps: 0,
			outputTps:
				outputTpsValues.length > 0
					? outputTpsValues.reduce((sum, v) => sum + v, 0) / outputTpsValues.length
					: 0,
		};
	}, [analysisResults]);

	const isAnalyzing = useMemo(
		() => analysisResults.some((r) => r.status === 'pending' || r.status === 'running'),
		[analysisResults],
	);

	// ── Modal controls ────────────────────────────────────────────────────────

	const openModal = useCallback(() => {
		setAnalysisOpen(true);
		setAnalysisMinimized(false);
		setAnalysisModelOpen(false);
		setAnalysisError('');
	}, []);

	const minimizeModal = useCallback(() => {
		setAnalysisMinimized(true);
		setAnalysisModelOpen(false);
	}, []);

	const restoreModal = useCallback(() => {
		setAnalysisOpen(true);
		setAnalysisMinimized(false);
		setAnalysisModelOpen(false);
	}, []);

	const resetAnalysis = useCallback(() => {
		Object.values(abortControllersRef.current).forEach((c) => c.abort());
		abortControllersRef.current = {};
		setAnalysisModelOpen(false);
		setAnalysisError('');
		setAnalysisResults([]);
	}, []);

	// ── Per-result updater ────────────────────────────────────────────────────

	const updateResult = useCallback(
		(path: string, updater: (r: AnalysisFileResult) => AnalysisFileResult) => {
			setAnalysisResults((current) =>
				current.map((r) => (r.path === path ? updater(r) : r)),
			);
		},
		[],
	);

	// ── File size gating ──────────────────────────────────────────────────────

	function getFileSizeError(path: string, sizeByPath: Map<string, number | null>, selectedFile: string | null, fileReadError: boolean, editorDraft: string): string {
		const size = sizeByPath.get(path);
		const usesLoadedDraft =
			path === selectedFile && !fileReadError && !!editorDraft.trim();
		if (usesLoadedDraft || size == null || size <= MAX_ANALYSIS_REMOTE_FILE_BYTES)
			return '';
		return `文件过大（${formatSize(size)}），为避免远程读取长时间卡住，Analyze 队列仅直接读取 ${formatSize(MAX_ANALYSIS_REMOTE_FILE_BYTES)} 以内的文件。请先打开该文件并使用过滤后的当前内容分析，或缩小日志范围后重试。`;
	}

	// ── Start / stop analysis ─────────────────────────────────────────────────

	const startAnalysis = useCallback(
		async (params: {
			targetPaths: string[];
			connectionId: string;
			provider: ModelProvider;
			sizeByPath: Map<string, number | null>;
			selectedFile: string | null;
			fileReadError: boolean;
			editorDraft: string;
			isCurrentlyAnalyzing: boolean;
		}) => {
			const {
				targetPaths,
				connectionId,
				provider,
				sizeByPath,
				selectedFile,
				fileReadError,
				editorDraft,
				isCurrentlyAnalyzing,
			} = params;

			if (isCurrentlyAnalyzing) {
				for (const path of targetPaths) {
					abortControllersRef.current[path]?.abort();
					delete abortControllersRef.current[path];
					updateResult(path, (r) =>
						r.status === 'pending' || r.status === 'running'
							? { ...r, status: 'aborted', statusDetail: '已停止' }
							: r,
					);
				}
				return;
			}

			const targetErrors = new Map(
				targetPaths.map((path) => [
					path,
					getFileSizeError(path, sizeByPath, selectedFile, fileReadError, editorDraft),
				]),
			);
			const runnablePaths = targetPaths.filter((p) => !targetErrors.get(p));

			setAnalysisModelOpen(false);
			setAnalysisError('');
			setAnalysisResults((current) =>
				[
					...current.filter((r) => !targetPaths.includes(r.path)),
					...targetPaths.map((path) => {
						const error = targetErrors.get(path) ?? '';
						return {
							path,
							displayPath: sftpToDisplay(path),
							status: (error ? 'error' : 'pending') as AnalysisFileStatus,
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
						abortControllersRef.current[path] = controller;
						updateResult(path, (r) => ({
							...r,
							status: 'running',
							statusDetail: '正在读取远程文件',
						}));

						try {
							let rawContent: string;
							if (path === selectedFile && !fileReadError && editorDraft.trim()) {
								if (controller.signal.aborted)
									throw new AnalysisAbortError('分析已停止。');
								rawContent = editorDraft;
							} else {
								rawContent = await withAnalysisTimeout(
									readRemoteFileWithRetry(connectionId, path),
									ANALYSIS_READ_TIMEOUT_MS,
									`远程文件读取超过 ${ANALYSIS_READ_TIMEOUT_MS / 1000} 秒，已停止本次分析。`,
									controller.signal,
								);
							}

							if (controller.signal.aborted) {
								updateResult(path, (r) => ({
									...r,
									status: 'aborted',
									statusDetail: '已停止',
								}));
								return;
							}

							if (!rawContent.trim()) {
								updateResult(path, (r) => ({
									...r,
									status: 'error',
									statusDetail: '文件为空',
									error: '当前文件内容为空，未发起分析。',
								}));
								return;
							}

							updateResult(path, (r) => ({
								...r,
								statusDetail: '正在预处理日志内容',
							}));
							const analysisContent = limitAnalysisContentForModel(
								buildAnalysisContent(path, rawContent),
							);
							updateResult(path, (r) => ({
								...r,
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
								`模型超过 ${ANALYSIS_STREAM_IDLE_TIMEOUT_MS / 1000} 秒没有返回新内容，已停止本次分析。`,
								controller.signal,
							)) {
								if (controller.signal.aborted) {
									updateResult(path, (r) => ({
										...r,
										status: 'aborted',
										statusDetail: '已停止',
									}));
									return;
								}
								if (chunk.content) {
									updateResult(path, (r) => ({
										...r,
										statusDetail: '模型正在生成结果',
										output: r.output + chunk.content,
									}));
								}
								if (chunk.stats) {
									updateResult(path, (r) => ({
										...r,
										stats: chunk.stats ?? null,
									}));
								}
							}

							updateResult(path, (r) => ({
								...r,
								status: 'done',
								statusDetail: '分析完成',
							}));
						} catch (err: unknown) {
							const timedOut = err instanceof AnalysisTimeoutError;
							if (timedOut) controller.abort();
							const aborted =
								!timedOut &&
								(controller.signal.aborted || err instanceof AnalysisAbortError);
							updateResult(path, (r) => ({
								...r,
								status: aborted ? 'aborted' : 'error',
								statusDetail: aborted ? '已停止' : '分析失败',
								error: aborted
									? ''
									: err instanceof Error
										? err.message
										: String(err),
							}));
						} finally {
							if (abortControllersRef.current[path] === controller) {
								delete abortControllersRef.current[path];
							}
						}
					}),
				);
			} catch (err: unknown) {
				setAnalysisError(String(err));
			}
		},
		[updateResult],
	);

	return {
		analysisOpen,
		setAnalysisOpen,
		analysisMinimized,
		analysisProviderId,
		setAnalysisProviderId,
		analysisModelOpen,
		setAnalysisModelOpen,
		analysisError,
		analysisResults,
		isAnalyzing,
		totalAnalysisStats,
		// Operations
		syncProvider,
		openModal,
		minimizeModal,
		restoreModal,
		resetAnalysis,
		startAnalysis,
		updateResult,
		getAnalysisLanguageContent,
	};
}

export type RemoteAnalysisHandle = ReturnType<typeof useRemoteAnalysis>;
