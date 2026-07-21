import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

interface MeterProps {
	/** 0–100 百分比。 */
	value: number;
	label?: string;
	/** 环形填充色（默认主色）。 */
	color?: string;
	size?: number;
}

/** 圆形进度表（MachineMetricCard 内的 CPU/RAM 软表盘）。 */
export function CircularMeter({ value, label, color, size = 92 }: MeterProps) {
	const clamped = Math.max(0, Math.min(100, value));
	const style = {
		'--v2-meter-value': clamped,
		'--v2-meter-size': `${size}px`,
		...(color ? { '--v2-meter-color': color } : {}),
	} as CSSProperties;
	return (
		<div className="v2-meter" style={style} role="meter" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
			<span className="v2-meter__ring" />
			<span className="v2-meter__value">{Math.round(clamped)}%</span>
			{label && <span className="v2-meter__label">{label}</span>}
		</div>
	);
}

interface TrackProps {
	value: number;
	color?: string;
	className?: string;
}

/** 线性进度轨（凹陷底 + 渐变填充）。 */
export function Track({ value, color, className }: TrackProps) {
	const clamped = Math.max(0, Math.min(100, value));
	const style = {
		'--v2-track-value': `${clamped}%`,
		...(color ? { '--v2-track-color': color } : {}),
	} as CSSProperties;
	return (
		<div className={cn('v2-track', className)} style={style}>
			<span className="v2-track__fill" />
		</div>
	);
}
