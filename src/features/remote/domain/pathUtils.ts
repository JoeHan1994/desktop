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
