'use client';

import { Button } from '@/v2/components/ui/Button';
import { Badge } from '@/v2/components/ui/Badge';
import { Modal } from '@/v2/components/ui/Modal';
import { Segmented } from '@/v2/components/ui/Toggle';
import { IconSpark } from '@/v2/components/ui/icons';
import type { AnalysisFileResult, AnalysisFileStatus } from '../domain/types';
import type { RemoteMachineHandle } from '../application/useRemoteMachine';

interface RemoteAnalysisModalProps {
	rm: RemoteMachineHandle;
}

const STATUS_TONE: Record<AnalysisFileStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
	done: 'success',
	running: 'warning',
	pending: 'neutral',
	error: 'danger',
	aborted: 'neutral',
};

const STATUS_LABEL: Record<AnalysisFileStatus, string> = {
	done: '完成',
	running: '分析中',
	pending: '排队',
	error: '失败',
	aborted: '已停止',
};

/** AI log-analysis results modal (streaming markdown text + per-file status). */
export function RemoteAnalysisModal({ rm }: RemoteAnalysisModalProps) {
	const analysis = rm.analysis;

	return (
		<Modal
			open={analysis.analysisOpen && !analysis.analysisMinimized}
			onClose={() => analysis.minimizeModal()}
			wide
			ariaLabel="日志分析结果"
			icon={<IconSpark width={18} height={18} />}
			title="日志智能分析"
			description={
				rm.selectedAnalysisProvider
					? `模型 · ${rm.selectedAnalysisProvider.name || rm.selectedAnalysisProvider.model}`
					: '未配置模型提供方'
			}
			bodyClassName="v2-stack-4"
			headerActions={
				<>
					<Button size="sm" variant="ghost" onClick={() => analysis.resetAnalysis()}>
						清空
					</Button>
					<Button size="sm" variant="ghost" onClick={() => analysis.minimizeModal()}>
						最小化
					</Button>
					<Button size="sm" variant="ghost" onClick={() => analysis.setAnalysisOpen(false)}>
						关闭
					</Button>
				</>
			}
			showClose={false}
		>
			{analysis.analysisError && <div className="v2-alert v2-alert--danger">{analysis.analysisError}</div>}
			{analysis.analysisResults.length === 0 && (
				<div className="v2-empty">没有分析结果。选择日志文件后点击「分析」。</div>
			)}
			{analysis.analysisResults.map((result) => (
				<ResultBlock key={result.path} rm={rm} result={result} />
			))}
		</Modal>
	);
}

function ResultBlock({ rm, result }: { rm: RemoteMachineHandle; result: AnalysisFileResult }) {
	const { content, hasLanguageSections } = rm.analysis.getAnalysisLanguageContent(result.output, result.language);

	return (
		<div className="v2-surface-block v2-stack-3">
			<div className="v2-row v2-between v2-wrap v2-gap-2">
				<span className="v2-mono" style={{ fontSize: 'var(--v2-text-sm)', fontWeight: 600 }}>
					{result.displayPath}
				</span>
				<div className="v2-row v2-gap-2">
					{hasLanguageSections && (
						<Segmented
							value={result.language}
							onChange={(lang) => rm.analysis.updateResult(result.path, (r) => ({ ...r, language: lang }))}
							aria-label="分析语言"
							options={[
								{ value: 'ch', label: '中文' },
								{ value: 'en', label: 'EN' },
							]}
						/>
					)}
					<Badge tone={STATUS_TONE[result.status]} dot>
						{STATUS_LABEL[result.status]}
					</Badge>
				</div>
			</div>
			{result.statusDetail && (
				<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
					{result.statusDetail}
					{result.isFilteredLog && ' · 已按问题上下文裁剪'}
				</span>
			)}
			{result.error && <div className="v2-alert v2-alert--danger">{result.error}</div>}
			{content && <pre className="v2-analysis-output">{content}</pre>}
		</div>
	);
}
