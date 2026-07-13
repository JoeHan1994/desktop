'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AnalysisFileResult, AnalysisLanguage, TokenStats } from '../domain/types';
import { getAnalysisLanguageContent } from '../domain/logAnalysis';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import type { ModelProvider } from '@/features/models/ModelProvidersContext';
import { Icon } from '@/components/ui/Icon';

const PROVIDER_LABELS: Record<ModelProvider['provider'], { label: string; color: string }> = {
	ollama: { label: 'Ollama', color: '#34d399' },
	openai: { label: 'OpenAI', color: '#60a5fa' },
};

interface AnalysisModalProps {
	open: boolean;
	minimized: boolean;
	analysisResults: AnalysisFileResult[];
	analysisError: string;
	isAnalyzing: boolean;
	totalAnalysisStats: TokenStats | null;
	statusLabel: string;
	providers: ModelProvider[];
	selectedProvider: ModelProvider | null;
	modelPickerOpen: boolean;
	canStart: boolean;
	isCurrentlyAnalyzing: boolean;
	startTitle: string;
	onClose: () => void;
	onMinimize: () => void;
	onRestore: () => void;
	onToggleModelPicker: () => void;
	onSelectProvider: (id: string) => void;
	onStart: () => void;
	onUpdateResultLanguage: (path: string, language: AnalysisLanguage) => void;
}

export function AnalysisModal({
	open,
	minimized,
	analysisResults,
	analysisError,
	isAnalyzing,
	totalAnalysisStats,
	statusLabel,
	providers,
	selectedProvider,
	modelPickerOpen,
	canStart,
	isCurrentlyAnalyzing,
	startTitle,
	onClose,
	onMinimize,
	onRestore,
	onToggleModelPicker,
	onSelectProvider,
	onStart,
	onUpdateResultLanguage,
}: AnalysisModalProps) {
	return (
		<>
			{/* Full modal */}
			<AnimatePresence>
				{open && !minimized && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
						onMouseDown={onMinimize}
					>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 10 }}
							transition={{ duration: 0.18, ease: 'easeOut' }}
							className="glass app-popover relative flex h-[min(78vh,680px)] w-full max-w-[760px] flex-col overflow-hidden shadow-2xl"
							onMouseDown={(e) => e.stopPropagation()}
						>
							<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

							{/* Header */}
							<div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
								<div className="min-w-0">
									<div className="text-[11px] text-white/35">
										Remote File Analysis
									</div>
									<h2 className="truncate text-base font-semibold text-white/80">
										文件内容分析
									</h2>
									<div
										className="mt-1 truncate font-mono text-[11px] text-white/35"
										title={statusLabel}
									>
										{statusLabel}
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									{/* Provider picker */}
									<div className="relative">
										<button
											type="button"
											onClick={onToggleModelPicker}
											disabled={providers.length === 0}
											className="glass app-card-surface app-card-control glass-control flex h-8 min-w-[168px] max-w-[240px] items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[11px] text-white/65 disabled:cursor-not-allowed disabled:opacity-35"
											title={
												selectedProvider ? selectedProvider.model : '请先配置大模型'
											}
										>
											<span
												className="h-1.5 w-1.5 shrink-0 rounded-full"
												style={{
													backgroundColor: selectedProvider
														? PROVIDER_LABELS[selectedProvider.provider].color
														: 'rgb(255 255 255 / 0.25)',
												}}
											/>
											<span className="min-w-0 flex-1 truncate">
												{selectedProvider
													? selectedProvider.name
													: '选择大模型'}
											</span>
											<span className="shrink-0 text-white/30">▾</span>
										</button>

										<AnimatePresence>
											{modelPickerOpen && providers.length > 0 && (
												<motion.div
													initial={{ opacity: 0, y: -4 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: -4 }}
													className="glass app-popover absolute right-0 top-full z-20 mt-2 max-h-64 w-72 overflow-y-auto rounded-xl p-1.5 shadow-2xl"
												>
													{providers.map((provider) => {
														const meta = PROVIDER_LABELS[provider.provider];
														const selected =
															selectedProvider?.id === provider.id;
														return (
															<button
																key={provider.id}
																type="button"
																onClick={() => {
																	onSelectProvider(provider.id);
																}}
																className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
																	selected
																		? 'bg-white/[0.08] text-white'
																		: 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
																}`}
															>
																<span
																	className="h-2 w-2 shrink-0 rounded-full"
																	style={{ backgroundColor: meta.color }}
																/>
																<span className="min-w-0 flex-1">
																	<span className="block truncate text-[12px] font-medium">
																		{provider.name}
																	</span>
																	<span className="block truncate text-[10px] text-white/30">
																		{provider.model}
																	</span>
																</span>
																<span
																	className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px]"
																	style={{ color: meta.color }}
																>
																	{meta.label}
																</span>
															</button>
														);
													})}
												</motion.div>
											)}
										</AnimatePresence>
									</div>

									{/* Start / Stop */}
									<button
										type="button"
										onClick={onStart}
										disabled={!isCurrentlyAnalyzing && !canStart}
										title={startTitle}
										className="h-8 rounded-lg px-3 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-35"
										style={{
											background: isCurrentlyAnalyzing
												? 'rgb(244 63 94 / 0.16)'
												: 'rgb(var(--accent-rgb) / 0.14)',
											border: isCurrentlyAnalyzing
												? '1px solid rgb(244 63 94 / 0.35)'
												: '1px solid rgb(var(--accent-rgb) / 0.3)',
										}}
									>
										{isCurrentlyAnalyzing ? 'Stop' : 'Start'}
									</button>
								</div>
							</div>

							{/* Body */}
							<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
								{providers.length === 0 ? (
									<EmptyProviders />
								) : analysisError ? (
									<div className="rounded-xl bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-300">
										{analysisError}
									</div>
								) : analysisResults.length > 0 ? (
									<div className="space-y-3">
										{analysisResults.map((result) => (
											<AnalysisResultCard
												key={result.path}
												result={result}
												onUpdateLanguage={(language) =>
													onUpdateResultLanguage(result.path, language)
												}
											/>
										))}
									</div>
								) : (
									<EmptyAnalysis />
								)}

								{isAnalyzing && (
									<div className="mt-3 flex items-center gap-2 text-[11px] text-white/35">
										<Icon
											name="loader"
											className="h-3.5 w-3.5 animate-spin"
											aria-hidden="true"
										/>
										{analysisResults.length > 1
											? '多文件并行分析中…'
											: '分析中…'}
									</div>
								)}
							</div>

							{/* Stats footer */}
							{totalAnalysisStats && (
								<div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.05] px-4 py-2 text-[10px] text-white/30">
									<span>
										Input{' '}
										{totalAnalysisStats.promptTokens.toLocaleString()}
									</span>
									<span>
										Output{' '}
										{totalAnalysisStats.completionTokens.toLocaleString()}
									</span>
									<span>
										{totalAnalysisStats.outputTps.toFixed(1)} tok/s
									</span>
								</div>
							)}
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Minimized pill */}
			<AnimatePresence>
				{open && minimized && (
					<motion.button
						type="button"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={{ duration: 0.18, ease: 'easeOut' }}
						onClick={onRestore}
						className="glass app-popover fixed bottom-4 right-16 z-50 flex max-w-[min(360px,calc(100vw-6rem))] items-center gap-2 rounded-xl px-3 py-2 text-left shadow-2xl transition-colors hover:bg-white/[0.08]"
						title="恢复文件内容分析窗口"
					>
						{isAnalyzing ? (
							<Icon
								name="loader"
								className="h-4 w-4 shrink-0 animate-spin text-white/45"
								aria-hidden="true"
							/>
						) : (
							<Icon
								name="chat"
								className="h-4 w-4 shrink-0 text-white/35"
								aria-hidden="true"
							/>
						)}
						<span className="min-w-0 flex-1">
							<span className="block text-[12px] font-medium text-white/70">
								{isAnalyzing
									? '文件分析中'
									: analysisError
										? '分析出错'
										: analysisResults.length > 0
											? '分析结果'
											: '文件内容分析'}
							</span>
							<span className="block truncate font-mono text-[10px] text-white/35">
								{statusLabel}
							</span>
						</span>
					</motion.button>
				)}
			</AnimatePresence>
		</>
	);
}

// ── Sub-components ────────────────────────────────────────────────────────

function EmptyProviders() {
	return (
		<div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-center text-white/30">
			<Icon name="chat" className="h-8 w-8 text-white/20" aria-hidden="true" />
			<div className="text-sm text-white/45">暂无可用大模型</div>
			<div className="max-w-sm text-[11px] leading-relaxed text-white/25">
				请先在设置页面添加 Model Provider，然后回到这里选择模型进行分析。
			</div>
		</div>
	);
}

function EmptyAnalysis() {
	return (
		<div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-center text-white/30">
			<Icon name="chat" className="h-8 w-8 text-white/20" aria-hidden="true" />
			<div className="text-sm text-white/45">点击 Start 开始分析文件</div>
			<div className="max-w-md text-[11px] leading-relaxed text-white/25">
				勾选多个文件时，每个文件会作为独立分析任务并行执行。
			</div>
		</div>
	);
}

function AnalysisResultCard({
	result,
	onUpdateLanguage,
}: {
	result: AnalysisFileResult;
	onUpdateLanguage: (language: AnalysisLanguage) => void;
}) {
	const active = result.status === 'pending' || result.status === 'running';
	const languageContent = getAnalysisLanguageContent(result.output, result.language);
	const statusText =
		result.status === 'pending'
			? '等待中'
			: result.status === 'running'
				? '分析中'
				: result.status === 'done'
					? '完成'
					: result.status === 'aborted'
						? '已停止'
						: '失败';
	const statusClass =
		result.status === 'error'
			? 'bg-rose-500/10 text-rose-300'
			: active
				? 'bg-sky-400/10 text-sky-200'
				: 'bg-emerald-400/10 text-emerald-200';

	return (
		<div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]">
			<div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
				{active && (
					<Icon
						name="loader"
						className="h-3.5 w-3.5 shrink-0 animate-spin text-white/35"
						aria-hidden="true"
					/>
				)}
				<span
					className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/45"
					title={result.displayPath}
				>
					{result.displayPath}
				</span>
				<div className="flex shrink-0 overflow-hidden rounded-md bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
					{(['en', 'ch'] as AnalysisLanguage[]).map((language) => (
						<button
							key={language}
							type="button"
							onClick={() => onUpdateLanguage(language)}
							className={`h-5 min-w-8 rounded px-1.5 text-[10px] font-medium transition-colors ${
								result.language === language
									? 'bg-white/[0.1] text-white/80'
									: 'text-white/35 hover:text-white/65'
							}`}
						>
							{language === 'en' ? 'EN' : 'CH'}
						</button>
					))}
				</div>
				{result.isFilteredLog && (
					<span className="shrink-0 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-200">
						CMTrace
					</span>
				)}
				<span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${statusClass}`}>
					{statusText}
				</span>
			</div>
			<div className="select-text px-3.5 py-3">
				{result.error ? (
					<div className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-300">
						{result.error}
					</div>
				) : result.output ? (
					languageContent.content ? (
						<MarkdownContent content={languageContent.content} />
					) : (
						<div className="py-6 text-center text-[12px] text-white/30">
							{result.status === 'done'
								? `模型未返回 ${result.language === 'en' ? 'EN' : 'CH'} 结果`
								: `${result.language === 'en' ? 'EN' : 'CH'} 结果生成中…`}
						</div>
					)
				) : (
					<div className="py-6 text-center text-[12px] text-white/30">
						{result.statusDetail}
					</div>
				)}
			</div>
		</div>
	);
}
