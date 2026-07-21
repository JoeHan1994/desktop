'use client';

import { useMemo, useRef } from 'react';
import { BentoCard, BentoGrid } from '../ui/Bento';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { TerminalWindow, type TerminalLine } from '../ui/Terminal';
import { IconPlus, IconShield, IconSpark, IconTerminal, IconUpload } from '../ui/icons';
import { useRemoteMachine } from '@/v2/features/remote/application/useRemoteMachine';
import { RemoteMachineList } from '@/v2/features/remote/components/RemoteMachineList';
import { RemoteFileBrowser } from '@/v2/features/remote/components/RemoteFileBrowser';
import { RemoteProfileModal } from '@/v2/features/remote/components/RemoteProfileModal';
import { RemoteAnalysisModal } from '@/v2/features/remote/components/RemoteAnalysisModal';
import { sftpToDisplay } from '@/v2/features/remote/domain/pathUtils';

const WINRM_TONE: Record<string, TerminalLine['stream']> = {
	stdout: 'out',
	stderr: 'err',
	error: 'err',
	status: 'sys',
};

/** 远程机器管理（V2）：从 V1 迁移的完整功能 —— SSH/RDP、Hyper-V、文件编辑、日志分析。 */
export function RemoteMachineModule() {
	const rm = useRemoteMachine();
	const importInputRef = useRef<HTMLInputElement | null>(null);

	const winRmLines = useMemo<TerminalLine[]>(
		() =>
			rm.winrm.winRmTerminalLines.map((l) => ({
				id: l.id,
				text: l.text,
				stream: WINRM_TONE[l.stream] ?? 'sys',
			})),
		[rm.winrm.winRmTerminalLines],
	);

	const sshLines = useMemo<TerminalLine[]>(
		() =>
			rm.sshTerminalHistory.map((e) => ({
				id: e.id,
				text: e.text,
				stream: e.type === 'input' ? 'prompt' : e.type === 'error' ? 'err' : 'out',
			})),
		[rm.sshTerminalHistory],
	);

	const winRmStatusTone =
		rm.winrm.winRmTerminalStatus === 'error'
			? 'danger'
			: rm.winrm.winRmTerminalStatus === 'running'
				? 'warning'
				: rm.winrm.winRmTerminalStatus === 'done'
					? 'success'
					: 'neutral';

	return (
		<div className="v2-module">
			<header className="v2-module__head">
				<div>
					<h1 className="v2-module__title">远程机器管理</h1>
					<p className="v2-module__desc">SSH / RDP · Hyper-V 虚拟机 · 远程文件编辑 · 日志智能分析</p>
				</div>
				<div className="v2-toolbar">
					<input
						ref={importInputRef}
						type="file"
						accept="application/json,.json"
						hidden
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = '';
							if (file) void rm.handleImportFile(file);
						}}
					/>
					<Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={rm.importingProfiles}>
						<IconUpload width={16} height={16} /> 导入 JSON
					</Button>
					<Button variant="primary" onClick={rm.openNewProfileForm}>
						<IconPlus width={16} height={16} /> 新增机器
					</Button>
				</div>
			</header>

			{(rm.importNotice || rm.importError) && (
				<div className={`v2-alert ${rm.importError ? 'v2-alert--danger' : 'v2-alert--success'}`}>
					{rm.importError || rm.importNotice}
				</div>
			)}

			<BentoGrid>
				{/* 机器清单 */}
				<BentoCard span="2x2" label="机器清单 · 连接管理">
					{rm.connError && (
						<div className="v2-alert v2-alert--danger" style={{ marginBottom: 'var(--v2-space-3)' }}>
							{rm.connError}
						</div>
					)}
					<RemoteMachineList rm={rm} />
				</BentoCard>

				{/* WinRM OpenSSH 部署终端 */}
				<BentoCard
					span="2x2"
					label="WinRM · OpenSSH 部署"
					action={
						<Badge tone={winRmStatusTone} dot>
							{rm.winrm.winRmTerminalStatus}
						</Badge>
					}
				>
					<div className="v2-col v2-gap-3 v2-fill">
						<p className="v2-row v2-gap-2 v2-text-subtle" style={{ fontSize: 'var(--v2-text-sm)' }}>
							<IconShield width={14} height={14} /> 通过 WinRM 在目标 Windows 主机上自动安装并启用 OpenSSH 服务端。
						</p>
						{rm.winrm.winRmError && <div className="v2-alert v2-alert--danger">{rm.winrm.winRmError}</div>}
						<TerminalWindow
							title="winrm-openssh-setup"
							lines={winRmLines}
							placeholder="在机器清单中点击某台机器的「WinRM」按钮以开始部署…"
						/>
					</div>
				</BentoCard>

				{/* 远程文件浏览器 / 编辑器 */}
				<BentoCard
					span="4x1"
					label={`远程文件系统${rm.activeConnection ? ` · ${rm.activeConnection.label || rm.activeConnection.host}` : ''}`}
				>
					<RemoteFileBrowser rm={rm} />
				</BentoCard>

				{/* SSH 交互终端 */}
				<BentoCard
					span="4x1"
					label="SSH 命令终端"
					action={
						rm.sshTerminalCwd ? (
							<span className="v2-mono v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
								{sftpToDisplay(rm.sshTerminalCwd)}
							</span>
						) : undefined
					}
				>
					{!rm.activeConnectionId ? (
						<div className="v2-empty">连接一台机器后即可执行远程命令。</div>
					) : (
						<div className="v2-col v2-gap-3">
							<TerminalWindow
								title={rm.activeConnection?.label || 'ssh'}
								lines={sshLines}
								placeholder="输入命令并回车执行，例如 dir / ipconfig / systeminfo…"
							/>
							<form
								className="v2-term-input"
								onSubmit={(e) => {
									e.preventDefault();
									void rm.execSshCommand();
								}}
							>
								<span className="v2-term-input__prompt" aria-hidden>
									<IconTerminal width={15} height={15} />
								</span>
								<input
									className="v2-input v2-fill"
									value={rm.sshTerminalInput}
									placeholder="远程命令…"
									spellCheck={false}
									onChange={(e) => rm.setSshTerminalInput(e.target.value)}
									aria-label="SSH 命令输入"
								/>
								<Button type="submit" variant="primary" size="sm" disabled={rm.sshTerminalRunning}>
									{rm.sshTerminalRunning ? '执行中…' : '执行'}
								</Button>
							</form>
						</div>
					)}
				</BentoCard>
			</BentoGrid>

			{/* 最小化的分析任务恢复条 */}
			{rm.analysis.analysisOpen && rm.analysis.analysisMinimized && (
				<button type="button" className="v2-analysis-pill" onClick={() => rm.analysis.restoreModal()}>
					<IconSpark width={15} height={15} />
					日志分析{rm.analysis.isAnalyzing ? '进行中…' : '结果'} · {rm.analysis.analysisResults.length}
				</button>
			)}

			<RemoteProfileModal rm={rm} />
			<RemoteAnalysisModal rm={rm} />
		</div>
	);
}
