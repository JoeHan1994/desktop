import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SwitchProps {
	checked: boolean;
	onChange: (next: boolean) => void;
	label?: string;
	'aria-label'?: string;
}

/** 触感拨动开关（FeatureToggleSwitch）。 */
export function Switch({ checked, onChange, label, ...rest }: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={rest['aria-label'] ?? label}
			onClick={() => onChange(!checked)}
			className={cn('v2-switch', checked && 'v2-switch--on')}
		>
			<span className="v2-switch__knob" />
		</button>
	);
}

export interface SegOption<T extends string> {
	value: T;
	label: ReactNode;
	/** 语义色调（用于协议高亮）。 */
	tone?: 'ssh' | 'rdp';
}

interface SegmentedProps<T extends string> {
	value: T;
	options: SegOption<T>[];
	onChange: (next: T) => void;
	'aria-label'?: string;
}

/** 分段切换（ProtocolToggle：SSH / RDP 凹陷轨 + 凸起激活）。 */
export function Segmented<T extends string>({ value, options, onChange, ...rest }: SegmentedProps<T>) {
	return (
		<div className="v2-seg" role="tablist" aria-label={rest['aria-label']}>
			{options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					role="tab"
					aria-selected={value === opt.value}
					onClick={() => onChange(opt.value)}
					className={cn(
						'v2-seg__btn',
						opt.tone && `v2-seg__btn--${opt.tone}`,
						value === opt.value && 'v2-seg__btn--active',
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
