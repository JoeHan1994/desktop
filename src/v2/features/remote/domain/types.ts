/**
 * Domain types for the remote machine feature.
 *
 * Re-exports infrastructure types from tauriBridge for convenience,
 * so callers only import from this single location.
 */

import type {
	HyperVVmCredentialProfile,
	HyperVVirtualMachine,
	RemoteConnection,
	RemoteFileEntry,
	RemoteMachineProfile,
	WinRmOpenSshSetupOutputPayload,
} from '@/v2/services/tauriBridge';
import type { TokenStats } from '@/v2/services/llmClient';

export type {
	HyperVVmCredentialProfile,
	HyperVVirtualMachine,
	RemoteConnection,
	RemoteFileEntry,
	RemoteMachineProfile,
	WinRmOpenSshSetupOutputPayload,
	TokenStats,
};

// ── File system ────────────────────────────────────────────────────────────

export type FileEntry = RemoteFileEntry;

export interface TreeNode extends FileEntry {
	/** null = directory not yet loaded; [] = loaded and empty */
	children: TreeNode[] | null;
	expanded: boolean;
}

export const EMPTY_TREE_RECORD: Record<string, TreeNode[]> = {};

// ── Connection ─────────────────────────────────────────────────────────────

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

// ── Remote profiles ────────────────────────────────────────────────────────

export interface RemoteMachineImportResult {
	profiles: RemoteMachineProfile[];
	vmCredentials: HyperVVmCredentialProfile[];
	skipped: number;
}

export interface PendingVmConnection {
	parentConnection: RemoteConnection;
	vm: HyperVVirtualMachine;
	host: string;
	credentialKey: string;
}

export interface RdpCredential {
	username?: string;
	password?: string;
}

export interface WinRmOpenSshSetupTarget {
	key: string;
	label: string;
	host: string;
	username?: string;
	password?: string;
	sshPort?: string;
}

// ── WinRM terminal ─────────────────────────────────────────────────────────

export type WinRmTerminalStatus = 'idle' | 'running' | 'done' | 'error';

export interface WinRmTerminalLine {
	id: string;
	stream: WinRmOpenSshSetupOutputPayload['stream'];
	text: string;
}

// ── Log viewer ─────────────────────────────────────────────────────────────

export type LineLevel = 'error' | 'warn' | 'normal';
export type LogLevel = 'error' | 'warn' | 'info' | 'normal';

export interface ContentDisplayLine {
	text: string;
	originalIndex: number;
	matchCount: number;
}

export interface ContentSearchResult {
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

export interface ParsedLogLine {
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

export interface LogAnalysisBlock {
	startLine: number;
	endLine: number;
	text: string;
}

// ── AI analysis ────────────────────────────────────────────────────────────

export type AnalysisLanguage = 'ch' | 'en';
export type AnalysisFileStatus = 'pending' | 'running' | 'done' | 'error' | 'aborted';

export interface AnalysisContentPayload {
	content: string;
	isFilteredLog: boolean;
}

export interface AnalysisFileResult {
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

export interface AnalysisLanguageContent {
	content: string;
	hasLanguageSections: boolean;
}
