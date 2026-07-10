'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

interface RemoteActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon: string;
	label: string;
	size?: 'sm' | 'md';
	tone?: 'default' | 'danger';
	spinning?: boolean;
}

export function RemoteActionButton({
	icon,
	label,
	size = 'md',
	tone = 'default',
	spinning = false,
	className = '',
	...buttonProps
}: RemoteActionButtonProps) {
	const sizeClass = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
	const iconSizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
	const toneClass =
		tone === 'danger'
			? 'text-rose-400/90 hover:text-rose-300'
			: 'text-white/48 hover:text-white/78';

	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			className={`inline-flex shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${sizeClass} ${toneClass} ${className}`}
			{...buttonProps}
		>
			<Icon
				name={icon}
				className={`${iconSizeClass} drop-shadow-[0_1px_0_rgba(255,255,255,0.08)] ${spinning ? 'animate-spin' : ''}`}
				aria-hidden="true"
			/>
		</button>
	);
}
