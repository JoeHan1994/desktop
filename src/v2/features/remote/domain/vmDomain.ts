import type {
	HyperVVmCredentialProfile,
	HyperVVirtualMachine,
	PendingVmConnection,
	RemoteConnection,
} from './types';
import { normalizePort } from './profileDomain';

// ── VM identity ────────────────────────────────────────────────────────────

export function vmIdentity(vm: HyperVVirtualMachine): string {
	return vm.id.trim() || vm.name.trim();
}

export function parentCredentialScope(connection: RemoteConnection): string {
	return (
		connection.parentProfileId ||
		`${connection.username}@${connection.host}:${connection.port}`
	);
}

export function vmCredentialKey(
	parentConnection: RemoteConnection,
	vm: HyperVVirtualMachine,
): string {
	return `${parentCredentialScope(parentConnection)}:${vmIdentity(vm)}`;
}

// ── IP detection ───────────────────────────────────────────────────────────

export function isUsableIpv4(value: string): boolean {
	const ip = value.trim();
	if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
	const parts = ip.split('.').map(Number);
	if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
	return !(
		ip === '0.0.0.0' ||
		ip === '127.0.0.1' ||
		ip.startsWith('169.254.') ||
		ip.startsWith('255.')
	);
}

export function pickVmHost(vm: HyperVVirtualMachine): string | null {
	return vm.ipAddresses.find(isUsableIpv4) ?? null;
}

// ── VM state ───────────────────────────────────────────────────────────────

export function isVmRunning(vm: HyperVVirtualMachine): boolean {
	return vm.state.trim().toLowerCase() === 'running';
}

export function vmPowerAction(vm: HyperVVirtualMachine): 'start' | 'stop' {
	const state = vm.state.trim().toLowerCase();
	return state === 'off' || state === 'offcritical' ? 'start' : 'stop';
}

// ── Credential matching ────────────────────────────────────────────────────

export function isCredentialForVm(
	credential: HyperVVmCredentialProfile,
	parentConnection: RemoteConnection,
	vm: HyperVVirtualMachine,
): boolean {
	return (
		credential.parentProfileId === parentCredentialScope(parentConnection) &&
		credential.vmId === vmIdentity(vm)
	);
}

export function buildPendingVm(
	parentConnection: RemoteConnection,
	vm: HyperVVirtualMachine,
	hostValue?: string,
): PendingVmConnection {
	const vmHost = hostValue ?? pickVmHost(vm) ?? '';
	const key = vmCredentialKey(parentConnection, vm);
	return { parentConnection, vm, host: vmHost, credentialKey: key };
}
