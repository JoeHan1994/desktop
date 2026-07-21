'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	sshReadFile,
	sshUnwatchFile,
	sshWatchFile,
	sshWriteFile,
	subscribeRemoteFileChanged,
} from '@/v2/services/tauriBridge';

// ── Retry on transient errors ─────────────────────────────────────────────

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

export function useRemoteFileEditor() {
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [analysisSelectedFiles, setAnalysisSelectedFiles] = useState<string[]>([]);
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
	const watchedFileRef = useRef<{ connectionId: string; path: string } | null>(null);
	const activeConnectionRef = useRef<string | null>(null);

	// Track the current active connection from outside
	const setActiveConnectionIdRef = useCallback((id: string | null) => {
		activeConnectionRef.current = id;
	}, []);

	// ── Draft sync ────────────────────────────────────────────────────────────

	// Only auto-sync draft when content changes AND editor hasn't been dirtied
	useEffect(() => {
		if (!isDirty.current) setEditorDraft(fileContent);
	}, [fileContent]);

	// ── File loading ──────────────────────────────────────────────────────────

	const loadFile = useCallback(
		async (connectionId: string, path: string, silent = false) => {
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
		},
		[],
	);

	// ── File watching ─────────────────────────────────────────────────────────

	function stopListening() {
		if (unlistenRef.current) {
			unlistenRef.current();
			unlistenRef.current = null;
		}
	}

	async function stopWatchingRemote(connectionId: string, path: string) {
		stopListening();
		await sshUnwatchFile(connectionId, path).catch(() => {});
		if (
			watchedFileRef.current?.connectionId === connectionId &&
			watchedFileRef.current.path === path
		) {
			watchedFileRef.current = null;
		}
	}

	const startWatching = useCallback(async (connectionId: string, path: string) => {
		stopListening();
		const previous = watchedFileRef.current;
		if (
			previous &&
			(previous.connectionId !== connectionId || previous.path !== path)
		) {
			await sshUnwatchFile(previous.connectionId, previous.path).catch(() => {});
			watchedFileRef.current = null;
		}
		const unlisten = await subscribeRemoteFileChanged((payload) => {
			if (payload.connectionId === connectionId && payload.path === path) {
				setFileReadError(false);
				setFileContent((current) =>
					payload.kind === 'append' ? current + payload.content : payload.content,
				);
			}
		});
		unlistenRef.current = unlisten;
		watchedFileRef.current = { connectionId, path };
		await sshWatchFile(connectionId, path);
	}, []);

	// autoRefresh ↔ file-watch lifecycle
	useEffect(() => {
		const connectionId = activeConnectionRef.current;
		if (autoRefresh && selectedFile && !fileReadError && connectionId) {
			void startWatching(connectionId, selectedFile);
		} else {
			stopListening();
			if (connectionId && selectedFile)
				void stopWatchingRemote(connectionId, selectedFile);
		}
		return () => {
			stopListening();
			if (connectionId && selectedFile)
				void stopWatchingRemote(connectionId, selectedFile);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoRefresh, selectedFile, fileReadError]);

	// ── Editor actions ────────────────────────────────────────────────────────

	const handleSelectFile = useCallback(
		(path: string, connectionId: string) => {
			setSelectedFile(path);
			setFileContent('');
			setEditorDraft('');
			setIsEditing(false);
			setSaveMsg('');
			setFileReadError(false);
			setAutoRefresh(true);
			setTextSearchQuery('');
			setFilterProblemContext(false);
			isDirty.current = false;
			void loadFile(connectionId, path);
		},
		[loadFile],
	);

	const handleDraftChange = useCallback((val: string) => {
		isDirty.current = true;
		setEditorDraft(val);
	}, []);

	const handleToggleAnalysisFile = useCallback((path: string, isDir: boolean) => {
		if (isDir) return;
		setAnalysisSelectedFiles((current) =>
			current.includes(path) ? current.filter((p) => p !== path) : [...current, path],
		);
	}, []);

	const handleSave = useCallback(
		async (connectionId: string, path: string, draft: string) => {
			setSaving(true);
			setSaveMsg('');
			try {
				await sshWriteFile(connectionId, path, draft);
				isDirty.current = false;
				setFileContent(draft);
				setIsEditing(false);
				setSaveMsg('✓ 已保存');
				if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
				saveMsgTimer.current = setTimeout(() => setSaveMsg(''), 3000);
			} catch (err: unknown) {
				const msg = `✗ 保存失败: ${String(err)}`;
				setSaveMsg(msg);
				if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
				saveMsgTimer.current = setTimeout(() => setSaveMsg(''), 3000);
			} finally {
				setSaving(false);
			}
		},
		[],
	);

	const resetEditorState = useCallback((connectionId?: string) => {
		stopListening();
		if (connectionId && watchedFileRef.current?.connectionId === connectionId) {
			const { path } = watchedFileRef.current;
			void sshUnwatchFile(connectionId, path).catch(() => {});
			watchedFileRef.current = null;
		}
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
	}, []);

	const forceReloadFile = useCallback(
		(connectionId: string, path: string) => {
			isDirty.current = false;
			setIsEditing(false);
			void loadFile(connectionId, path);
		},
		[loadFile],
	);

	return {
		// State
		selectedFile,
		analysisSelectedFiles,
		fileContent,
		editorDraft,
		isEditing,
		setIsEditing,
		loadingFile,
		fileReadError,
		saving,
		saveMsg,
		autoRefresh,
		setAutoRefresh,
		textSearchQuery,
		setTextSearchQuery,
		filterProblemContext,
		setFilterProblemContext,
		// Operations
		handleSelectFile,
		handleDraftChange,
		handleToggleAnalysisFile,
		handleSave,
		resetEditorState,
		forceReloadFile,
		setActiveConnectionIdRef,
	};
}

export type RemoteFileEditorHandle = ReturnType<typeof useRemoteFileEditor>;
