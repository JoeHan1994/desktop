'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PendingVmConnection } from '../domain/types';
import { DEFAULT_RDP_PORT } from '../domain/profileDomain';
import { Icon } from '@/components/ui/Icon';

const fieldCls =
	'glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none';

interface ProfileFormModalProps {
	open: boolean;
	onClose: () => void;
	pendingVmConnection: PendingVmConnection | null;
	profileName: string;
	host: string;
	port: string;
	rdpPort: string;
	username: string;
	password: string;
	connError: string;
	isConnecting: boolean;
	isFetchingVmIp: boolean;
	onProfileNameChange: (v: string) => void;
	onHostChange: (v: string) => void;
	onPortChange: (v: string) => void;
	onRdpPortChange: (v: string) => void;
	onUsernameChange: (v: string) => void;
	onPasswordChange: (v: string) => void;
	onFetchVmIp: () => void;
	onSave: () => void;
	onConnect: () => void;
}

export function ProfileFormModal({
	open,
	onClose,
	pendingVmConnection,
	profileName,
	host,
	port,
	rdpPort,
	username,
	password,
	connError,
	isConnecting,
	isFetchingVmIp,
	onProfileNameChange,
	onHostChange,
	onPortChange,
	onRdpPortChange,
	onUsernameChange,
	onPasswordChange,
	onFetchVmIp,
	onSave,
	onConnect,
}: ProfileFormModalProps) {
	const isVmCredentialForm = !!pendingVmConnection;

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
					onMouseDown={onClose}
				>
					<motion.div
						initial={{ opacity: 0, scale: 0.96, y: 10 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.96, y: 10 }}
						transition={{ duration: 0.18, ease: 'easeOut' }}
						className="glass app-popover relative w-full max-w-[340px] overflow-hidden px-3.5 py-3.5 shadow-2xl"
						onMouseDown={(e) => e.stopPropagation()}
					>
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

						<div className="mb-3 flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="text-[11px] text-white/35">
									{pendingVmConnection ? 'Hyper-V VM' : 'Remote Machine'}
								</div>
								<h2 className="truncate text-base font-semibold text-white/80">
									{pendingVmConnection ? '虚拟机凭据' : '配置预连接'}
								</h2>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="glass glass-icon-button glass-control h-8 w-8 shrink-0 rounded-full"
								aria-label="关闭"
								title="关闭"
							>
								<Icon name="x" className="h-4 w-4" aria-hidden="true" />
							</button>
						</div>

						<div className="space-y-2.5">
							<div className="space-y-1">
								<label className="text-[11px] text-white/45">名称</label>
								<input
									className={fieldCls}
									placeholder={pendingVmConnection ? 'VM Name' : 'Lab Server'}
									value={profileName}
									onChange={(e) => onProfileNameChange(e.target.value)}
									autoFocus
								/>
							</div>

							<div
								className={`grid gap-2 ${
									isVmCredentialForm
										? 'grid-cols-[1fr_64px]'
										: 'grid-cols-[1fr_64px_72px]'
								}`}
							>
								<div className="space-y-1">
									<label className="text-[11px] text-white/45">IP / 主机名</label>
									<input
										className={`${fieldCls} ${isVmCredentialForm ? 'cursor-pointer' : ''}`}
										placeholder={
											isVmCredentialForm ? '点击获取虚拟机 IP' : '192.168.1.100'
										}
										value={host}
										readOnly={isVmCredentialForm}
										title={
											isVmCredentialForm ? '虚拟机开机后点击自动获取 IP' : undefined
										}
										onClick={() => {
											if (pendingVmConnection) onFetchVmIp();
										}}
										onChange={(e) => {
											if (!pendingVmConnection) onHostChange(e.target.value);
										}}
									/>
									{isFetchingVmIp && (
										<div className="mt-1 text-[10px] text-white/30">
											正在获取 IP…
										</div>
									)}
								</div>
								<div className="space-y-1">
									<label className="text-[11px] text-white/45">SSH</label>
									<input
										className={fieldCls}
										placeholder="22"
										value={port}
										onChange={(e) => onPortChange(e.target.value)}
									/>
								</div>
								{!isVmCredentialForm && (
									<div className="space-y-1">
										<label className="text-[11px] text-white/45">RDP</label>
										<input
											className={fieldCls}
											placeholder={DEFAULT_RDP_PORT}
											value={rdpPort}
											onChange={(e) => onRdpPortChange(e.target.value)}
										/>
									</div>
								)}
							</div>

							<div className="space-y-2.5">
								<div className="space-y-1">
									<label className="text-[11px] text-white/45">账号</label>
									<input
										className={fieldCls}
										placeholder="Administrator"
										value={username}
										onChange={(e) => onUsernameChange(e.target.value)}
										autoComplete="username"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[11px] text-white/45">密码</label>
									<input
										className={fieldCls}
										type="password"
										placeholder="••••••••"
										value={password}
										onChange={(e) => onPasswordChange(e.target.value)}
										autoComplete="current-password"
									/>
								</div>
							</div>
						</div>

						<AnimatePresence>
							{connError && (
								<motion.p
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: 'auto' }}
									exit={{ opacity: 0, height: 0 }}
									className="mt-3 overflow-hidden rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-400"
								>
									{connError}
								</motion.p>
							)}
						</AnimatePresence>

						<div className="mt-3 flex justify-end gap-2">
							<button
								type="button"
								onClick={onSave}
								disabled={
									isVmCredentialForm ? !username.trim() : !host.trim() || !username.trim()
								}
								className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/55 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
							>
								{pendingVmConnection ? '保存凭据' : 'Save'}
							</button>
							<button
								type="button"
								onClick={onConnect}
								disabled={isConnecting || !host.trim() || !username.trim()}
								className="rounded-lg px-3 py-2 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
								style={{
									background: 'rgb(var(--accent-rgb) / 0.14)',
									border: '1px solid rgb(var(--accent-rgb) / 0.3)',
								}}
							>
								{isConnecting ? '连接中' : '连接'}
							</button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
