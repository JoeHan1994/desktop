'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TreeNode } from '../domain/types';
import { formatSize, getFileIcon } from '../domain/fileUtils';
import { diskLabel } from '../domain/pathUtils';
import { Icon } from '@/components/ui/Icon';

// ── TreeItem ───────────────────────────────────────────────────────────────

interface TreeItemProps {
	node: TreeNode;
	depth: number;
	selected: string | null;
	analysisSelected: Set<string>;
	onSelect: (node: TreeNode) => void;
	onToggle: (node: TreeNode) => void;
	onToggleAnalysis: (node: TreeNode) => void;
}

export function TreeItem({
	node,
	depth,
	selected,
	analysisSelected,
	onSelect,
	onToggle,
	onToggleAnalysis,
}: TreeItemProps) {
	const isSelected = selected === node.path;
	const isAnalysisSelected = analysisSelected.has(node.path);

	return (
		<>
			<button
				type="button"
				onClick={() => (node.is_dir ? onToggle(node) : onSelect(node))}
				title={node.path}
				className={`flex w-full items-center gap-1.5 rounded-lg py-[3px] text-left text-[12px] transition-colors
          ${isSelected ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'}`}
				style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: 8 }}
			>
				<span className="w-3 shrink-0 text-center text-[10px] text-white/25">
					{node.is_dir ? (node.expanded ? '▾' : '▸') : ''}
				</span>

				{node.is_dir ? (
					<span className="w-3 shrink-0" />
				) : (
					<span
						role="checkbox"
						aria-checked={isAnalysisSelected}
						tabIndex={0}
						title={isAnalysisSelected ? '取消加入 Analyze 队列' : '加入 Analyze 队列'}
						onClick={(e) => {
							e.stopPropagation();
							onToggleAnalysis(node);
						}}
						onKeyDown={(e) => {
							if (e.key !== ' ' && e.key !== 'Enter') return;
							e.preventDefault();
							e.stopPropagation();
							onToggleAnalysis(node);
						}}
						className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] ring-1 transition-colors ${
							isAnalysisSelected
								? 'bg-emerald-400/20 text-emerald-200 ring-emerald-300/45'
								: 'bg-white/[0.03] text-transparent ring-white/[0.12] hover:bg-white/[0.06] hover:ring-white/[0.2]'
						}`}
					>
						<Icon name="check" className="h-2.5 w-2.5" aria-hidden="true" />
					</span>
				)}

				<span className="shrink-0 text-[11px] leading-none">
					{node.is_dir ? (node.expanded ? '📂' : '📁') : getFileIcon(node.name)}
				</span>

				<span className="min-w-0 flex-1 truncate">{node.name}</span>

				{!node.is_dir && (
					<span className="shrink-0 text-[10px] text-white/20">
						{formatSize(node.size)}
					</span>
				)}
			</button>

			<AnimatePresence initial={false}>
				{node.is_dir && node.expanded && node.children && (
					<motion.div
						key="ch"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.18, ease: 'easeInOut' }}
						className="overflow-hidden"
					>
						{node.children.length === 0 ? (
							<span
								className="block text-[11px] text-white/20 py-0.5"
								style={{
									paddingLeft: `${10 + (depth + 1) * 14 + 18}px`,
								}}
							>
								空目录
							</span>
						) : (
							node.children.map((child) => (
								<TreeItem
									key={child.path}
									node={child}
									depth={depth + 1}
									selected={selected}
									analysisSelected={analysisSelected}
									onSelect={onSelect}
									onToggle={onToggle}
									onToggleAnalysis={onToggleAnalysis}
								/>
							))
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}

// ── DiskTree ───────────────────────────────────────────────────────────────

interface DiskTreeProps {
	connectionId: string;
	diskRoots: string[];
	trees: Record<string, TreeNode[]>;
	diskExpanded: Record<string, boolean>;
	selectedFile: string | null;
	analysisSelected: Set<string>;
	onDiskToggle: (disk: string) => void;
	onNodeSelect: (node: TreeNode) => void;
	onNodeToggle: (node: TreeNode) => void;
	onNodeToggleAnalysis: (node: TreeNode) => void;
}

export function DiskTree({
	diskRoots,
	trees,
	diskExpanded,
	selectedFile,
	analysisSelected,
	onDiskToggle,
	onNodeSelect,
	onNodeToggle,
	onNodeToggleAnalysis,
}: DiskTreeProps) {
	return (
		<>
			{diskRoots.map((disk) => {
				const expanded = diskExpanded[disk] ?? true;
				return (
					<div key={disk} className="mb-1">
						<button
							type="button"
							onClick={() => onDiskToggle(disk)}
							className="mb-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white/80"
						>
							<span className="w-3 text-center text-[10px] text-white/25">
								{expanded ? '▾' : '▸'}
							</span>
							<span className="text-[13px]">💾</span>
							<span className="min-w-0 flex-1 truncate text-[11px] font-bold">
								{diskLabel(disk)}
							</span>
						</button>
						<AnimatePresence initial={false}>
							{expanded && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: 'auto', opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.18, ease: 'easeInOut' }}
									className="overflow-hidden"
								>
									{(trees[disk] ?? []).map((node) => (
										<TreeItem
											key={node.path}
											node={node}
											depth={0}
											selected={selectedFile}
											analysisSelected={analysisSelected}
											onSelect={onNodeSelect}
											onToggle={onNodeToggle}
											onToggleAnalysis={onNodeToggleAnalysis}
										/>
									))}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				);
			})}
		</>
	);
}
