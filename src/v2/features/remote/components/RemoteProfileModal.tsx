'use client';

import { Button } from '@/v2/components/ui/Button';
import { Modal } from '@/v2/components/ui/Modal';
import { SecretInput } from '@/v2/components/ui/SecretInput';
import { IconRefresh } from '@/v2/components/ui/icons';
import type { RemoteMachineHandle } from '../application/useRemoteMachine';

interface RemoteProfileModalProps {
	rm: RemoteMachineHandle;
}

/** Neumorphic modal for creating/editing a host profile or a Hyper-V VM credential. */
export function RemoteProfileModal({ rm }: RemoteProfileModalProps) {
	const isVmForm = !!rm.pendingVmConnection;
	const isBusy = rm.connStatus === 'connecting';

	const title = isVmForm
		? `Hyper-V VM 凭据 · ${rm.pendingVmConnection?.vm.name ?? ''}`
		: rm.editingProfileId
			? '编辑机器'
			: '新增机器';

	return (
		<Modal
			open={rm.configOpen}
			onClose={rm.closeConfigForm}
			ariaLabel={isVmForm ? '编辑 VM 凭据' : '机器连接配置'}
			title={title}
			description={isVmForm ? '保存 VM 的 SSH 账号后即可直连或发起 RDP。' : 'SSH / RDP 连接凭据保存在本地数据库。'}
			bodyClassName="v2-stack-3"
			footer={
				<>
					<Button variant="ghost" onClick={rm.closeConfigForm}>
						取消
					</Button>
					<Button variant="outline" onClick={() => void rm.saveProfileFromForm()} disabled={isBusy}>
						仅保存
					</Button>
					<Button variant="primary" onClick={() => void rm.handleConnectFromForm()} disabled={isBusy}>
						{isBusy ? '连接中…' : '保存并连接'}
					</Button>
				</>
			}
		>
			<label className="v2-field">
				<span className="v2-label">显示名称</span>
				<input
					className="v2-input"
					value={rm.profileName}
					placeholder={isVmForm ? rm.pendingVmConnection?.vm.name : '例如 prod-us-east-01'}
					onChange={(e) => rm.setProfileName(e.target.value)}
				/>
			</label>

			<div className="v2-row v2-gap-3 v2-wrap">
				<label className="v2-field v2-fill">
					<span className="v2-label">主机 / IP</span>
					<div className="v2-row v2-gap-2">
						<input
							className="v2-input v2-fill"
							value={rm.host}
							placeholder="192.168.1.10"
							onChange={(e) => rm.setHost(e.target.value)}
						/>
						{isVmForm && rm.pendingVmConnection && (
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									void rm.fetchVmIp(
										rm.pendingVmConnection!.parentConnection,
										rm.pendingVmConnection!.vm,
									)
								}
								disabled={rm.fetchingVmIpKey === rm.pendingVmConnection.credentialKey}
							>
								<IconRefresh width={14} height={14} /> 获取 IP
							</Button>
						)}
					</div>
				</label>
				<label className="v2-field" style={{ maxWidth: 120 }}>
					<span className="v2-label">SSH 端口</span>
					<input
						className="v2-input"
						value={rm.port}
						placeholder="22"
						onChange={(e) => rm.setPort(e.target.value)}
					/>
				</label>
				{!isVmForm && (
					<label className="v2-field" style={{ maxWidth: 120 }}>
						<span className="v2-label">RDP 端口</span>
						<input
							className="v2-input"
							value={rm.rdpPort}
							placeholder="3389"
							onChange={(e) => rm.setRdpPort(e.target.value)}
						/>
					</label>
				)}
			</div>

			<label className="v2-field">
				<span className="v2-label">用户名</span>
				<input
					className="v2-input"
					value={rm.username}
					placeholder="administrator"
					onChange={(e) => rm.setUsername(e.target.value)}
				/>
			</label>

			<SecretInput label="密码" value={rm.password} onChange={rm.setPassword} placeholder="••••••••" />

			{rm.connError && <div className="v2-alert v2-alert--danger">{rm.connError}</div>}
		</Modal>
	);
}
