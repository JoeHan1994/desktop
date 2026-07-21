import type {
	HyperVVmCredentialProfile,
	RemoteMachineImportResult,
	RemoteMachineProfile,
} from './types';

// ── Constants ──────────────────────────────────────────────────────────────

export const MAX_REMOTE_PROFILES = 12;
export const MAX_VM_CREDENTIALS = 80;
export const DEFAULT_RDP_PORT = '3389';
export const DEFAULT_WINRM_PORT = 5985;
export const PROFILE_REFRESH_INTERVAL_MS = 5000;
export const HYPERV_REFRESH_INTERVAL_MS = 8000;
export const VM_START_IP_REFRESH_ATTEMPTS = 6;
export const VM_START_IP_REFRESH_DELAY_MS = 1200;

// ── Port normalization ─────────────────────────────────────────────────────

export function normalizePort(portValue: string): string {
	return portValue.trim() || '22';
}

export function normalizeRdpPort(portValue: string | undefined): string {
	return String(portValue ?? '').trim() || DEFAULT_RDP_PORT;
}

// ── Profile identity & labels ──────────────────────────────────────────────

export function profileId(
	hostValue: string,
	portValue: string,
	usernameValue: string,
): string {
	return `${usernameValue.trim().toLowerCase()}@${hostValue.trim().toLowerCase()}:${normalizePort(portValue)}`;
}

export function profileLabel(
	profile: Pick<RemoteMachineProfile, 'host' | 'port' | 'username' | 'label'>,
): string {
	return (
		profile.label.trim() ||
		`${profile.username}@${profile.host}:${normalizePort(profile.port)}`
	);
}

function hostIdentity(hostValue: string): string {
	return hostValue.trim().toLowerCase();
}

// ── Conflict detection ─────────────────────────────────────────────────────

export function findHostConflict(
	profiles: RemoteMachineProfile[],
	nextProfile: RemoteMachineProfile,
	previousProfileId?: string | null,
): RemoteMachineProfile | undefined {
	const nextHost = hostIdentity(nextProfile.host);
	if (!nextHost) return undefined;
	const allowedIds = new Set(
		[nextProfile.id, previousProfileId ?? ''].filter((id): id is string => Boolean(id)),
	);
	return profiles.find(
		(profile) => hostIdentity(profile.host) === nextHost && !allowedIds.has(profile.id),
	);
}

export function hostConflictMessage(profile: RemoteMachineProfile): string {
	return `已存在这台宿主机：${profileLabel(profile)}（${profile.host}:${normalizePort(profile.port)} / ${profile.username}）`;
}

// ── Profile construction ───────────────────────────────────────────────────

export function buildProfile(
	hostValue: string,
	portValue: string,
	rdpPortValue: string,
	usernameValue: string,
	passwordValue: string,
	existing?: RemoteMachineProfile,
	labelValue?: string,
): RemoteMachineProfile {
	const normalizedPort = normalizePort(portValue);
	const profile: RemoteMachineProfile = {
		id: profileId(hostValue, normalizedPort, usernameValue),
		label: labelValue?.trim() || existing?.label || '',
		host: hostValue.trim(),
		port: normalizedPort,
		rdpPort: normalizeRdpPort(rdpPortValue || existing?.rdpPort),
		username: usernameValue.trim(),
		password: passwordValue,
		lastConnectedAt: new Date().toISOString(),
	};
	return { ...profile, label: profileLabel(profile) };
}

export function normalizeProfiles(items: RemoteMachineProfile[]): RemoteMachineProfile[] {
	return items
		.map((item) => {
			const hostValue = String(item.host ?? '').trim();
			const usernameValue = String(item.username ?? '').trim();
			const portValue = normalizePort(String(item.port ?? '22'));
			const rdpPortValue = normalizeRdpPort(
				item.rdpPort === undefined ? undefined : String(item.rdpPort),
			);
			if (!hostValue || !usernameValue) return null;
			const profile: RemoteMachineProfile = {
				id: String(item.id ?? profileId(hostValue, portValue, usernameValue)),
				label: String(item.label ?? ''),
				host: hostValue,
				port: portValue,
				rdpPort: rdpPortValue,
				username: usernameValue,
				password: String(item.password ?? ''),
				lastConnectedAt: String(item.lastConnectedAt ?? ''),
			};
			return { ...profile, label: profileLabel(profile) };
		})
		.filter((item): item is RemoteMachineProfile => item !== null)
		.slice(0, MAX_REMOTE_PROFILES);
}

// ── VM credential normalization ────────────────────────────────────────────

export function normalizeVmCredentialList(
	items: HyperVVmCredentialProfile[],
): HyperVVmCredentialProfile[] {
	return items
		.map((item) => {
			const id = String(item.id ?? '').trim();
			const parentProfileIdValue = String(item.parentProfileId ?? '').trim();
			const vmIdValue = String(item.vmId ?? '').trim();
			const usernameValue = String(item.username ?? '').trim();
			if (!id || !parentProfileIdValue || !vmIdValue || !usernameValue) return null;
			return {
				id,
				label:
					String(item.label ?? '').trim() || String(item.vmName ?? vmIdValue),
				host: String(item.host ?? '').trim(),
				port: normalizePort(String(item.port ?? '22')),
				username: usernameValue,
				password: String(item.password ?? ''),
				parentProfileId: parentProfileIdValue,
				vmId: vmIdValue,
				vmName: String(item.vmName ?? vmIdValue),
				lastConnectedAt: String(item.lastConnectedAt ?? ''),
			};
		})
		.filter((item): item is HyperVVmCredentialProfile => item !== null)
		.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt))
		.slice(0, MAX_VM_CREDENTIALS);
}

export function vmCredentialMap(
	items: HyperVVmCredentialProfile[],
): Record<string, HyperVVmCredentialProfile> {
	return Object.fromEntries(
		normalizeVmCredentialList(items).map((credential) => [credential.id, credential]),
	);
}

// ── Import parsing ─────────────────────────────────────────────────────────

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyImportValue(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number') return String(value);
	return '';
}

function getImportProfileItems(payload: unknown): unknown[] {
	if (Array.isArray(payload)) return payload;
	if (isObjectRecord(payload)) {
		const wrappedItems = [payload.profiles, payload.machines, payload.remoteMachines].find(
			Array.isArray,
		);
		if (wrappedItems) return wrappedItems;
		if (Array.isArray(payload.hypervVmCredentials) || Array.isArray(payload.vmCredentials))
			return [];
	}
	throw new Error(
		'导入文件必须是机器数组，或包含 profiles / machines / hypervVmCredentials 数组。',
	);
}

function getImportVmCredentialItems(payload: unknown): unknown[] {
	if (!isObjectRecord(payload)) return [];
	const wrappedItems = [payload.hypervVmCredentials, payload.vmCredentials].find(Array.isArray);
	return wrappedItems ?? [];
}

export function parseRemoteMachineImportPayload(payload: unknown): RemoteMachineImportResult {
	const items = getImportProfileItems(payload);
	const vmItems = getImportVmCredentialItems(payload);
	let skipped = 0;
	const profiles: RemoteMachineProfile[] = [];
	const vmCredentials: HyperVVmCredentialProfile[] = [];

	for (const item of items) {
		if (!isObjectRecord(item)) {
			skipped += 1;
			continue;
		}
		const hostValue = stringifyImportValue(item.host).trim();
		const usernameValue = stringifyImportValue(item.username).trim();
		if (!hostValue || !usernameValue) {
			skipped += 1;
			continue;
		}
		const portValue = normalizePort(stringifyImportValue(item.port));
		const rdpPortValue = normalizeRdpPort(
			item.rdpPort === undefined ? undefined : stringifyImportValue(item.rdpPort),
		);
		const passwordValue = stringifyImportValue(item.password);
		const labelValue =
			stringifyImportValue(item.label) || stringifyImportValue(item.name);
		profiles.push(
			buildProfile(
				hostValue,
				portValue,
				rdpPortValue,
				usernameValue,
				passwordValue,
				undefined,
				labelValue,
			),
		);
	}

	for (const item of vmItems) {
		if (!isObjectRecord(item)) {
			skipped += 1;
			continue;
		}
		const parentProfileIdValue = stringifyImportValue(item.parentProfileId).trim();
		const vmNameValue = stringifyImportValue(item.vmName).trim();
		const vmIdValue = stringifyImportValue(item.vmId).trim() || vmNameValue;
		const usernameValue = stringifyImportValue(item.username).trim();
		if (!parentProfileIdValue || !vmIdValue || !usernameValue) {
			skipped += 1;
			continue;
		}
		const idValue =
			stringifyImportValue(item.id).trim() || `${parentProfileIdValue}:${vmIdValue}`;
		vmCredentials.push({
			id: idValue,
			label: vmNameValue,
			host: stringifyImportValue(item.host).trim(),
			port: normalizePort(stringifyImportValue(item.port)),
			username: usernameValue,
			password: stringifyImportValue(item.password),
			parentProfileId: parentProfileIdValue,
			vmId: vmIdValue,
			vmName: vmNameValue || vmIdValue,
			lastConnectedAt:
				stringifyImportValue(item.lastConnectedAt).trim() || new Date().toISOString(),
		});
	}

	const normalizedProfiles = normalizeProfiles(profiles);
	const normalizedVmCredentials = normalizeVmCredentialList(vmCredentials);
	return {
		profiles: normalizedProfiles,
		vmCredentials: normalizedVmCredentials,
		skipped:
			skipped +
			Math.max(0, profiles.length - normalizedProfiles.length) +
			Math.max(0, vmCredentials.length - normalizedVmCredentials.length),
	};
}
