'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HyperVVmCredentialProfile, RemoteMachineProfile } from '../domain/types';
import {
	normalizeProfiles,
	parseRemoteMachineImportPayload,
	vmCredentialMap,
} from '../domain/profileDomain';
import {
	deleteHyperVVmCredentialsByParentProfileId,
	deleteRemoteMachineProfile,
	importLegacyHyperVVmCredentialProfiles,
	importLegacyRemoteMachineProfiles,
	listHyperVVmCredentialProfiles,
	listRemoteMachineProfiles,
	upsertHyperVVmCredentialProfile,
	upsertRemoteMachineProfile,
} from '@/v2/services/tauriBridge';
import { PROFILE_REFRESH_INTERVAL_MS } from '../domain/profileDomain';

export function useRemoteProfiles() {
	const [profiles, setProfiles] = useState<RemoteMachineProfile[]>([]);
	const [vmCredentials, setVmCredentials] = useState<
		Record<string, HyperVVmCredentialProfile>
	>({});
	const [importingProfiles, setImportingProfiles] = useState(false);
	const [importNotice, setImportNotice] = useState('');
	const [importError, setImportError] = useState('');

	// ── Initial load ─────────────────────────────────────────────────────────

	useEffect(() => {
		let cancelled = false;

		importLegacyRemoteMachineProfiles()
			.catch(() => listRemoteMachineProfiles())
			.then((list) => {
				if (!cancelled) setProfiles(normalizeProfiles(list));
			})
			.catch(() => {
				if (!cancelled) setProfiles([]);
			});

		importLegacyHyperVVmCredentialProfiles()
			.catch(() => listHyperVVmCredentialProfiles())
			.then((list) => {
				if (!cancelled) setVmCredentials(vmCredentialMap(list));
			})
			.catch(() => {
				if (!cancelled) setVmCredentials({});
			});

		return () => {
			cancelled = true;
		};
	}, []);

	// ── Background polling ────────────────────────────────────────────────────

	const refreshProfileData = useCallback(async () => {
		const [nextProfiles, nextCredentials] = await Promise.all([
			listRemoteMachineProfiles(),
			listHyperVVmCredentialProfiles(),
		]);
		setProfiles(normalizeProfiles(nextProfiles));
		setVmCredentials(vmCredentialMap(nextCredentials));
	}, []);

	useEffect(() => {
		let cancelled = false;
		let running = false;

		const tick = async () => {
			if (cancelled || running || document.hidden) return;
			running = true;
			try {
				await refreshProfileData();
			} catch {
				/* keep current list if backend is temporarily unavailable */
			} finally {
				running = false;
			}
		};

		const timer = window.setInterval(tick, PROFILE_REFRESH_INTERVAL_MS);
		window.addEventListener('visibilitychange', tick);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
			window.removeEventListener('visibilitychange', tick);
		};
	}, [refreshProfileData]);

	// ── CRUD operations ───────────────────────────────────────────────────────

	const upsertProfile = useCallback(
		async (
			profile: RemoteMachineProfile,
			previousProfileId?: string | null,
		): Promise<RemoteMachineProfile[]> => {
			const next = await upsertRemoteMachineProfile(profile, previousProfileId);
			const normalized = normalizeProfiles(next);
			setProfiles(normalized);
			return normalized;
		},
		[],
	);

	const deleteProfile = useCallback(
		async (id: string): Promise<{ nextProfiles: RemoteMachineProfile[]; nextCredentials: Record<string, HyperVVmCredentialProfile> }> => {
			const nextProfiles = normalizeProfiles(await deleteRemoteMachineProfile(id));
			const nextCredentialList = await deleteHyperVVmCredentialsByParentProfileId(id);
			const nextCredentials = vmCredentialMap(nextCredentialList);
			setProfiles(nextProfiles);
			setVmCredentials(nextCredentials);
			return { nextProfiles, nextCredentials };
		},
		[],
	);

	const persistVmCredential = useCallback(
		async (credential: HyperVVmCredentialProfile): Promise<void> => {
			const next = await upsertHyperVVmCredentialProfile(credential);
			setVmCredentials(vmCredentialMap(next));
		},
		[],
	);

	// ── Import from JSON file ─────────────────────────────────────────────────

	const importFromFile = useCallback(async (file: File): Promise<void> => {
		setImportingProfiles(true);
		setImportError('');
		setImportNotice('');
		try {
			const fileText = await file.text();
			const parsedPayload: unknown = JSON.parse(fileText);
			const {
				profiles: importedProfiles,
				vmCredentials: importedVmCredentials,
				skipped,
			} = parseRemoteMachineImportPayload(parsedPayload);

			if (importedProfiles.length === 0 && importedVmCredentials.length === 0) {
				setImportError(
					skipped > 0
						? `没有可导入的机器或 Hyper-V VM 凭据，已跳过 ${skipped} 条无效记录。`
						: '没有找到可导入的机器或 Hyper-V VM 凭据。',
				);
				return;
			}

			let latestProfiles: RemoteMachineProfile[] | null = null;
			for (const p of importedProfiles) {
				latestProfiles = await upsertRemoteMachineProfile(p);
			}

			let latestVmCredentials: HyperVVmCredentialProfile[] | null = null;
			for (const c of importedVmCredentials) {
				latestVmCredentials = await upsertHyperVVmCredentialProfile(c);
			}

			if (latestProfiles) setProfiles(normalizeProfiles(latestProfiles));
			if (latestVmCredentials) setVmCredentials(vmCredentialMap(latestVmCredentials));
			setImportNotice(
				`已导入 ${importedProfiles.length} 台机器、${importedVmCredentials.length} 条 Hyper-V VM 凭据${skipped > 0 ? `，跳过 ${skipped} 条无效记录` : ''}。`,
			);
		} catch (err: unknown) {
			setImportError(
				`导入失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setImportingProfiles(false);
		}
	}, []);

	return {
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
		refreshProfileData,
	};
}

export type RemoteProfilesHandle = ReturnType<typeof useRemoteProfiles>;
