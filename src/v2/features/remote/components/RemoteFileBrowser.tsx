'use client';

import { useMemo } from 'react';
import { Button } from '@/v2/components/ui/Button';
import { Switch } from '@/v2/components/ui/Toggle';
import {
	IconChevronRight,
	IconEdit,
	IconFilter,
	IconRefresh,
	IconSave,
	IconSearch,
	IconSpark,
	IconTarget,
} from '@/v2/components/ui/icons';
import type { TreeNode } from '../domain/types';
import { formatSize, getFileIcon } from '../domain/fileUtils';
import { diskLabel, sftpToDisplay } from '../domain/pathUtils';
import { buildContentSearchResult } from '../domain/logFilter';
import { renderHighlightedLine } from '../domain/logParser';
import type { RemoteMachineHandle } from '../application/useRemoteMachine';

interface RemoteFileBrowserProps {
	rm: RemoteMachineHandle;
}

/** SFTP file tree browser + inline viewer/editor with search, problem filter and analysis queue. */
export function RemoteFileBrowser({ rm }: RemoteFileBrowserProps) {
	const connectionId = rm.activeConnectionId;
	const editor = rm.editor;

	const disks = connectionId ? rm.connectionDisks[connectionId] ?? [] : [];
	const trees = connectionId ? rm.connectionTrees[connectionId] ?? {} : {};
	const diskExpanded = connectionId ? rm.connectionDiskExpanded[connectionId] ?? {} : {};

	const searchResult = useMemo(
		() => buildContentSearchResult(editor.editorDraft, editor.textSearchQuery, editor.filterProblemContext),
		[editor.editorDraft, editor.textSearchQuery, editor.filterProblemContext],
	);

	if (!connectionId) {
		return <div className="v2-empty">连接一台机器后即可浏览远程文件系统。</div>;
	}

	return (
		<div className="v2-fs">
			{/* Tree */}
			<div className="v2-fs__tree v2-scroll-y">
				{disks.length === 0 && <div className="v2-empty">正在加载磁盘…</div>}
				{disks.map((disk) => (
					<div key={disk}>
						<button type="button" className="v2-tree__row v2-tree__disk" onClick={() => rm.toggleDiskRoot(connectionId, disk)}>
							<IconChevronRight
								width={13}
								height={13}
								style={{ transform: diskExpanded[disk] ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
							/>
							{diskLabel(disk)}
						</button>
						{diskExpanded[disk] &&
							(trees[disk] ?? []).map((node) => (
								<TreeRow
									key={node.path}
									node={node}
									depth={1}
									connectionId={connectionId}
									diskRoots={disks}
									rm={rm}
								/>
							))}
					</div>
				))}
			</div>

			{/* Viewer / editor */}
			<div className="v2-fs__editor">
				{!editor.selectedFile ? (
					<div className="v2-empty">从左侧选择一个文件以查看或编辑内容。</div>
				) : (
					<>
						<div className="v2-fs__toolbar">
							<div className="v2-mono v2-text-muted v2-fs__path" title={sftpToDisplay(editor.selectedFile)}>
								{sftpToDisplay(editor.selectedFile)}
							</div>
							<div className="v2-row v2-gap-2 v2-wrap">
								<div className="v2-search v2-search--sm">
									<IconSearch width={14} height={14} />
									<input
										placeholder="查找…"
										value={editor.textSearchQuery}
										onChange={(e) => editor.setTextSearchQuery(e.target.value)}
										aria-label="在文件中查找"
									/>
								</div>
								<Button
									size="sm"
									variant={editor.filterProblemContext ? 'primary' : 'ghost'}
									onClick={() => editor.setFilterProblemContext(!editor.filterProblemContext)}
									disabled={searchResult.hasQuery}
									title="仅显示报错/警告及其上下文"
								>
									<IconFilter width={14} height={14} /> 问题
								</Button>
								<span className="v2-row v2-gap-2 v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
									<IconRefresh width={13} height={13} /> 实时
									<Switch checked={editor.autoRefresh} onChange={editor.setAutoRefresh} aria-label="自动刷新" />
								</span>
								{editor.isEditing ? (
									<Button
										size="sm"
										variant="primary"
										onClick={() => void editor.handleSave(connectionId, editor.selectedFile!, editor.editorDraft)}
										disabled={editor.saving}
									>
										<IconSave width={14} height={14} /> {editor.saving ? '保存中…' : '保存'}
									</Button>
								) : (
									<Button size="sm" variant="outline" onClick={() => editor.setIsEditing(true)} disabled={editor.fileReadError}>
										<IconEdit width={14} height={14} /> 编辑
									</Button>
								)}
								<Button
									size="sm"
									variant="ghost"
									onClick={() => void rm.startAnalysis()}
									disabled={!rm.selectedAnalysisProvider || rm.analysisTargetPaths.length === 0}
									title="使用大模型分析所选日志"
								>
									<IconSpark width={14} height={14} /> 分析
								</Button>
							</div>
						</div>

						{editor.saveMsg && <div className="v2-fs__savemsg">{editor.saveMsg}</div>}

						<div className="v2-fs__content v2-terminal">
							{editor.loadingFile ? (
								<div className="v2-terminal__body">
									<div className="v2-terminal__line" style={{ opacity: 0.5 }}>
										读取远程文件中…
									</div>
								</div>
							) : editor.isEditing ? (
								<textarea
									className="v2-fs__textarea"
									value={editor.editorDraft}
									onChange={(e) => editor.handleDraftChange(e.target.value)}
									spellCheck={false}
								/>
							) : (
								<div className="v2-terminal__body">
									{searchResult.lines.map((line) => (
										<div key={line.originalIndex} className="v2-fs__line">
											<span className="v2-fs__ln">{line.originalIndex + 1}</span>
											<span className="v2-fs__lt">
												{renderHighlightedLine(line.text, editor.textSearchQuery)}
											</span>
										</div>
									))}
									{searchResult.lines.length === 0 && (
										<div className="v2-terminal__line" style={{ opacity: 0.5 }}>
											{searchResult.hasQuery ? '没有匹配的行。' : '（空文件）'}
										</div>
									)}
								</div>
							)}
						</div>

						<div className="v2-fs__status v2-text-subtle">
							{searchResult.hasQuery
								? `匹配 ${searchResult.totalMatches} 处 · ${searchResult.matchedLineCount} 行`
								: searchResult.problemFiltered
									? `问题上下文 ${searchResult.problemContextLineCount} 行 · 共 ${searchResult.rawLineCount} 行`
									: `${searchResult.rawLineCount} 行`}
							{searchResult.clipped && ' · 已截断至最新 8000 行'}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function TreeRow({
	node,
	depth,
	connectionId,
	diskRoots,
	rm,
}: {
	node: TreeNode;
	depth: number;
	connectionId: string;
	diskRoots: string[];
	rm: RemoteMachineHandle;
}) {
	const isSelected = rm.editor.selectedFile === node.path;
	const inAnalysis = rm.analysisSelectedSet.has(node.path);

	return (
		<>
			<div className={`v2-tree__row ${isSelected ? 'v2-tree__row--active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
				{!node.is_dir && (
					<span
						role="checkbox"
						aria-checked={inAnalysis}
						tabIndex={0}
						className={`v2-tree__check ${inAnalysis ? 'v2-tree__check--on' : ''}`}
						title={inAnalysis ? '移出分析队列' : '加入分析队列'}
						onClick={(e) => {
							e.stopPropagation();
							rm.editor.handleToggleAnalysisFile(node.path, node.is_dir);
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								rm.editor.handleToggleAnalysisFile(node.path, node.is_dir);
							}
						}}
					>
						{inAnalysis && <IconTarget width={11} height={11} />}
					</span>
				)}
				<button
					type="button"
					className="v2-tree__btn"
					onClick={() =>
						node.is_dir ? void rm.handleTreeToggle(connectionId, diskRoots, node) : rm.selectFile(node.path, node.is_dir)
					}
					title={node.path}
				>
					{node.is_dir ? (
						<IconChevronRight
							width={12}
							height={12}
							style={{ transform: node.expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
						/>
					) : (
						<span className="v2-tree__ficon">{getFileIcon(node.name)}</span>
					)}
					<span className="v2-tree__name">{node.name}</span>
					{!node.is_dir && node.size != null && (
						<span className="v2-tree__size">{formatSize(node.size)}</span>
					)}
				</button>
			</div>
			{node.is_dir &&
				node.expanded &&
				(node.children ?? []).map((child) => (
					<TreeRow
						key={child.path}
						node={child}
						depth={depth + 1}
						connectionId={connectionId}
						diskRoots={diskRoots}
						rm={rm}
					/>
				))}
		</>
	);
}
