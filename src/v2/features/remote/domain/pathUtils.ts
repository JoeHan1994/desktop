/** SFTP ↔ Windows path conversion utilities. */

/** Converts SFTP path (/C:/...) to a readable Windows path (C:\...). */
export function sftpToDisplay(path: string): string {
	return path.replace(/^\/([A-Za-z]):\//, '$1:\\').replace(/\//g, '\\');
}

/** Extracts drive letter display name (C:) from an SFTP disk root (/C:/). */
export function diskLabel(sftpDisk: string): string {
	const m = sftpDisk.match(/^\/([A-Za-z]):\//);
	return m ? `${m[1].toUpperCase()}:` : sftpDisk;
}

/** Returns the parent directory of an SFTP path (keeping the /C:/ disk root). */
export function sftpParentPath(path: string): string {
	const trimmed = path.replace(/\/+$/, '');
	if (/^\/[A-Za-z]:$/.test(trimmed)) return `${trimmed}/`;
	const lastSlash = trimmed.lastIndexOf('/');
	if (lastSlash <= 0) return path;
	const parent = trimmed.slice(0, lastSlash);
	return /^\/[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}
