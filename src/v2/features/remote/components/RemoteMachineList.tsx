'use client';

import { Button } from '@/v2/components/ui/Button';
import { Badge } from '@/v2/components/ui/Badge';
import { Led } from '@/v2/components/ui/Led';
import {
	IconChevronRight,
	IconEdit,
	IconKey,
	IconLink,
	IconMonitor,
	IconPower,
	IconServer,
	IconShield,
	IconTerminal,
	IconTrash,
} from '@/v2/components/ui/icons';
import type { HyperVVirtualMachine, RemoteConnection } from '../domain/types';
import { profileLabel } from '../domain/profileDomain';
import {
	isVmRunning,
	pickVmHost,
	vmCredentialKey,
	vmIdentity,
	vmPowerAction,
} from '../domain/vmDomain';
import type { RemoteMachineHandle } from '../application/useRemoteMachine';

interface RemoteMachineListProps {
	rm: RemoteMachineHandle;
}

/** Inventory of saved host profiles + live SSH connections with Hyper-V VM control. */
export function RemoteMachineList({ rm }: RemoteMachineListProps) {
	const connectedHostProfileIds = new Set(
		rm.connections.filter((c) => c.kind === 'host').map((c) => c.parentProfileId),
	);
	const offlineProfiles = rm.profiles.filter((p) => !connectedHostProfileIds.has(p.id));
	const hostConnections = rm.connections.filter((c) => c.kind === 'host');

	return (
		<div className="v2-stack-4 v2-fill v2-scroll-y" style={{ maxHeight: 360 }}>
			{/* Live connections */}
			{hostConnections.map((conn) => (
				<HostConnectionRow key={conn.id} rm={rm} conn={conn} />
			))}

			{/* Saved (offline) profiles */}
			{offlineProfiles.map((profile) => {
				const busy = rm.connectingProfileId === profile.id;
				return (
					<div key={profile.id} className="v2-surface-block v2-row v2-between v2-wrap v2-gap-3">
						<div className="v2-row v2-gap-3">
							<span className="v2-sidebar__logo" aria-hidden>
								<IconServer width={18} height={18} />
							</span>
							<div className="v2-col">
								<span style={{ fontWeight: 600 }}>{profileLabel(profile)}</span>
								<span className="v2-mono v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
									{profile.username}@{profile.host}:{profile.port}
								</span>
							</div>
						</div>
						<div className="v2-row v2-gap-2 v2-wrap">
							<Button
								size="sm"
								variant="primary"
								onClick={() => void rm.handleConnectProfile(profile)}
								disabled={busy}
							>
								<IconTerminal width={14} height={14} /> {busy ? '连接中…' : 'SSH'}
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => rm.handleOpenRdpProfile(profile)}
								disabled={rm.rdpOpeningTarget === `profile:${profile.id}`}
							>
								<IconMonitor width={14} height={14} /> RDP
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => rm.runWinRmProfile(profile)}
								disabled={rm.winrm.winRmBusyTargetKey === `profile:${profile.id}`}
							>
								<IconShield width={14} height={14} /> WinRM
							</Button>
							<Button
								size="sm"
								variant="ghost"
								iconOnly
								aria-label="编辑"
								onClick={() => rm.openEditProfileForm(profile)}
							>
								<IconEdit width={14} height={14} />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								iconOnly
								aria-label="删除"
								onClick={() => void rm.handleDeleteProfile(profile)}
							>
								<IconTrash width={14} height={14} />
							</Button>
						</div>
					</div>
				);
			})}

			{offlineProfiles.length === 0 && hostConnections.length === 0 && (
				<div className="v2-empty">尚未保存任何机器。点击「新增机器」或「导入 JSON」开始。</div>
			)}
		</div>
	);
}

function HostConnectionRow({ rm, conn }: { rm: RemoteMachineHandle; conn: RemoteConnection }) {
	const isActive = rm.activeConnectionId === conn.id;
	const vms = rm.connectionHypervVms[conn.id] ?? [];
	const expanded = rm.hypervExpanded[conn.id] ?? false;
	const vmConnections = rm.connections.filter((c) => c.kind === 'vm' && c.parentConnectionId === conn.id);

	return (
		<div className={`v2-conn ${isActive ? 'v2-conn--active' : ''}`}>
			<div className="v2-row v2-between v2-wrap v2-gap-3">
				<button type="button" className="v2-conn__head" onClick={() => rm.setActiveConnectionId(conn.id)}>
					<Led tone="ssh" />
					<div className="v2-col">
						<span style={{ fontWeight: 600 }}>{conn.label || conn.host}</span>
						<span className="v2-mono v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
							{conn.username}@{conn.host}:{conn.port}
						</span>
					</div>
				</button>
				<div className="v2-row v2-gap-2 v2-wrap">
					<Badge tone="success" dot>
						已连接
					</Badge>
					{vms.length > 0 && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() => rm.setHypervExpanded((prev) => ({ ...prev, [conn.id]: !expanded }))}
						>
							<IconChevronRight
								width={14}
								height={14}
								style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
							/>
							VM · {vms.length}
						</Button>
					)}
					<Button size="sm" variant="ghost" iconOnly aria-label="断开" onClick={() => void rm.disconnectById(conn.id)}>
						<IconPower width={15} height={15} />
					</Button>
				</div>
			</div>

			{expanded && vms.length > 0 && (
				<div className="v2-vm-list">
					{vms.map((vm) => (
						<VmRow key={vmIdentity(vm)} rm={rm} conn={conn} vm={vm} vmConnected={vmConnections} />
					))}
				</div>
			)}
		</div>
	);
}

function VmRow({
	rm,
	conn,
	vm,
	vmConnected,
}: {
	rm: RemoteMachineHandle;
	conn: RemoteConnection;
	vm: HyperVVirtualMachine;
	vmConnected: RemoteConnection[];
}) {
	const key = vmCredentialKey(conn, vm);
	const running = isVmRunning(vm);
	const powerBusy = rm.vmPowerBusyKey === `${conn.id}:${vmIdentity(vm)}:power`;
	const action = vmPowerAction(vm);
	const ip = pickVmHost(vm);
	const activeVm = vmConnected.find((c) => c.vmId === vmIdentity(vm));

	return (
		<div className="v2-vm-row">
			<div className="v2-row v2-gap-2">
				<Led tone={running ? 'ssh' : 'idle'} />
				<div className="v2-col">
					<span style={{ fontWeight: 500, fontSize: 'var(--v2-text-sm)' }}>{vm.name}</span>
					<span className="v2-mono v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
						{vm.state}
						{ip ? ` · ${ip}` : ''}
					</span>
				</div>
			</div>
			<div className="v2-row v2-gap-2 v2-wrap">
				<Button
					size="sm"
					variant="ghost"
					onClick={() => rm.handleToggleVmPower(conn, vm)}
					disabled={powerBusy}
				>
					<IconPower width={13} height={13} /> {action === 'start' ? '启动' : '关机'}
				</Button>
				{activeVm ? (
					<Button size="sm" variant="ghost" iconOnly aria-label="断开 VM" onClick={() => void rm.disconnectById(activeVm.id)}>
						<IconLink width={13} height={13} />
					</Button>
				) : (
					<Button
						size="sm"
						variant="outline"
						onClick={() => void rm.handleConnectVm(conn, vm)}
						disabled={!running || rm.connectingVmKey === key}
					>
						<IconTerminal width={13} height={13} /> SSH
					</Button>
				)}
				<Button size="sm" variant="ghost" onClick={() => rm.handleOpenRdpVm(conn, vm)} disabled={!running}>
					<IconMonitor width={13} height={13} /> RDP
				</Button>
				<Button size="sm" variant="ghost" iconOnly aria-label="编辑 VM 凭据" onClick={() => rm.openVmCredentialForm(conn, vm)}>
					<IconKey width={13} height={13} />
				</Button>
			</div>
		</div>
	);
}
