import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Stat } from '../../components/ui/Stat';
import { IconDatabase, IconLayers, IconPlus, IconSpark } from '../../components/ui/icons';

const STATS = [
	{ label: '文档总量', value: '12,480', delta: '+8.2% 近 7 天', trend: 'up' as const, icon: <IconDatabase /> },
	{ label: '向量分片', value: '318k', delta: '+1.4k 今日', trend: 'up' as const, icon: <IconLayers /> },
	{ label: '检索命中率', value: '94.6%', delta: '+2.1%', trend: 'up' as const, icon: <IconSpark /> },
	{ label: '平均延迟', value: '212ms', delta: '-18ms', trend: 'down' as const },
];

const PIPELINES = [
	{ name: '技术手册摄取', status: 'success' as const, label: '已完成', progress: 100, meta: '2,140 分片 · 3 分钟前' },
	{ name: '会议纪要向量化', status: 'info' as const, label: '进行中', progress: 62, meta: '预计剩余 4 分钟' },
	{ name: '合同库重建索引', status: 'warning' as const, label: '排队中', progress: 0, meta: '等待资源' },
];

const ACTIVITY = [
	{ who: 'HanQiao', action: '发布了检索模型 v2.3', time: '10:24' },
	{ who: '系统', action: '完成夜间增量索引', time: '02:00' },
	{ who: 'Reranker', action: '权重自动调优 +1.2%', time: '昨天' },
];

/** V2 概览页：指标 + 管线状态 + 活动流。 */
export function DashboardView() {
	return (
		<div className="v2-stack-6 v2-animate-in">
			<div className="v2-row v2-between v2-wrap">
				<div className="v2-col v2-stack-2">
					<span className="v2-eyebrow">工作台概览</span>
					<h1 className="v2-title">早上好，欢迎回到 TerraForge</h1>
					<span className="v2-text-muted">实时掌握知识库摄取、向量索引与检索质量。</span>
				</div>
				<Button variant="primary" size="lg">
					<IconPlus width={16} height={16} />
					新建管线
				</Button>
			</div>

			<div className="v2-grid v2-grid--stats">
				{STATS.map((s) => (
					<Stat key={s.label} {...s} />
				))}
			</div>

			<div className="v2-grid v2-grid--2">
				<Card>
					<CardHeader
						title="管线状态"
						action={
							<Button variant="ghost" size="sm">
								查看全部
							</Button>
						}
					/>
					<div className="v2-stack-4">
						{PIPELINES.map((p) => (
							<div key={p.name} className="v2-surface-block v2-stack-2">
								<div className="v2-row v2-between">
									<span style={{ fontWeight: 'var(--v2-weight-semibold)' }}>{p.name}</span>
									<Badge tone={p.status} dot>
										{p.label}
									</Badge>
								</div>
								<div
									style={{
										height: 6,
										borderRadius: 'var(--v2-radius-full)',
										background: 'var(--v2-surface-3)',
										overflow: 'hidden',
									}}
								>
									<div
										style={{
											width: `${p.progress}%`,
											height: '100%',
											background: 'linear-gradient(90deg, var(--v2-brand-400), var(--v2-brand-600))',
											transition: 'width var(--v2-dur-slow) var(--v2-ease)',
										}}
									/>
								</div>
								<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
									{p.meta}
								</span>
							</div>
						))}
					</div>
				</Card>

				<Card>
					<CardHeader title="最近活动" />
					<div className="v2-stack-4">
						{ACTIVITY.map((a) => (
							<div key={a.action} className="v2-row v2-between">
								<div className="v2-row">
									<span className="v2-avatar" style={{ width: 30, height: 30 }}>
										{a.who.slice(0, 2).toUpperCase()}
									</span>
									<div className="v2-col">
										<span style={{ fontWeight: 'var(--v2-weight-medium)' }}>{a.who}</span>
										<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
											{a.action}
										</span>
									</div>
								</div>
								<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
									{a.time}
								</span>
							</div>
						))}
						<hr className="v2-divider" />
						<Button variant="outline">查看完整日志</Button>
					</div>
				</Card>
			</div>
		</div>
	);
}
