'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
	ConnStatus,
	HyperVVirtualMachine,
	RemoteConnection,
	TreeNode,
} from '../domain/types';
import { buildNodes, updateNode } from '../domain/fileUtils';
import {
	HYPERV_REFRESH_INTERVAL_MS,
	VM_START_IP_REFRESH_ATTEMPTS,
	VM_START_IP_REFRESH_DELAY_MS,
} from '../domain/profileDomain';
import { pickVmHost, vmIdentity } from '../domain/vmDomain';
import {
	rdpOpen,
	sshConnect,
	sshDisconnect,
	sshGetDisks,
	sshListDir,
	sshListHyperVVMs,
	sshSetHyperVVMState,
} from '@/services/tauriBridge';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRemoteConnections() {
	const [connections, setConnections] = useState<RemoteConnection[]>([]);
	const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
	const [connStatus, setConnStatus] = useState<ConnStatus>('idle');
	const [connError, setConnError] = useState('');
	const [connectingProfileId, setConnectingProfileId] = useState<string | null>(null);
	const [connectingVmKey, setConnectingVmKey] = useState<string | null>(null);

	// Per-connection file-system state
	const [connectionDisks, setConnectionDisks] = useState<Record<string, string[]>>({});
	const [connectionTrees, setConnectionTrees] = useState<
		Record<string, Record<string, TreeNode[]>>
	>({});
	const [connectionDiskExpanded, setConnectionDiskExpanded] = useState<
		Record<string, Record<string, boolean>>
	>({});
	const [connectionHypervVms, setConnectionHypervVms] = useState<
		Record<string, HyperVVirtualMachine[]>
	>({});
	const [hypervExpanded, setHypervExpanded] = useState<Record<string, boolean>>({});

	// VM/RDP busy states
	const [vmPowerBusyKey, setVmPowerBusyKey] = useState<string | null>(null);
	const [fetchingVmIpKey, setFetchingVmIpKey] = useState<string | null>(null);
	const [rdpOpeningTarget, setRdpOpeningTarget] = useState<string | null>(null);

	// ── HyperV refresh ──────────────────────────────────────────────────────

	const refreshHyperV = useCallback(
		async (connectionId: string): Promise<HyperVVirtualMachine[]> => {
			const vms = await sshListHyperVVMs(connectionId).catch(() => []);
			setConnectionHypervVms((prev) => ({ ...prev, [connectionId]: vms }));
			setHypervExpanded((prev) => ({
				...prev,
				[connectionId]: prev[connectionId] ?? vms.length > 0,
			}));
			return vms;
		},
		[],
	);

	useEffect(() => {
		const hostConnections = connections.filter((c) => c.kind === 'host');
		if (hostConnections.length === 0) return;

		let cancelled = false;
		let running = false;

		const tick = async () => {
			if (cancelled || running || document.hidden) return;
			running = true;
			try {
				await Promise.all(hostConnections.map((c) => refreshHyperV(c.id)));
			} finally {
				running = false;
			}
		};

		const timer = window.setInterval(tick, HYPERV_REFRESH_INTERVAL_MS);
		void tick();

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [connections, refreshHyperV]);

	// ── File tree loading ────────────────────────────────────────────────────

	const loadConnectionFileTree = useCallback(async (connectionId: string) => {
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
	}, []);

	// ── Disconnect + cleanup ─────────────────────────────────────────────────

	/**
	 * Disconnects one or more SSH sessions and cleans up all related state.
	 * Returns the set of disconnected IDs so the caller can react (e.g. reset editor).
	 */
	const disconnectById = useCallback(
		async (connectionId: string): Promise<Set<string>> => {
			const target = connections.find((c) => c.id === connectionId);
			const idsToRemove = new Set<string>([connectionId]);
			if (target?.kind === 'host') {
				connections
					.filter((c) => c.parentConnectionId === connectionId)
					.forEach((c) => idsToRemove.add(c.id));
			}

			for (const id of idsToRemove) {
				try {
					await sshDisconnect(id);
				} catch {
					/* ignore */
				}
			}

			setConnections((prev) => prev.filter((c) => !idsToRemove.has(c.id)));
			setConnectionDisks((prev) =>
				Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToRemove.has(id))),
			);
			setConnectionTrees((prev) =>
				Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToRemove.has(id))),
			);
			setConnectionDiskExpanded((prev) =>
				Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToRemove.has(id))),
			);
			setConnectionHypervVms((prev) =>
				Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToRemove.has(id))),
			);
			setHypervExpanded((prev) =>
				Object.fromEntries(Object.entries(prev).filter(([id]) => !idsToRemove.has(id))),
			);

			setConnections((prev) => {
				const remaining = prev.filter((c) => !idsToRemove.has(c.id));
				if (remaining.length === 0) setConnStatus('idle');
				if (idsToRemove.has(activeConnectionId ?? '')) {
					setActiveConnectionId(remaining[0]?.id ?? null);
				}
				return remaining;
			});

			return idsToRemove;
		},
		[connections, activeConnectionId],
	);

	// ── Connect ──────────────────────────────────────────────────────────────

	const connectSSH = useCallback(
		async (
			params: {
				host: string;
				port: number;
				username: string;
				password: string;
				label?: string;
				kind: 'host' | 'vm';
				parentConnectionId?: string;
				parentProfileId?: string;
				vmId?: string;
			},
			profileId?: string | null,
			vmKey?: string | null,
		) => {
			setConnStatus('connecting');
			setConnError('');
			setConnectingProfileId(profileId ?? null);
			setConnectingVmKey(vmKey ?? null);
			try {
				const connection = await sshConnect(params);
				setConnections((prev) => [...prev, connection]);
				setActiveConnectionId(connection.id);
				await loadConnectionFileTree(connection.id);
				if (params.kind !== 'vm') {
					void refreshHyperV(connection.id);
				}
				setConnStatus('connected');
				return connection;
			} catch (err: unknown) {
				setConnError(String(err));
				setConnStatus('error');
				return null;
			} finally {
				setConnectingProfileId(null);
				setConnectingVmKey(null);
			}
		},
		[loadConnectionFileTree, refreshHyperV],
	);

	// ── VM power ─────────────────────────────────────────────────────────────

	const updateVmPowerState = useCallback(
		(connectionId: string, vm: HyperVVirtualMachine, state: string) => {
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
		},
		[],
	);

	const waitForVmHost = useCallback(
		async (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => {
		for (let attempt = 0; attempt < VM_START_IP_REFRESH_ATTEMPTS; attempt++) {
			const refreshedVms = await refreshHyperV(parentConnection.id);
			const refreshedVm =
				refreshedVms.find((item) => vmIdentity(item) === vmIdentity(vm)) ?? vm;
			const vmHost = pickVmHost(refreshedVm);
			if (vmHost) return { vm: refreshedVm, host: vmHost };
			if (attempt < VM_START_IP_REFRESH_ATTEMPTS - 1)
				await delay(VM_START_IP_REFRESH_DELAY_MS);
			}
			return null;
		},
		[refreshHyperV],
	);

	const toggleVmPower = useCallback(
		async (parentConnection: RemoteConnection, vm: HyperVVirtualMachine, action: 'start' | 'stop') => {
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
		},
		[refreshHyperV, updateVmPowerState],
	);

	// ── RDP ──────────────────────────────────────────────────────────────────

	const openRdp = useCallback(
		async (
			hostValue: string,
			portValue: string,
			busyKey: string,
			credential?: { username?: string; password?: string },
		) => {
			const normalizedHost = hostValue.trim();
			if (!normalizedHost || rdpOpeningTarget === busyKey) return;
			const normalizedPort = Number(portValue.trim() || '3389');
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
		},
		[rdpOpeningTarget],
	);

	// ── File tree navigation ─────────────────────────────────────────────────

	const toggleDiskRoot = useCallback(
		(connectionId: string, disk: string) => {
			setConnectionDiskExpanded((prev) => ({
				...prev,
				[connectionId]: {
					...(prev[connectionId] ?? {}),
					[disk]: !(prev[connectionId]?.[disk] ?? true),
				},
			}));
		},
		[],
	);

	const handleTreeToggle = useCallback(
		async (connectionId: string, diskRoots: string[], node: TreeNode) => {
			if (!node.is_dir) return;
			const diskRoot = diskRoots.find((d) => node.path.startsWith(d));
			if (!diskRoot) return;

			if (node.children !== null) {
				setConnectionTrees((prev) => ({
					...prev,
					[connectionId]: {
						...(prev[connectionId] ?? {}),
						[diskRoot]: updateNode(prev[connectionId]?.[diskRoot] ?? [], node.path, (n) => ({
							...n,
							expanded: !n.expanded,
						})),
					},
				}));
				return;
			}

			// First expand – load children
			try {
				const entries = await sshListDir(connectionId, node.path);
				const children = buildNodes(entries);
				setConnectionTrees((prev) => ({
					...prev,
					[connectionId]: {
						...(prev[connectionId] ?? {}),
						[diskRoot]: updateNode(prev[connectionId]?.[diskRoot] ?? [], node.path, (n) => ({
							...n,
							children,
							expanded: true,
						})),
					},
				}));
			} catch {
				setConnectionTrees((prev) => ({
					...prev,
					[connectionId]: {
						...(prev[connectionId] ?? {}),
						[diskRoot]: updateNode(prev[connectionId]?.[diskRoot] ?? [], node.path, (n) => ({
							...n,
							children: [],
							expanded: true,
						})),
					},
				}));
			}
		},
		[],
	);

	return {
		// State
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
		// Operations
		connectSSH,
		disconnectById,
		setActiveConnectionId,
		refreshHyperV,
		toggleVmPower,
		openRdp,
		toggleDiskRoot,
		handleTreeToggle,
		waitForVmHost,
	};
}

export type RemoteConnectionsHandle = ReturnType<typeof useRemoteConnections>;
