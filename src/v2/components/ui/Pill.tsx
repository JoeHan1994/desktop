import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PillProps {
	active?: boolean;
	onClick?: () => void;
	children: ReactNode;
	className?: string;
}

/** 过滤药丸（ChunkFilterBar）：凸起→凹陷的多选切换。 */
export function Pill({ active = false, onClick, children, className }: PillProps) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn('v2-pill', active && 'v2-pill--active', className)}
		>
			{children}
		</button>
	);
}
