import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<Tone, string> = {
	neutral: '',
	success: 'v2-badge--success',
	warning: 'v2-badge--warning',
	danger: 'v2-badge--danger',
	info: 'v2-badge--info',
};

interface BadgeProps {
	tone?: Tone;
	dot?: boolean;
	className?: string;
	children: ReactNode;
}

/** V2 徽章 / 状态标签。 */
export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
	return (
		<span className={cn('v2-badge', toneClass[tone], className)}>
			{dot && <span className="v2-badge__dot" />}
			{children}
		</span>
	);
}
