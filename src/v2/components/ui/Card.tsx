import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
	padded?: boolean;
	hover?: boolean;
	elevated?: boolean;
	children?: ReactNode;
}

/** V2 卡片基元（实心表面 + 柔和阴影，非玻璃拟态）。 */
export function Card({ padded = true, hover = false, elevated = false, className, children, ...rest }: CardProps) {
	return (
		<div
			className={cn(
				'v2-card',
				padded && 'v2-card--pad',
				hover && 'v2-card--hover',
				elevated && 'v2-card--elevated',
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}

interface CardHeaderProps {
	title: ReactNode;
	action?: ReactNode;
	className?: string;
}

/** 卡片标题行：左标题 + 右操作区。 */
export function CardHeader({ title, action, className }: CardHeaderProps) {
	return (
		<div className={cn('v2-card__header', className)}>
			<div className="v2-subtitle">{title}</div>
			{action}
		</div>
	);
}
