import type { CSSProperties } from 'react';

interface TactileSliderProps {
	label?: string;
	value: number;
	min?: number;
	max?: number;
	step?: number;
	/** 显示值格式化。 */
	format?: (value: number) => string;
	onChange: (value: number) => void;
}

/** 触感滑块（TactileSlider）：凹陷轨 + 凸起手柄，用于超参数调节。 */
export function TactileSlider({
	label,
	value,
	min = 0,
	max = 1,
	step = 0.01,
	format,
	onChange,
}: TactileSliderProps) {
	const pct = ((value - min) / (max - min)) * 100;
	const style = { '--v2-slider-value': `${pct}%` } as CSSProperties;

	return (
		<div className="v2-field">
			{label && (
				<div className="v2-row v2-between">
					<span className="v2-label">{label}</span>
					<span className="v2-mono v2-text-muted" style={{ fontSize: 'var(--v2-text-sm)' }}>
						{format ? format(value) : value}
					</span>
				</div>
			)}
			<div className="v2-slider" style={style}>
				<div className="v2-slider__track">
					<div className="v2-slider__fill" />
				</div>
				<span className="v2-slider__handle" />
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					aria-label={label}
					onChange={(e) => onChange(Number(e.target.value))}
				/>
			</div>
		</div>
	);
}
