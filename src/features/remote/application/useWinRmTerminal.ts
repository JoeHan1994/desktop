'use client';

import { useEffect, useRef, useState } from 'react';
import type { WinRmOpenSshSetupTarget, WinRmTerminalLine, WinRmTerminalStatus } from '../domain/types';
import { DEFAULT_WINRM_PORT, normalizePort } from '../domain/profileDomain';
import {
	subscribeWinRmOpenSshSetupOutput,
	winRmRunOpenSshSetup,
} from '@/services/tauriBridge';

export function useWinRmTerminal() {
	const [winRmTerminalOpen, setWinRmTerminalOpen] = useState(false);
	const [winRmTerminalStatus, setWinRmTerminalStatus] = useState<WinRmTerminalStatus>('idle');
	const [winRmTerminalLines, setWinRmTerminalLines] = useState<WinRmTerminalLine[]>([]);
	const [winRmRunId, setWinRmRunId] = useState<string | null>(null);
	const [winRmBusyTargetKey, setWinRmBusyTargetKey] = useState<string | null>(null);
	const [winRmError, setWinRmError] = useState('');

	const winRmRunIdRef = useRef<string | null>(null);
	const terminalScrollRef = useRef<HTMLDivElement | null>(null);

	// Keep ref in sync with state for use inside event callbacks
	useEffect(() => {
		winRmRunIdRef.current = winRmRunId;
	}, [winRmRunId]);

	// Subscribe to WinRM output events
	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | null = null;

		void subscribeWinRmOpenSshSetupOutput((payload) => {
			if (payload.runId !== winRmRunIdRef.current) return;

			const text = payload.line || payload.error || '';
			if (text) {
				setWinRmTerminalLines((current) =>
					[
						...current,
						{
							id: `${payload.runId}:${current.length}:${Date.now()}`,
							stream: payload.stream,
							text,
						},
					].slice(-500),
				);
			}

			if (payload.done) {
				const failed =
					!!payload.error ||
					payload.stream === 'error' ||
					(payload.exitCode ?? 0) !== 0;
				setWinRmTerminalStatus(failed ? 'error' : 'done');
				setWinRmBusyTargetKey(null);
			}
		})
			.then((dispose) => {
				if (cancelled) dispose();
				else unlisten = dispose;
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			if (unlisten) unlisten();
		};
	}, []);

	// Auto-scroll terminal
	useEffect(() => {
		if (!winRmTerminalOpen) return;
		terminalScrollRef.current?.scrollTo({
			top: terminalScrollRef.current.scrollHeight,
		});
	}, [winRmTerminalLines, winRmTerminalOpen]);

	// ── Operations ────────────────────────────────────────────────────────────

	function appendLine(stream: WinRmTerminalLine['stream'], text: string) {
		setWinRmTerminalLines((current) =>
			[
				...current,
				{ id: `local:${current.length}:${Date.now()}`, stream, text },
			].slice(-500),
		);
	}

	async function runOpenSshSetup(target: WinRmOpenSshSetupTarget): Promise<void> {
		if (winRmBusyTargetKey) return;

		const hostValue = target.host.trim();
		const usernameValue = target.username?.trim() ?? '';
		const passwordValue = target.password ?? '';
		const sshPortValue = Number(normalizePort(target.sshPort ?? '22'));

		if (!hostValue || !usernameValue || !passwordValue) {
			setWinRmError('通过 WinRM 执行 SSH 配置需要保存目标主机、账号和密码。');
			setWinRmTerminalOpen(true);
			setWinRmTerminalStatus('error');
			setWinRmTerminalLines([
				{
					id: `local:error:${Date.now()}`,
					stream: 'error',
					text: '[local] Missing host, username, or saved password for WinRM execution.',
				},
			]);
			return;
		}

		const runId = `open-ssh:${target.key}:${Date.now()}`;
		setWinRmRunId(runId);
		winRmRunIdRef.current = runId;
		setWinRmBusyTargetKey(target.key);
		setWinRmTerminalOpen(true);
		setWinRmTerminalStatus('running');
		setWinRmTerminalLines([
			{ id: `local:start:${Date.now()}`, stream: 'status', text: `[local] Run ${runId}` },
			{
				id: `local:target:${Date.now()}`,
				stream: 'status',
				text: `[local] Target ${target.label} (${usernameValue}@${hostValue}) via WinRM ${DEFAULT_WINRM_PORT}; SSH port ${sshPortValue}`,
			},
		]);
		setWinRmError('');

		try {
			await winRmRunOpenSshSetup({
				runId,
				host: hostValue,
				winrmPort: DEFAULT_WINRM_PORT,
				username: usernameValue,
				password: passwordValue,
				sshPort: sshPortValue,
				firewallProfile: 'Any',
				setNetworkPrivate: true,
				enablePasswordAuthentication: true,
			});
		} catch (err: unknown) {
			const message = String(err);
			appendLine('error', `[local] ${message}`);
			setWinRmError(message);
			setWinRmTerminalStatus('error');
			setWinRmBusyTargetKey(null);
		}
	}

	return {
		winRmTerminalOpen,
		setWinRmTerminalOpen,
		winRmTerminalStatus,
		winRmTerminalLines,
		winRmBusyTargetKey,
		winRmError,
		terminalScrollRef,
		runOpenSshSetup,
	};
}

export type WinRmTerminalHandle = ReturnType<typeof useWinRmTerminal>;
