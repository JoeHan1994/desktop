import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Card } from './Card';

interface StatProps {
	label: string;
	value: ReactNode;
	delta?: string;
	trend?: 'up' | 'down';
	icon?: ReactNode;
}

/** V2 指标统计卡。 */
export function Stat({ label, value, delta, trend, icon }: StatProps) {
	return (
		<Card hover className="v2-stat">
			<div className="v2-row v2-between">
				<span className="v2-stat__label">{label}</span>
				{icon && <span className="v2-nav-item__icon">{icon}</span>}
			</div>
			<div className="v2-stat__value">{value}</div>
			{delta && (
				<div
					className={cn(
						'v2-stat__delta',
						trend === 'up' && 'v2-stat__delta--up',
						trend === 'down' && 'v2-stat__delta--down',
					)}
				>
					{delta}
				</div>
			)}
		</Card>
	);
}
