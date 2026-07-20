import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { IconPlus } from '../../components/ui/icons';

interface PlaceholderViewProps {
	title: string;
	description: string;
	icon: ReactNode;
}

/** 尚未实现模块的占位视图，复用 v2 样式框架。 */
export function PlaceholderView({ title, description, icon }: PlaceholderViewProps) {
	return (
		<div className="v2-stack-6 v2-animate-in">
			<div className="v2-col v2-stack-2">
				<span className="v2-eyebrow">模块</span>
				<h1 className="v2-title">{title}</h1>
			</div>
			<Card elevated padded>
				<div
					className="v2-col"
					style={{ alignItems: 'center', gap: 'var(--v2-space-4)', padding: 'var(--v2-space-12) 0' }}
				>
					<span className="v2-sidebar__logo" style={{ width: 56, height: 56, borderRadius: 'var(--v2-radius-lg)' }}>
						{icon}
					</span>
					<h2 className="v2-subtitle">{title} · 建设中</h2>
					<p className="v2-text-muted" style={{ maxWidth: 420, textAlign: 'center' }}>
						{description}
					</p>
					<Button variant="primary">
						<IconPlus width={16} height={16} />
						开始配置
					</Button>
				</div>
			</Card>
		</div>
	);
}
