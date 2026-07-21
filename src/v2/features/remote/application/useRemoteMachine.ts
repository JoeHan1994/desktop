'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModelProviders } from '@/v2/features/models/ModelProvidersContext';
import { sshExecCommand } from '@/v2/services/tauriBridge';
import type {
	HyperVVirtualMachine,
	HyperVVmCredentialProfile,
	PendingVmConnection,
	RemoteConnection,
	RemoteMachineProfile,
	WinRmOpenSshSetupTarget,
} from '../domain/types';
import {
	DEFAULT_RDP_PORT,
	buildProfile,
	findHostConflict,
	hostConflictMessage,
	normalizePort,
	normalizeRdpPort,
	profileLabel,
} from '../domain/profileDomain';
import {
	buildPendingVm,
	isCredentialForVm,
	parentCredentialScope,
	pickVmHost,
	vmCredentialKey,
	vmIdentity,
	vmPowerAction,
} from '../domain/vmDomain';
import { sftpParentPath } from '../domain/pathUtils';
import { collectTreeFileSizes } from '../domain/fileUtils';
import { useRemoteProfiles } from './useRemoteProfiles';
import { useRemoteConnections } from './useRemoteConnections';
import { useRemoteFileEditor } from './useRemoteFileEditor';
import { useWinRmTerminal } from './useWinRmTerminal';
import { useRemoteAnalysis } from './useRemoteAnalysis';

export interface SshTerminalEntry {
	id: string;
	type: 'input' | 'output' | 'error';
	text: string;
	cwd?: string;
}

/**
 * Orchestrates the full remote-machine feature by composing the five focused
 * hooks (profiles / connections / file editor / WinRM / analysis) and adding
 * the cross-cutting glue: profile & VM-credential forms, connect flows, RDP,
 * WinRM OpenSSH setup targets and an interactive SSH command terminal.
 */
export function useRemoteMachine() {
	const { providers } = useModelProviders();
	const profilesHook = useRemoteProfiles();
	const conns = useRemoteConnections();
	const editor = useRemoteFileEditor();
	const winrm = useWinRmTerminal();
	const analysis = useRemoteAnalysis();

	const {
		profiles,
		vmCredentials,
		importingProfiles,
		importNotice,
		importError,
		setImportError,
		setImportNotice,
		upsertProfile,
		deleteProfile,
		persistVmCredential,
		importFromFile,
	} = profilesHook;

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
		connectSSH,
		disconnectById,
		setActiveConnectionId,
		refreshHyperV,
		toggleVmPower,
		openRdp,
		toggleDiskRoot,
		handleTreeToggle,
		waitForVmHost,
	} = conns;

	// ── Profile / VM credential form state ─────────────────────────────────────
	const [configOpen, setConfigOpen] = useState(false);
	const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
	const [pendingVmConnection, setPendingVmConnection] = useState<PendingVmConnection | null>(null);
	const [profileName, setProfileName] = useState('');
	const [host, setHost] = useState('');
	const [port, setPort] = useState('22');
	const [rdpPort, setRdpPort] = useState(DEFAULT_RDP_PORT);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');

	// ── SSH terminal state ─────────────────────────────────────────────────────
	const [sshTerminalHistory, setSshTerminalHistory] = useState<SshTerminalEntry[]>([]);
	const [sshTerminalInput, setSshTerminalInput] = useState('');
	const [sshTerminalRunning, setSshTerminalRunning] = useState(false);
	const [sshTerminalCwd, setSshTerminalCwd] = useState<string | null>(null);

	// Keep the file editor's active-connection ref in sync + reset on switch.
	const prevActiveRef = useRef<string | null>(null);
	useEffect(() => {
		editor.setActiveConnectionIdRef(activeConnectionId);
		if (prevActiveRef.current !== activeConnectionId) {
			editor.resetEditorState(prevActiveRef.current ?? undefined);
			setSshTerminalHistory([]);
			setSshTerminalCwd(null);
			prevActiveRef.current = activeConnectionId;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeConnectionId]);

	// Keep analysis provider selection valid.
	useEffect(() => {
		analysis.syncProvider(providers);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [providers]);

	// ── Derived ────────────────────────────────────────────────────────────────
	const activeConnection = useMemo(
		() => connections.find((c) => c.id === activeConnectionId) ?? null,
		[connections, activeConnectionId],
	);

	const selectedAnalysisProvider = useMemo(
		() => providers.find((p) => p.id === analysis.analysisProviderId) ?? providers[0] ?? null,
		[providers, analysis.analysisProviderId],
	);

	const analysisSelectedSet = useMemo(
		() => new Set(editor.analysisSelectedFiles),
		[editor.analysisSelectedFiles],
	);

	const analysisTargetPaths = useMemo(
		() =>
			editor.analysisSelectedFiles.length > 0
				? editor.analysisSelectedFiles
				: editor.selectedFile
					? [editor.selectedFile]
					: [],
		[editor.analysisSelectedFiles, editor.selectedFile],
	);

	const sizeByPath = useMemo(() => {
		const map = new Map<string, number | null>();
		if (activeConnectionId) {
			const trees = connectionTrees[activeConnectionId] ?? {};
			Object.values(trees).forEach((nodes) => collectTreeFileSizes(nodes, map));
		}
		return map;
	}, [connectionTrees, activeConnectionId]);

	// ── VM credential lookup ─────────────────────────────────────────────────
	const findVmCredential = useCallback(
		(
			parentConnection: RemoteConnection,
			vm: HyperVVirtualMachine,
			hostValue = '',
		): HyperVVmCredentialProfile | undefined => {
			const stable = vmCredentials[vmCredentialKey(parentConnection, vm)];
			if (stable) return stable;
			const candidates = Object.values(vmCredentials)
				.filter((c) => isCredentialForVm(c, parentConnection, vm))
				.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt));
			return candidates.find((c) => c.host === hostValue) ?? candidates[0];
		},
		[vmCredentials],
	);

	// ── Form helpers ───────────────────────────────────────────────────────────
	const resetProfileForm = useCallback(() => {
		setEditingProfileId(null);
		setProfileName('');
		setHost('');
		setPort('22');
		setRdpPort(DEFAULT_RDP_PORT);
		setUsername('');
		setPassword('');
		setConnError('');
		setPendingVmConnection(null);
	}, [setConnError]);

	const openNewProfileForm = useCallback(() => {
		resetProfileForm();
		setImportError('');
		setImportNotice('');
		setConfigOpen(true);
	}, [resetProfileForm, setImportError, setImportNotice]);

	const openEditProfileForm = useCallback(
		(profile: RemoteMachineProfile) => {
			setPendingVmConnection(null);
			setEditingProfileId(profile.id);
			setProfileName(profile.label);
			setHost(profile.host);
			setPort(normalizePort(profile.port));
			setRdpPort(normalizeRdpPort(profile.rdpPort));
			setUsername(profile.username);
			setPassword(profile.password);
			setConnError('');
			setConfigOpen(true);
		},
		[setConnError],
	);

	const openVmCredentialForm = useCallback(
		(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
			const hostGuess = pickVmHost(vm) ?? '';
			const pending = buildPendingVm(parentConnection, vm, hostGuess);
			const existing = findVmCredential(parentConnection, vm, hostGuess);
			setPendingVmConnection(pending);
			setEditingProfileId(null);
			setProfileName(existing?.label ?? vm.name);
			setHost(existing?.host ?? hostGuess);
			setPort(existing ? normalizePort(existing.port) : '22');
			setRdpPort(DEFAULT_RDP_PORT);
			setUsername(existing?.username ?? '');
			setPassword(existing?.password ?? '');
			setConnError('');
			setConfigOpen(true);
		},
		[findVmCredential, setConnError],
	);

	const closeConfigForm = useCallback(() => {
		setConfigOpen(false);
		setPendingVmConnection(null);
		setEditingProfileId(null);
	}, []);

	const buildVmCredentialFromForm = useCallback(
		(pending: PendingVmConnection): HyperVVmCredentialProfile => ({
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
		}),
		[host, password, port, profileName, username],
	);

	const saveProfileFromForm = useCallback(async () => {
		if (pendingVmConnection) {
			if (!username.trim()) return;
			try {
				await persistVmCredential(buildVmCredentialFromForm(pendingVmConnection));
				setConnError('');
				closeConfigForm();
			} catch (err: unknown) {
				setConnError(String(err));
			}
			return;
		}
		if (!host.trim() || !username.trim()) return;
		const nextProfile = buildProfile(host, port, rdpPort, username, password, undefined, profileName);
		const conflict = findHostConflict(profiles, nextProfile, editingProfileId);
		if (conflict) {
			setConnError(hostConflictMessage(conflict));
			return;
		}
		try {
			await upsertProfile(nextProfile, editingProfileId);
			setConnError('');
			closeConfigForm();
		} catch (err: unknown) {
			setConnError(String(err));
		}
	}, [
		buildVmCredentialFromForm,
		closeConfigForm,
		editingProfileId,
		host,
		password,
		pendingVmConnection,
		port,
		profileName,
		profiles,
		persistVmCredential,
		rdpPort,
		setConnError,
		upsertProfile,
		username,
	]);

	const handleDeleteProfile = useCallback(
		async (profile: RemoteMachineProfile) => {
			try {
				await deleteProfile(profile.id);
				const conn = connections.find(
					(c) => c.kind === 'host' && c.parentProfileId === profile.id,
				);
				if (conn) await disconnectById(conn.id);
			} catch (err: unknown) {
				setConnError(String(err));
			}
		},
		[connections, deleteProfile, disconnectById, setConnError],
	);

	const handleImportFile = useCallback(
		async (file: File) => {
			await importFromFile(file);
		},
		[importFromFile],
	);

	// ── Connect flows ──────────────────────────────────────────────────────────
	const handleConnectProfile = useCallback(
		async (profile: RemoteMachineProfile) => {
			const conflict = findHostConflict(profiles, profile, profile.id);
			if (conflict) {
				setConnError(hostConflictMessage(conflict));
				return;
			}
			const connection = await connectSSH(
				{
					host: profile.host.trim(),
					port: Number(normalizePort(profile.port)),
					username: profile.username.trim(),
					password: profile.password,
					label: profileLabel(profile),
					kind: 'host',
					parentProfileId: profile.id,
				},
				profile.id,
				null,
			);
			if (connection) {
				await upsertProfile(profile, profile.id).catch(() => {});
			}
		},
		[connectSSH, profiles, setConnError, upsertProfile],
	);

	const connectPendingVm = useCallback(
		async (pending: PendingVmConnection) => {
			const connection = await connectSSH(
				{
					host: pending.host.trim(),
					port: Number(normalizePort(port)),
					username: username.trim(),
					password,
					label: profileName.trim() || pending.vm.name,
					kind: 'vm',
					parentConnectionId: pending.parentConnection.id,
					parentProfileId: parentCredentialScope(pending.parentConnection),
					vmId: vmIdentity(pending.vm),
				},
				null,
				pending.credentialKey,
			);
			if (connection) {
				await persistVmCredential(buildVmCredentialFromForm(pending)).catch(() => {});
				closeConfigForm();
			}
		},
		[
			buildVmCredentialFromForm,
			closeConfigForm,
			connectSSH,
			password,
			persistVmCredential,
			port,
			profileName,
			username,
		],
	);

	const handleConnectFromForm = useCallback(async () => {
		if (pendingVmConnection) {
			if (!username.trim()) return;
			await connectPendingVm(pendingVmConnection);
			return;
		}
		if (!host.trim() || !username.trim()) return;
		const nextProfile = buildProfile(host, port, rdpPort, username, password, undefined, profileName);
		const conflict = findHostConflict(profiles, nextProfile, editingProfileId);
		if (conflict) {
			setConnError(hostConflictMessage(conflict));
			return;
		}
		const connection = await connectSSH(
			{
				host: host.trim(),
				port: Number(normalizePort(port)),
				username: username.trim(),
				password,
				label: profileLabel(nextProfile),
				kind: 'host',
				parentProfileId: nextProfile.id,
			},
			nextProfile.id,
			null,
		);
		if (connection) {
			await upsertProfile(nextProfile, editingProfileId).catch(() => {});
			closeConfigForm();
		}
	}, [
		closeConfigForm,
		connectPendingVm,
		connectSSH,
		editingProfileId,
		host,
		password,
		pendingVmConnection,
		port,
		profileName,
		profiles,
		rdpPort,
		setConnError,
		upsertProfile,
		username,
	]);

	const handleConnectVm = useCallback(
		async (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
			const credential = findVmCredential(parentConnection, vm);
			const hostGuess = pickVmHost(vm) ?? credential?.host ?? '';
			if (!credential || !credential.username || !hostGuess) {
				openVmCredentialForm(parentConnection, vm);
				return;
			}
			await connectSSH(
				{
					host: (credential.host || hostGuess).trim(),
					port: Number(normalizePort(credential.port)),
					username: credential.username.trim(),
					password: credential.password,
					label: credential.label || vm.name,
					kind: 'vm',
					parentConnectionId: parentConnection.id,
					parentProfileId: parentCredentialScope(parentConnection),
					vmId: vmIdentity(vm),
				},
				null,
				vmCredentialKey(parentConnection, vm),
			);
		},
		[connectSSH, findVmCredential, openVmCredentialForm],
	);

	// ── RDP ──────────────────────────────────────────────────────────────────
	const handleOpenRdpProfile = useCallback(
		(profile: RemoteMachineProfile) => {
			void openRdp(profile.host, normalizeRdpPort(profile.rdpPort), `profile:${profile.id}`, {
				username: profile.username,
				password: profile.password,
			});
		},
		[openRdp],
	);

	const handleOpenRdpVm = useCallback(
		(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
			const credential = findVmCredential(parentConnection, vm);
			const hostValue = pickVmHost(vm) ?? credential?.host ?? '';
			if (!hostValue) {
				setConnError('该 VM 尚未获取到可用 IP，无法发起 RDP。');
				return;
			}
			void openRdp(hostValue, DEFAULT_RDP_PORT, `vm-rdp:${vmCredentialKey(parentConnection, vm)}`, {
				username: credential?.username,
				password: credential?.password,
			});
		},
		[findVmCredential, openRdp, setConnError],
	);

	// ── WinRM OpenSSH setup ────────────────────────────────────────────────────
	const runWinRmProfile = useCallback(
		(profile: RemoteMachineProfile) => {
			const target: WinRmOpenSshSetupTarget = {
				key: `profile:${profile.id}`,
				label: profileLabel(profile),
				host: profile.host,
				username: profile.username,
				password: profile.password,
				sshPort: normalizePort(profile.port),
			};
			void winrm.runOpenSshSetup(target);
		},
		[winrm],
	);

	const runWinRmVm = useCallback(
		(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
			const credential = findVmCredential(parentConnection, vm);
			const hostValue = pickVmHost(vm) ?? credential?.host ?? '';
			const target: WinRmOpenSshSetupTarget = {
				key: `vm:${vmCredentialKey(parentConnection, vm)}`,
				label: credential?.label || vm.name,
				host: hostValue,
				username: credential?.username,
				password: credential?.password,
				sshPort: credential ? normalizePort(credential.port) : '22',
			};
			void winrm.runOpenSshSetup(target);
		},
		[findVmCredential, winrm],
	);

	// ── VM power ───────────────────────────────────────────────────────────────
	const handleToggleVmPower = useCallback(
		(parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
			void toggleVmPower(parentConnection, vm, vmPowerAction(vm));
		},
		[toggleVmPower],
	);

	const fetchVmIp = useCallback(
		async (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
			const key = vmCredentialKey(parentConnection, vm);
			setFetchingVmIpKey(key);
			try {
				const resolved = await waitForVmHost(parentConnection, vm);
				if (resolved) {
					setHost(resolved.host);
					if (pendingVmConnection && pendingVmConnection.credentialKey === key) {
						setPendingVmConnection({ ...pendingVmConnection, host: resolved.host });
					}
				} else {
					setConnError('多次刷新后仍未获取到 VM 的可用 IP，请确认 VM 已启动并安装集成服务。');
				}
			} finally {
				setFetchingVmIpKey(null);
			}
		},
		[pendingVmConnection, setConnError, setFetchingVmIpKey, waitForVmHost],
	);

	// ── SSH interactive terminal ─────────────────────────────────────────────
	const execSshCommand = useCallback(async () => {
		const cmd = sshTerminalInput.trim();
		if (!cmd || !activeConnectionId || sshTerminalRunning) return;
		setSshTerminalInput('');
		setSshTerminalHistory((prev) => [
			...prev,
			{ id: `${Date.now()}-in`, type: 'input', text: cmd, cwd: sshTerminalCwd ?? undefined },
		]);
		setSshTerminalRunning(true);
		try {
			const cdMatch = cmd.match(/^\s*cd(?:\s+\/d)?\s+(.+)/i);
			const pushdMatch = cmd.match(/^\s*pushd\s+(.+)/i);
			const isBareCd = /^\s*cd\s*$/i.test(cmd);
			const isDriveLetter = /^\s*[A-Za-z]:\s*$/i.test(cmd);
			const navMatch = cdMatch || pushdMatch;
			if (navMatch || isBareCd || isDriveLetter) {
				const cdTarget = navMatch
					? navMatch[1].replace(/^["']|["']$/g, '').trim()
					: isDriveLetter
						? cmd.trim()
						: '';
				let verifyCmd: string;
				if (!cdTarget) verifyCmd = 'cd';
				else if (/^[A-Za-z]:$/.test(cdTarget)) verifyCmd = `cd /d ${cdTarget}\\ && cd`;
				else verifyCmd = `cd /d "${cdTarget}" && cd`;
				const resolved = await sshExecCommand(activeConnectionId, verifyCmd, sshTerminalCwd ?? undefined);
				const newCwd = resolved.trim().split('\n').pop()?.trim();
				if (newCwd) {
					setSshTerminalCwd('/' + newCwd.replace(/\\/g, '/'));
				} else {
					setSshTerminalHistory((prev) => [
						...prev,
						{ id: `${Date.now()}-err`, type: 'error', text: resolved || '无法切换目录' },
					]);
				}
			} else {
				const output = await sshExecCommand(activeConnectionId, cmd, sshTerminalCwd ?? undefined);
				setSshTerminalHistory((prev) => [
					...prev,
					{ id: `${Date.now()}-out`, type: 'output', text: output || '(无输出)' },
				]);
			}
		} catch (err: unknown) {
			setSshTerminalHistory((prev) => [
				...prev,
				{ id: `${Date.now()}-err`, type: 'error', text: String(err) },
			]);
		} finally {
			setSshTerminalRunning(false);
		}
	}, [activeConnectionId, sshTerminalCwd, sshTerminalInput, sshTerminalRunning]);

	// ── File selection wrapper (also seeds SSH terminal cwd) ────────────────────
	const selectFile = useCallback(
		(path: string, isDir: boolean) => {
			if (isDir || !activeConnectionId) return;
			setSshTerminalCwd(sftpParentPath(path));
			editor.handleSelectFile(path, activeConnectionId);
		},
		[activeConnectionId, editor],
	);

	// ── Analysis start wrapper ─────────────────────────────────────────────────
	const startAnalysis = useCallback(async () => {
		if (!activeConnectionId || !selectedAnalysisProvider || analysisTargetPaths.length === 0) return;
		analysis.openModal();
		await analysis.startAnalysis({
			targetPaths: analysisTargetPaths,
			connectionId: activeConnectionId,
			provider: selectedAnalysisProvider,
			sizeByPath,
			selectedFile: editor.selectedFile,
			fileReadError: editor.fileReadError,
			editorDraft: editor.editorDraft,
			isCurrentlyAnalyzing: analysis.isAnalyzing,
		});
	}, [
		activeConnectionId,
		analysis,
		analysisTargetPaths,
		editor.editorDraft,
		editor.fileReadError,
		editor.selectedFile,
		selectedAnalysisProvider,
		sizeByPath,
	]);

	return {
		// providers
		providers,
		selectedAnalysisProvider,
		// profiles
		profiles,
		vmCredentials,
		importingProfiles,
		importNotice,
		importError,
		handleImportFile,
		handleDeleteProfile,
		// connections
		connections,
		activeConnection,
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
		rdpOpeningTarget,
		setActiveConnectionId,
		disconnectById,
		toggleDiskRoot,
		handleTreeToggle,
		refreshHyperV,
		// connect flows
		handleConnectProfile,
		handleConnectVm,
		handleConnectFromForm,
		handleOpenRdpProfile,
		handleOpenRdpVm,
		handleToggleVmPower,
		fetchVmIp,
		// winrm
		winrm,
		runWinRmProfile,
		runWinRmVm,
		// form
		configOpen,
		editingProfileId,
		pendingVmConnection,
		profileName,
		host,
		port,
		rdpPort,
		username,
		password,
		setProfileName,
		setHost,
		setPort,
		setRdpPort,
		setUsername,
		setPassword,
		openNewProfileForm,
		openEditProfileForm,
		openVmCredentialForm,
		closeConfigForm,
		saveProfileFromForm,
		// file editor
		editor,
		selectFile,
		analysisSelectedSet,
		// ssh terminal
		sshTerminalHistory,
		sshTerminalInput,
		sshTerminalRunning,
		sshTerminalCwd,
		setSshTerminalInput,
		execSshCommand,
		// analysis
		analysis,
		analysisTargetPaths,
		startAnalysis,
	};
}

export type RemoteMachineHandle = ReturnType<typeof useRemoteMachine>;
