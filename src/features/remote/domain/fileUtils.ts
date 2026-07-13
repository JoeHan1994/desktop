import type { FileEntry, TreeNode } from './types';

/** Converts raw file entries from SFTP into tree nodes with expansion state. */
export function buildNodes(entries: FileEntry[]): TreeNode[] {
	return entries.map((e) => ({
		...e,
		children: e.is_dir ? null : [],
		expanded: false,
	}));
}

export function formatSize(bytes: number | null): string {
	if (bytes === null || bytes === 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Deep-updates the node at `targetPath` using `updater`. */
export function updateNode(
	nodes: TreeNode[],
	targetPath: string,
	updater: (n: TreeNode) => TreeNode,
): TreeNode[] {
	return nodes.map((n) => {
		if (n.path === targetPath) return updater(n);
		if (n.children && n.children.length > 0) {
			return { ...n, children: updateNode(n.children, targetPath, updater) };
		}
		return n;
	});
}

/** Recursively collects {path → size} for all file nodes. */
export function collectTreeFileSizes(nodes: TreeNode[], target: Map<string, number | null>): void {
	for (const node of nodes) {
		if (!node.is_dir) target.set(node.path, node.size);
		if (node.children) collectTreeFileSizes(node.children, target);
	}
}

/** Maps a file extension to a representative emoji icon. */
export function getFileIcon(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	const map: Record<string, string> = {
		txt: '📝', log: '📋', md: '📄', json: '📋', xml: '📋', yaml: '📋', yml: '📋',
		js: '🟨', ts: '🟦', jsx: '🟨', tsx: '🟦', css: '🎨', html: '🌐',
		py: '🐍', rs: '🦀', go: '🐹', java: '☕', cs: '💠', cpp: '⚙️', c: '⚙️',
		exe: '⚙️', dll: '🔧', bat: '📜', ps1: '📜', cmd: '📜',
		zip: '📦', rar: '📦', gz: '📦', tar: '📦',
		png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', ico: '🖼️',
		mp4: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵',
		pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
		ini: '⚙️', cfg: '⚙️', conf: '⚙️', env: '⚙️',
	};
	return map[ext] ?? '📄';
}
