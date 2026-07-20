import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	iconOnly?: boolean;
	children?: ReactNode;
}

const variantClass: Record<Variant, string> = {
	primary: 'v2-btn--primary',
	outline: 'v2-btn--outline',
	ghost: 'v2-btn--ghost',
};

const sizeClass: Record<Size, string> = {
	sm: 'v2-btn--sm',
	md: '',
	lg: 'v2-btn--lg',
};

/** V2 按钮基元。 */
export function Button({
	variant = 'primary',
	size = 'md',
	iconOnly = false,
	className,
	children,
	...rest
}: ButtonProps) {
	return (
		<button
			className={cn('v2-btn', variantClass[variant], sizeClass[size], iconOnly && 'v2-btn--icon', className)}
			{...rest}
		>
			{children}
		</button>
	);
}
