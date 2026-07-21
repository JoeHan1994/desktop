import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Span = '1x1' | '2x1' | '3x1' | '4x1' | '1x2' | '2x2' | '3x2';

interface BentoGridProps extends HTMLAttributes<HTMLDivElement> {
	/** 3 或 4 列（默认 4）。 */
	columns?: 3 | 4;
	children?: ReactNode;
}

/** Bento 便当网格容器：统一 24px gap 的响应式 CSS Grid。 */
export function BentoGrid({ columns = 4, className, children, ...rest }: BentoGridProps) {
	return (
		<div className={cn('v2-bento', columns === 3 && 'v2-bento--3', className)} {...rest}>
			{children}
		</div>
	);
}

interface BentoCardProps extends HTMLAttributes<HTMLDivElement> {
	/** 网格跨度（列x行）。 */
	span?: Span;
	/** 卡片小标题（eyebrow 标签）。 */
	label?: ReactNode;
	/** 标题行右侧操作区。 */
	action?: ReactNode;
	padded?: boolean;
	children?: ReactNode;
}

/** Bento 卡片：新拟态凸起表面 + 可选标签/操作头。 */
export function BentoCard({
	span = '1x1',
	label,
	action,
	padded = true,
	className,
	children,
	...rest
}: BentoCardProps) {
	return (
		<div
			className={cn(
				'v2-card v2-bento-card',
				padded && 'v2-card--pad',
				`v2-bento__cell--${span}`,
				className,
			)}
			{...rest}
		>
			{(label || action) && (
				<div className="v2-card__header">
					{label ? <span className="v2-bento-card__label">{label}</span> : <span />}
					{action}
				</div>
			)}
			{children}
		</div>
	);
}
