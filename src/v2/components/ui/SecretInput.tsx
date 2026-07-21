'use client';

import { useState } from 'react';
import { IconEye, IconEyeOff } from './icons';

interface SecretInputProps {
	label?: string;
	value: string;
	placeholder?: string;
	onChange: (value: string) => void;
	id?: string;
}

/** 密钥/API Key 输入（SecretInputField）：内联遮罩切换。 */
export function SecretInput({ label, value, placeholder, onChange, id }: SecretInputProps) {
	const [revealed, setRevealed] = useState(false);
	const field = (
		<div className="v2-secret">
			<input
				id={id}
				className="v2-input"
				type={revealed ? 'text' : 'password'}
				value={value}
				placeholder={placeholder}
				autoComplete="off"
				spellCheck={false}
				onChange={(e) => onChange(e.target.value)}
			/>
			<button
				type="button"
				className="v2-secret__toggle"
				aria-label={revealed ? '隐藏密钥' : '显示密钥'}
				title={revealed ? '隐藏密钥' : '显示密钥'}
				onClick={() => setRevealed((v) => !v)}
			>
				{revealed ? <IconEyeOff width={16} height={16} /> : <IconEye width={16} height={16} />}
			</button>
		</div>
	);

	if (!label) return field;
	return (
		<label className="v2-field" htmlFor={id}>
			<span className="v2-label">{label}</span>
			{field}
		</label>
	);
}
