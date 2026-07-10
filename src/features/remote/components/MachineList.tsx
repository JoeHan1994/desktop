'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
	HyperVVirtualMachine,
	RemoteConnection,
	RemoteMachineProfile,
	WinRmOpenSshSetupTarget,
} from '../domain/types';
import {
	isVmRunning,
	pickVmHost,
	vmCredentialKey,
	vmIdentity,
	vmPowerAction,
} from '../domain/vmDomain';
import { normalizePort, normalizeRdpPort, profileLabel } from '../domain/profileDomain';
import { RemoteActionButton } from './RemoteActionButton';
import type { HyperVVmCredentialProfile } from '../domain/types';

// ── Props ──────────────────────────────────────────────────────────────────

interface MachineListProps {
	profiles: RemoteMachineProfile[];
	vmCredentials: Record<string, HyperVVmCredentialProfile>;
	connections: RemoteConnection[];
	activeConnectionId: string | null;
	connectingProfileId: string | null;
	connectingVmKey: string | null;
	isConnecting: boolean;
	vmPowerBusyKey: string | null;
	rdpOpeningTarget: string | null;
	winRmBusyTargetKey: string | null;
	connectionHypervVms: Record<string, HyperVVirtualMachine[]>;
	hypervExpanded: Record<string, boolean>;
	onSwitchActive: (connectionId: string) => void;
	onConnect: (profile: RemoteMachineProfile) => void;
	onDisconnect: (connectionId: string) => void;
	onConnectVm: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onDisconnectVm: (connectionId: string) => void;
	onToggleVmPower: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onOpenRdpProfile: (profile: RemoteMachineProfile) => void;
	onOpenRdpVm: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onRunWinRmProfile: (target: WinRmOpenSshSetupTarget) => void;
	onRunWinRmVm: (target: WinRmOpenSshSetupTarget) => void;
	onEditProfile: (profile: RemoteMachineProfile) => void;
	onDeleteProfile: (profile: RemoteMachineProfile) => void;
	onEditVmCredential: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onToggleHypervExpanded: (connectionId: string) => void;
}

export function MachineList({
	profiles,
	vmCredentials,
	connections,
	activeConnectionId,
	connectingProfileId,
	connectingVmKey,
	isConnecting,
	vmPowerBusyKey,
	rdpOpeningTarget,
	winRmBusyTargetKey,
	connectionHypervVms,
	hypervExpanded,
	onSwitchActive,
	onConnect,
	onDisconnect,
	onConnectVm,
	onDisconnectVm,
	onToggleVmPower,
	onOpenRdpProfile,
	onOpenRdpVm,
	onRunWinRmProfile,
	onRunWinRmVm,
	onEditProfile,
	onDeleteProfile,
	onEditVmCredential,
	onToggleHypervExpanded,
}: MachineListProps) {
	const hostConnections = connections.filter((c) => c.kind === 'host');

	return (
		<div className="space-y-1.5">
			{profiles.length === 0 ? (
				<div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 text-center text-white/25">
					<span className="text-sm">暂无配置</span>
					<span className="text-[11px]">点击右上角 + 添加，或导入 JSON</span>
				</div>
			) : (
				profiles.map((profile) => {
					const isProfileConnecting = connectingProfileId === profile.id;
					const profileWinRmKey = `host:${profile.id}:winrm`;
					const isProfileWinRmRunning = winRmBusyTargetKey === profileWinRmKey;
					const profileRdpKey = `host:${profile.id}`;
					const isProfileRdpOpening = rdpOpeningTarget === profileRdpKey;
					const hostConnection =
						hostConnections.find((c) => c.parentProfileId === profile.id) ?? null;
					const hostActive = activeConnectionId === hostConnection?.id;
					const hostVms = hostConnection
						? (connectionHypervVms[hostConnection.id] ?? [])
						: [];
					const vmsExpanded = hostConnection
						? (hypervExpanded[hostConnection.id] ?? true)
						: false;

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
										if (hostConnection)
											onSwitchActive(hostConnection.id);
									}}
									disabled={!hostConnection}
									className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default ${
										hostActive ? 'bg-white/10 text-white' : 'text-white/65'
									}`}
								>
									<span className="block truncate text-[12px] font-medium">
										{profileLabel(profile)}
									</span>
								</button>
								<RemoteActionButton
									icon={isProfileRdpOpening ? 'loader' : 'monitor'}
									label={isProfileRdpOpening ? 'Opening RDP' : 'Open RDP'}
									spinning={isProfileRdpOpening}
									onClick={() => onOpenRdpProfile(profile)}
									disabled={
										!profile.host.trim() ||
										(!!rdpOpeningTarget && !isProfileRdpOpening)
									}
								/>
								<RemoteActionButton
									icon={isProfileWinRmRunning ? 'loader' : 'gear'}
									label={
										isProfileWinRmRunning
											? 'Running SSH setup via WinRM'
											: 'Run SSH setup via WinRM'
									}
									spinning={isProfileWinRmRunning}
									onClick={() =>
										onRunWinRmProfile({
											key: profileWinRmKey,
											label: profileLabel(profile),
											host: profile.host,
											username: profile.username,
											password: profile.password,
											sshPort: profile.port,
										})
									}
									disabled={
										!!winRmBusyTargetKey && !isProfileWinRmRunning
									}
								/>
								<RemoteActionButton
									icon={
										hostConnection
											? 'plug-off'
											: isProfileConnecting
												? 'loader'
												: 'plug'
									}
									label={
										hostConnection
											? 'Disconnect'
											: isProfileConnecting
												? 'Connecting'
												: 'Connect'
									}
									tone={hostConnection ? 'danger' : 'default'}
									spinning={isProfileConnecting}
									onClick={() => {
										if (hostConnection)
											onDisconnect(hostConnection.id);
										else onConnect(profile);
									}}
									disabled={isConnecting && !isProfileConnecting}
								/>
								<RemoteActionButton
									icon="pencil"
									label="Edit"
									onClick={() => onEditProfile(profile)}
								/>
								<RemoteActionButton
									icon="trash"
									label="Delete"
									tone="danger"
									onClick={() => onDeleteProfile(profile)}
								/>
							</div>

							{hostConnection && hostVms.length > 0 && (
								<div className="mt-1.5">
									<button
										type="button"
										onClick={() =>
											onToggleHypervExpanded(hostConnection.id)
										}
										className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/70"
									>
										<span className="w-3 text-center text-[10px] text-white/25">
											{vmsExpanded ? '▾' : '▸'}
										</span>
										<span className="min-w-0 flex-1 truncate">
											Hyper-V · {hostVms.length} VM
										</span>
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
												{hostVms.map((vm) => (
													<VmRow
														key={vmCredentialKey(hostConnection, vm)}
														vm={vm}
														hostConnection={hostConnection}
														connections={connections}
														activeConnectionId={activeConnectionId}
														vmCredentials={vmCredentials}
														connectingVmKey={connectingVmKey}
														isConnecting={isConnecting}
														vmPowerBusyKey={vmPowerBusyKey}
														rdpOpeningTarget={rdpOpeningTarget}
														winRmBusyTargetKey={winRmBusyTargetKey}
														profiles={profiles}
														onConnectVm={onConnectVm}
														onDisconnectVm={onDisconnectVm}
														onToggleVmPower={onToggleVmPower}
														onOpenRdpVm={onOpenRdpVm}
														onRunWinRmVm={onRunWinRmVm}
														onEditVmCredential={onEditVmCredential}
													/>
												))}
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							)}
						</div>
					);
				})
			)}
		</div>
	);
}

// ── VmRow ──────────────────────────────────────────────────────────────────

interface VmRowProps {
	vm: HyperVVirtualMachine;
	hostConnection: RemoteConnection;
	connections: RemoteConnection[];
	activeConnectionId: string | null;
	vmCredentials: Record<string, HyperVVmCredentialProfile>;
	connectingVmKey: string | null;
	isConnecting: boolean;
	vmPowerBusyKey: string | null;
	rdpOpeningTarget: string | null;
	winRmBusyTargetKey: string | null;
	profiles: RemoteMachineProfile[];
	onConnectVm: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onDisconnectVm: (connectionId: string) => void;
	onToggleVmPower: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onOpenRdpVm: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
	onRunWinRmVm: (target: WinRmOpenSshSetupTarget) => void;
	onEditVmCredential: (parentConnection: RemoteConnection, vm: HyperVVirtualMachine) => void;
}

function VmRow({
	vm,
	hostConnection,
	connections,
	activeConnectionId,
	vmCredentials,
	connectingVmKey,
	isConnecting,
	vmPowerBusyKey,
	rdpOpeningTarget,
	winRmBusyTargetKey,
	profiles,
	onConnectVm,
	onDisconnectVm,
	onToggleVmPower,
	onOpenRdpVm,
	onRunWinRmVm,
	onEditVmCredential,
}: VmRowProps) {
	const vmHost = pickVmHost(vm);
	const vmKey = vmCredentialKey(hostConnection, vm);
	const vmPowerKey = `${hostConnection.id}:${vmIdentity(vm)}:power`;
	const connectedVm =
		connections.find(
			(c) =>
				c.kind === 'vm' &&
				c.parentConnectionId === hostConnection.id &&
				c.vmId === vmIdentity(vm),
		) ?? null;
	const vmActive = connectedVm?.id === activeConnectionId;
	const vmConnecting = connectingVmKey === vmKey;
	const vmPowerBusy = vmPowerBusyKey === vmPowerKey;
	const vmPowerNextAction = vmPowerAction(vm);
	const vmRdpKey = `vm:${hostConnection.id}:${vmIdentity(vm)}`;
	const isVmRdpOpening = rdpOpeningTarget === vmRdpKey;
	const vmWinRmKey = `vm:${hostConnection.id}:${vmIdentity(vm)}:winrm`;
	const isVmWinRmRunning = winRmBusyTargetKey === vmWinRmKey;
	const parentProfile = profiles.find((p) => p.id === hostConnection.parentProfileId);
	const savedVmCredential = vmCredentials[vmKey];
	const vmRdpCredential = savedVmCredential?.username ? savedVmCredential : parentProfile;
	const vmWinRmCredential = savedVmCredential?.username ? savedVmCredential : parentProfile;

	return (
		<div
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
						if (connectedVm) onConnectVm(hostConnection, vm);
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
					icon={vmPowerBusy ? 'loader' : vmPowerNextAction === 'stop' ? 'stop' : 'play'}
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
					onClick={() => onToggleVmPower(hostConnection, vm)}
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
					onClick={() => onOpenRdpVm(hostConnection, vm)}
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
						onRunWinRmVm({
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
						if (connectedVm) onDisconnectVm(connectedVm.id);
						else onConnectVm(hostConnection, vm);
					}}
					disabled={!vmHost || (isConnecting && !vmConnecting)}
				/>
				<RemoteActionButton
					icon="pencil"
					label="Edit"
					size="sm"
					onClick={() => onEditVmCredential(hostConnection, vm)}
				/>
			</div>
		</div>
	);
}
