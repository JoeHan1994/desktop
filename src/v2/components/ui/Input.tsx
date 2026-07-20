import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
}

/** V2 输入基元，可选内联标签。 */
export function Input({ label, className, id, ...rest }: InputProps) {
	const input = <input id={id} className={cn('v2-input', className)} {...rest} />;
	if (!label) return input;
	return (
		<label className="v2-field" htmlFor={id}>
			<span className="v2-label">{label}</span>
			{input}
		</label>
	);
}

interface FieldProps {
	label: string;
	htmlFor?: string;
	children: ReactNode;
}

/** 表单字段容器：标签 + 任意控件。 */
export function Field({ label, htmlFor, children }: FieldProps) {
	return (
		<label className="v2-field" htmlFor={htmlFor}>
			<span className="v2-label">{label}</span>
			{children}
		</label>
	);
}
