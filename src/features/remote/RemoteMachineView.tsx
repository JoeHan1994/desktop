'use client';

/**
 * RemoteMachineView — thin DDD orchestrator.
 *
 * Architecture:
 *   domain/        – pure business logic (types, utils, parsers, builders)
 *   application/   – React hooks (state management per bounded context)
 *   components/    – dumb presentational components
 *
 * This file only wires them together and handles cross-domain coordination.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ── Application hooks ──────────────────────────────────────────────────────
import { useRemoteProfiles } from './application/useRemoteProfiles';
import { useRemoteConnections } from './application/useRemoteConnections';
import { useRemoteFileEditor } from './application/useRemoteFileEditor';
import { useRemoteAnalysis } from './application/useRemoteAnalysis';
import { useWinRmTerminal } from './application/useWinRmTerminal';

// ── Domain ─────────────────────────────────────────────────────────────────
import {
	DEFAULT_RDP_PORT,
	buildProfile,
	findHostConflict,
	hostConflictMessage,
	normalizePort,
	normalizeRdpPort,
	profileLabel,
} from './domain/profileDomain';
import {
	buildPendingVm,
	isCredentialForVm,
	isVmRunning,
	parentCredentialScope,
	pickVmHost,
	vmCredentialKey,
	vmIdentity,
	vmPowerAction,
} from './domain/vmDomain';
import { buildContentSearchResult } from './domain/logFilter';
import { shouldUseLogViewer } from './domain/logParser';
import { collectTreeFileSizes } from './domain/fileUtils';
import { sftpToDisplay } from './domain/pathUtils';
import { EMPTY_TREE_RECORD } from './domain/types';
import type {
	HyperVVirtualMachine,
	PendingVmConnection,
	RemoteConnection,
	RemoteMachineProfile,
} from './domain/types';

// ── Presentation components ────────────────────────────────────────────────
import { MachineList } from './components/MachineList';
import { DiskTree } from './components/FileTree';
import { FileEditorPanel } from './components/FileEditorPanel';
import { ProfileFormModal } from './components/ProfileFormModal';
import { AnalysisModal } from './components/AnalysisModal';
import { WinRmTerminalPanel } from './components/WinRmTerminalPanel';

// ── Shared ─────────────────────────────────────────────────────────────────
import { useModelProviders } from '@/features/models/ModelProvidersContext';
import { Icon } from '@/components/ui/Icon';

// ══════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════

export function RemoteMachineView() {
	const { providers } = useModelProviders();

	// ── Application layer ──────────────────────────────────────────────────
	const profilesHandle = useRemoteProfiles();
	const connectionsHandle = useRemoteConnections();
	const fileEditorHandle = useRemoteFileEditor();
	const analysisHandle = useRemoteAnalysis();
	const winRmHandle = useWinRmTerminal();

	// ── Profile form state (pure UI – stays here) ──────────────────────────
	const [configOpen, setConfigOpen] = useState(false);
	const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
	const [pendingVmConnection, setPendingVmConnection] = useState<PendingVmConnection | null>(
		null,
	);
	const [profileName, setProfileName] = useState('');
	const [host, setHost] = useState('');
	const [port, setPort] = useState('22');
	const [rdpPort, setRdpPort] = useState(DEFAULT_RDP_PORT);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const importFileRef = useRef<HTMLInputElement | null>(null);

	// ── Cross-hook synchronisation ─────────────────────────────────────────

	useEffect(() => {
		fileEditorHandle.setActiveConnectionIdRef(connectionsHandle.activeConnectionId);
	}, [connectionsHandle.activeConnectionId, fileEditorHandle.setActiveConnectionIdRef]);

	useEffect(() => {
		analysisHandle.syncProvider(providers);
	}, [providers, analysisHandle.syncProvider]);

	// ── Destructure frequently used values ────────────────────────────────

	const {
		connections,
		activeConnectionId,
		connStatus,
		connError,
		setConnError,
		connectingProfileId,
		connectingVmKey,
		connectionDisks,
		connectionTrees,
		connectionDiskExpanded,
		connectionHypervVms,
		hypervExpanded,
		setHypervExpanded,
		vmPowerBusyKey,
		fetchingVmIpKey,
		setFetchingVmIpKey,
		rdpOpeningTarget,
	} = connectionsHandle;

	const activeConnection = useMemo(
		() => (activeConnectionId ? connections.find((c) => c.id === activeConnectionId) ?? null : null),
		[activeConnectionId, connections],
	);
	const activeDiskRoots = activeConnectionId ? (connectionDisks[activeConnectionId] ?? []) : [];
	const activeTrees = useMemo(
		() =>
			activeConnectionId
				? (connectionTrees[activeConnectionId] ?? EMPTY_TREE_RECORD)
				: EMPTY_TREE_RECORD,
		[activeConnectionId, connectionTrees],
	);
	const activeDiskExpanded = activeConnectionId
		? (connectionDiskExpanded[activeConnectionId] ?? {})
		: {};

	const analysisFileSizeByPath = useMemo(() => {
		const sizes = new Map<string, number | null>();
		Object.values(activeTrees).forEach((nodes) => collectTreeFileSizes(nodes, sizes));
		return sizes;
	}, [activeTrees]);

	const {
		selectedFile,
		analysisSelectedFiles,
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
	} = fileEditorHandle;

	const textSearchResult = useMemo(
		() => buildContentSearchResult(editorDraft, textSearchQuery, filterProblemContext),
		[editorDraft, textSearchQuery, filterProblemContext],
	);
	const useLogViewer = useMemo(
		() => shouldUseLogViewer(selectedFile, textSearchResult),
		[selectedFile, textSearchResult],
	);

	const analysisSelectedSet = useMemo(() => new Set(analysisSelectedFiles), [analysisSelectedFiles]);

	const analysisTargetPaths = useMemo(
		() =>
			analysisSelectedFiles.length > 0
				? analysisSelectedFiles
				: selectedFile
					? [selectedFile]
					: [],
		[analysisSelectedFiles, selectedFile],
	);

	const isConnecting = connStatus === 'connecting';
	const { analysisResults, isAnalyzing } = analysisHandle;

	const currentTargetsAnalyzing = useMemo(
		() =>
			analysisResults.some(
				(r) =>
					analysisTargetPaths.includes(r.path) &&
					(r.status === 'pending' || r.status === 'running'),
			),
		[analysisResults, analysisTargetPaths],
	);

	const hasCheckedAnalysisFiles = analysisSelectedFiles.length > 0;
	const selectedAnalysisProvider =
		providers.find((p) => p.id === analysisHandle.analysisProviderId) ?? null;

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

	const analysisStatusLabel = (() => {
		const active = analysisResults.filter(
			(r) => r.status === 'pending' || r.status === 'running',
		);
		const targetLabel = hasCheckedAnalysisFiles
			? `${analysisSelectedFiles.length.toLocaleString()} 个文件已加入 Analyze 队列`
			: selectedFile
				? sftpToDisplay(selectedFile)
				: '未选择文件';
		if (active.length === 1) return active[0].displayPath;
		if (active.length > 1) return `${active.length.toLocaleString()} 个文件正在分析`;
		return targetLabel;
	})();

	// ── Profile form helpers ───────────────────────────────────────────────

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

	function applyVmCredential(
		pending: PendingVmConnection,
		saved?: { username?: string; password?: string; port?: string; label?: string },
	) {
		setEditingProfileId(null);
		setPendingVmConnection(pending);
		setProfileName(saved?.label || pending.vm.name);
		setHost(pending.host);
		setPort(normalizePort(saved?.port ?? '22'));
		setUsername(saved?.username ?? '');
		setPassword(saved?.password ?? '');
		setConnError('');
	}

	function findVmCredential(
		parentConnection: RemoteConnection,
		vm: HyperVVirtualMachine,
		hostValue = '',
	) {
		const key = vmCredentialKey(parentConnection, vm);
		const stable = profilesHandle.vmCredentials[key];
		if (stable) return stable;
		const candidates = Object.values(profilesHandle.vmCredentials)
			.filter((c) => isCredentialForVm(c, parentConnection, vm))
			.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt));
		return candidates.find((c) => c.host === hostValue) ?? candidates[0];
	}

	// ── Connection orchestration ───────────────────────────────────────────

	function switchActiveConnection(connectionId: string | null) {
		connectionsHandle.setActiveConnectionId(connectionId);
		fileEditorHandle.resetEditorState(activeConnectionId ?? undefined);
		analysisHandle.resetAnalysis();
	}

	async function handleConnect(profile?: RemoteMachineProfile) {
		const pending = pendingVmConnection;
		const hostValue = (profile?.host ?? host).trim();
		const portValue = normalizePort(profile?.port ?? port);
		const rdpPortValue = normalizeRdpPort(profile?.rdpPort ?? rdpPort);
		const usernameValue = (profile?.username ?? username).trim();
		const passwordValue = profile?.password ?? password;
		if (!hostValue || !usernameValue) return;

		const baseProfile =
			profile ??
			buildProfile(hostValue, portValue, rdpPortValue, usernameValue, passwordValue, undefined, profileName);

		if (!pending) {
			const conflict = findHostConflict(
				profilesHandle.profiles,
				baseProfile,
				profile?.id ?? editingProfileId,
			);
			if (conflict) {
				setConnError(hostConflictMessage(conflict));
				return;
			}
		}

		if (profile) applyProfile(profile);

		const connection = await connectionsHandle.connectSSH(
			{
				host: hostValue,
				port: Number(portValue),
				username: usernameValue,
				password: passwordValue,
				label: pending
					? profileName.trim() || pending.vm.name
					: profile
						? profile.label
						: profileName,
				kind: pending ? 'vm' : 'host',
				parentConnectionId: pending?.parentConnection.id,
				parentProfileId: pending
					? parentCredentialScope(pending.parentConnection)
					: baseProfile.id,
				vmId: pending ? vmIdentity(pending.vm) : undefined,
			},
			profile?.id ?? null,
			pending?.credentialKey ?? null,
		);

		if (!connection) return;

		switchActiveConnection(connection.id);

		if (pending) {
			await profilesHandle.persistVmCredential({
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
			});
		} else {
			await profilesHandle.upsertProfile(
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
		}

		setConfigOpen(false);
		setPendingVmConnection(null);
		setEditingProfileId(null);
	}

	async function handleDisconnect(connectionId = activeConnectionId) {
		if (!connectionId) return;
		const removed = await connectionsHandle.disconnectById(connectionId);
		if (removed.has(activeConnectionId ?? '')) {
			fileEditorHandle.resetEditorState(activeConnectionId ?? undefined);
			analysisHandle.resetAnalysis();
		}
	}

	async function handleDeleteProfile(profile: RemoteMachineProfile) {
		try {
			await profilesHandle.deleteProfile(profile.id);
			const conn = connections.find(
				(c) => c.kind === 'host' && c.parentProfileId === profile.id,
			);
			if (conn) await handleDisconnect(conn.id);
		} catch (err: unknown) {
			setConnError(String(err));
		}
	}

	async function handleSaveProfileFromForm() {
		const pending = pendingVmConnection;
		if (pending) {
			if (!username.trim()) return;
			try {
				await profilesHandle.persistVmCredential({
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
				});
				setConfigOpen(false);
			} catch (err: unknown) {
				setConnError(String(err));
			}
			return;
		}
		if (!host.trim() || !username.trim()) return;
		const nextProfile = buildProfile(host, port, rdpPort, username, password, undefined, profileName);
		const conflict = findHostConflict(profilesHandle.profiles, nextProfile, editingProfileId);
		if (conflict) {
			setConnError(hostConflictMessage(conflict));
			return;
		}
		try {
			await profilesHandle.upsertProfile(nextProfile, editingProfileId);
			setConfigOpen(false);
		} catch (err: unknown) {
			setConnError(String(err));
		}
	}

	// ── VM connection orchestration ────────────────────────────────────────

	async function handleConnectVm(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) {
		const existing = connections.find(
			(c) =>
				c.kind === 'vm' &&
				c.parentConnectionId === parentConnection.id &&
				c.vmId === vmIdentity(vm),
		);
		if (existing) {
			switchActiveConnection(existing.id);
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
			const connection = await connectionsHandle.connectSSH(
				{
					host: saved.host || pending.host,
					port: Number(normalizePort(saved.port)),
					username: saved.username,
					password: saved.password,
					label: saved.label || vm.name,
					kind: 'vm',
					parentConnectionId: parentConnection.id,
					parentProfileId: parentCredentialScope(parentConnection),
					vmId: vmIdentity(vm),
				},
				null,
				vmCredentialKey(parentConnection, vm),
			);
			if (connection) {
				switchActiveConnection(connection.id);
				await profilesHandle.persistVmCredential({
					...saved,
					id: vmCredentialKey(parentConnection, vm),
					host: saved.host || pending.host,
					vmName: vm.name,
					lastConnectedAt: new Date().toISOString(),
				});
			} else {
				applyVmCredential(pending, saved);
				setConfigOpen(true);
			}
			return;
		}

		applyVmCredential(pending, saved);
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
			const refreshedVms = await connectionsHandle.refreshHyperV(pending.parentConnection.id);
			const currentVm =
				refreshedVms.find((v) => vmIdentity(v) === vmIdentity(pending.vm)) ?? pending.vm;

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

			const result = await connectionsHandle.waitForVmHost(
				pending.parentConnection,
				currentVm,
			);
			if (!result) {
				setConnError('暂未获取到可用 IP，请稍后再次点击 IP 输入框。');
				return;
			}
			const nextPending = buildPendingVm(pending.parentConnection, result.vm, result.host);
			setPendingVmConnection(nextPending);
			setHost(nextPending.host);
		} catch (err: unknown) {
			setConnError(String(err));
		} finally {
			setFetchingVmIpKey((current) => (current === key ? null : current));
		}
	}

	function handleEditVmCredential(
		parentConnection: RemoteConnection,
		vm: HyperVVirtualMachine,
	) {
		const pending = buildPendingVm(parentConnection, vm);
		applyVmCredential(pending, findVmCredential(parentConnection, vm, pending.host));
		setConfigOpen(true);
	}

	// ── Analysis orchestration ─────────────────────────────────────────────

	async function handleStartAnalysis() {
		if (!activeConnectionId || !selectedAnalysisProvider) return;
		await analysisHandle.startAnalysis({
			targetPaths: analysisTargetPaths,
			connectionId: activeConnectionId,
			provider: selectedAnalysisProvider,
			sizeByPath: analysisFileSizeByPath,
			selectedFile,
			fileReadError,
			editorDraft,
			isCurrentlyAnalyzing: currentTargetsAnalyzing,
		});
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden">
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[11px] text-white/35">系统 · Remote Machines</div>
					<div className="flex min-w-0 items-center gap-2">
						<h1 className="truncate text-xl font-semibold tracking-tight text-white/85">
							远程机器
						</h1>
						<span
							className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
							title="当前在线数量"
						>
							{connections.length} 在线
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<input
						ref={importFileRef}
						type="file"
						accept="application/json,.json"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = '';
							if (file) void profilesHandle.importFromFile(file);
						}}
					/>
					<button
						type="button"
						onClick={() => canOpenAnalysis && analysisHandle.openModal()}
						disabled={!canOpenAnalysis}
						title={analysisButtonTitle}
						className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
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
						onClick={() => importFileRef.current?.click()}
						disabled={profilesHandle.importingProfiles}
						className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
						style={{
							background: 'rgb(var(--glass-rgb) / 0.08)',
							border: '1px solid rgb(255 255 255 / 0.12)',
						}}
					>
						<Icon
							name={profilesHandle.importingProfiles ? 'loader' : 'upload'}
							className={`h-3.5 w-3.5 ${profilesHandle.importingProfiles ? 'animate-spin' : ''}`}
							aria-hidden="true"
						/>
						Import
					</button>
					<a
						href="/downloads/remote-machine-import-template.json"
						download
						className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-white/65 transition-all hover:text-white"
						style={{
							background: 'rgb(var(--glass-rgb) / 0.06)',
							border: '1px solid rgb(255 255 255 / 0.1)',
						}}
						title="下载导入 JSON 模板"
					>
						<Icon name="download" className="h-3.5 w-3.5" aria-hidden="true" />
						模板
					</a>
					<button
						type="button"
						onClick={() => {
							resetProfileForm();
							profilesHandle.setImportError('');
							profilesHandle.setImportNotice('');
							setConfigOpen(true);
						}}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-white/75 transition-all hover:text-white"
						style={{
							background: 'rgb(var(--glass-rgb) / 0.08)',
							border: '1px solid rgb(255 255 255 / 0.12)',
						}}
						title="新增远程机器"
					>
						<Icon name="plus" className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
			</div>

			{/* Import notice / error */}
			<AnimatePresence>
				{(profilesHandle.importNotice || profilesHandle.importError) && (
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
							profilesHandle.importError
								? 'bg-rose-500/10 text-rose-300'
								: 'bg-emerald-500/10 text-emerald-300'
						}`}
					>
						<Icon
							name={profilesHandle.importError ? 'x' : 'check'}
							className="h-3.5 w-3.5 shrink-0"
							aria-hidden="true"
						/>
						<span className="min-w-0 flex-1">
							{profilesHandle.importError || profilesHandle.importNotice}
						</span>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Profile form modal */}
			<ProfileFormModal
				open={configOpen}
				onClose={() => setConfigOpen(false)}
				pendingVmConnection={pendingVmConnection}
				profileName={profileName}
				host={host}
				port={port}
				rdpPort={rdpPort}
				username={username}
				password={password}
				connError={connError}
				isConnecting={isConnecting}
				isFetchingVmIp={
					!!pendingVmConnection && fetchingVmIpKey === pendingVmConnection.credentialKey
				}
				onProfileNameChange={setProfileName}
				onHostChange={setHost}
				onPortChange={setPort}
				onRdpPortChange={setRdpPort}
				onUsernameChange={setUsername}
				onPasswordChange={setPassword}
				onFetchVmIp={handleFetchPendingVmHost}
				onSave={() => void handleSaveProfileFromForm()}
				onConnect={() => void handleConnect()}
			/>

			{/* AI analysis modal */}
			<AnalysisModal
				open={analysisHandle.analysisOpen}
				minimized={analysisHandle.analysisMinimized}
				analysisResults={analysisHandle.analysisResults}
				analysisError={analysisHandle.analysisError}
				isAnalyzing={isAnalyzing}
				totalAnalysisStats={analysisHandle.totalAnalysisStats}
				statusLabel={analysisStatusLabel}
				providers={providers}
				selectedProvider={selectedAnalysisProvider}
				modelPickerOpen={analysisHandle.analysisModelOpen}
				canStart={canStartAnalysis}
				isCurrentlyAnalyzing={currentTargetsAnalyzing}
				startTitle={analysisStartTitle}
				onClose={() => analysisHandle.setAnalysisOpen(false)}
				onMinimize={analysisHandle.minimizeModal}
				onRestore={analysisHandle.restoreModal}
				onToggleModelPicker={() =>
					analysisHandle.setAnalysisModelOpen((v: boolean) => !v)
				}
				onSelectProvider={(id) => {
					analysisHandle.setAnalysisProviderId(id);
					analysisHandle.setAnalysisModelOpen(false);
				}}
				onStart={() => void handleStartAnalysis()}
				onUpdateResultLanguage={(path, lang) =>
					analysisHandle.updateResult(path, (r) => ({ ...r, language: lang }))
				}
			/>

			{/* Three-column layout */}
			<div className="grid h-full min-h-0 flex-1 grid-cols-[304px_304px_minmax(0,1fr)] gap-3 overflow-hidden">
				{/* ── Column 1: Machine list ─────────────────────────────── */}
				<div className="flex min-h-0 flex-col overflow-hidden">
					<div className="glass app-card relative flex min-h-0 flex-1 flex-col overflow-hidden">
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
						<div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3.5 py-2">
							<span className="text-xs font-medium text-white/60">机器列表</span>
							<span className="text-[10px] text-white/25">
								{profilesHandle.profiles.length} 台
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-2">
							<MachineList
								profiles={profilesHandle.profiles}
								vmCredentials={profilesHandle.vmCredentials}
								connections={connections}
								activeConnectionId={activeConnectionId}
								connectingProfileId={connectingProfileId}
								connectingVmKey={connectingVmKey}
								isConnecting={isConnecting}
								vmPowerBusyKey={vmPowerBusyKey}
								rdpOpeningTarget={rdpOpeningTarget}
								winRmBusyTargetKey={winRmHandle.winRmBusyTargetKey}
								connectionHypervVms={connectionHypervVms}
								hypervExpanded={hypervExpanded}
								onSwitchActive={switchActiveConnection}
								onConnect={(profile) => {
									applyProfile(profile);
									void handleConnect(profile);
								}}
								onDisconnect={(id) => void handleDisconnect(id)}
								onConnectVm={handleConnectVm}
								onDisconnectVm={(id) => void handleDisconnect(id)}
								onToggleVmPower={(conn, vm) =>
									void connectionsHandle.toggleVmPower(conn, vm, vmPowerAction(vm))
								}
								onOpenRdpProfile={(profile) =>
									void connectionsHandle.openRdp(
										profile.host,
										normalizeRdpPort(profile.rdpPort),
										`host:${profile.id}`,
										profile,
									)
								}
								onOpenRdpVm={(parentConn, vm) => {
									const vmHost = pickVmHost(vm);
									const parentProfile = profilesHandle.profiles.find(
										(p) => p.id === parentConn.parentProfileId,
									);
									const saved = findVmCredential(parentConn, vm, vmHost ?? '');
									void connectionsHandle.openRdp(
										vmHost ?? '',
										normalizeRdpPort(parentProfile?.rdpPort),
										`vm:${parentConn.id}:${vmIdentity(vm)}`,
										saved?.username ? saved : parentProfile,
									);
								}}
								onRunWinRmProfile={(target) => void winRmHandle.runOpenSshSetup(target)}
								onRunWinRmVm={(target) => void winRmHandle.runOpenSshSetup(target)}
								onEditProfile={(profile) => {
									applyProfile(profile);
									setConfigOpen(true);
								}}
								onDeleteProfile={(profile) => void handleDeleteProfile(profile)}
								onEditVmCredential={handleEditVmCredential}
								onToggleHypervExpanded={(connectionId) =>
									setHypervExpanded((prev) => ({
										...prev,
										[connectionId]: !prev[connectionId],
									}))
								}
							/>
						</div>
					</div>
				</div>

				{/* ── Column 2: File tree + WinRM terminal ──────────────── */}
				<div className="flex min-h-0 flex-col gap-3 overflow-hidden">
					<div className="glass app-card relative flex min-h-0 flex-1 flex-col overflow-hidden">
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
						<div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3.5 py-2">
							<span className="text-xs font-medium text-white/60">文件系统</span>
							<span className="min-w-0 truncate text-[10px] text-white/25">
								{activeConnection
									? `${activeConnection.label} · ${activeDiskRoots.length} 个磁盘`
									: '未选择'}
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
							{!activeConnection ? (
								<div className="flex h-full min-h-28 items-center justify-center px-5 text-center text-[12px] text-white/25">
									从远程机器列表选择机器后显示文件树
								</div>
							) : (
								<DiskTree
									connectionId={activeConnectionId ?? ''}
									diskRoots={activeDiskRoots}
									trees={activeTrees}
									diskExpanded={activeDiskExpanded}
									selectedFile={selectedFile}
									analysisSelected={analysisSelectedSet}
									onDiskToggle={(disk) =>
										connectionsHandle.toggleDiskRoot(activeConnectionId ?? '', disk)
									}
									onNodeSelect={(node) => {
										if (activeConnectionId)
											fileEditorHandle.handleSelectFile(node.path, activeConnectionId);
									}}
									onNodeToggle={(node) => {
										if (activeConnectionId)
											void connectionsHandle.handleTreeToggle(
												activeConnectionId,
												activeDiskRoots,
												node,
											);
									}}
									onNodeToggleAnalysis={(node) =>
										fileEditorHandle.handleToggleAnalysisFile(node.path, node.is_dir)
									}
								/>
							)}
						</div>
					</div>

					<WinRmTerminalPanel
						open={winRmHandle.winRmTerminalOpen}
						status={winRmHandle.winRmTerminalStatus}
						lines={winRmHandle.winRmTerminalLines}
						scrollRef={winRmHandle.terminalScrollRef}
						onToggle={() => winRmHandle.setWinRmTerminalOpen((v) => !v)}
					/>
				</div>

				{/* ── Column 3: File editor ──────────────────────────────── */}
				<FileEditorPanel
					activeConnectionId={activeConnectionId}
					activeConnectionLabel={activeConnection?.label ?? null}
					selectedFile={selectedFile}
					editorDraft={editorDraft}
					fileReadError={fileReadError}
					loadingFile={loadingFile}
					isEditing={isEditing}
					saving={saving}
					saveMsg={saveMsg}
					autoRefresh={autoRefresh}
					textSearchQuery={textSearchQuery}
					filterProblemContext={filterProblemContext}
					textSearchResult={textSearchResult}
					useLogViewer={useLogViewer}
					onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
					onForceReload={() => {
						if (activeConnectionId && selectedFile)
							fileEditorHandle.forceReloadFile(activeConnectionId, selectedFile);
					}}
					onToggleEdit={() => setIsEditing((v) => !v)}
					onDraftChange={fileEditorHandle.handleDraftChange}
					onSave={() => {
						if (activeConnectionId && selectedFile)
							void fileEditorHandle.handleSave(
								activeConnectionId,
								selectedFile,
								editorDraft,
							);
					}}
					onSearchChange={setTextSearchQuery}
					onClearSearch={() => setTextSearchQuery('')}
					onToggleFilter={() => setFilterProblemContext((v) => !v)}
				/>
			</div>
		</div>
	);
}

export default RemoteMachineView;
