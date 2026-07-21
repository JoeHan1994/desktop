'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { IconCheck, IconChevronDown } from './icons';

export interface SelectOption {
	value: string;
	label: ReactNode;
	/** Optional plain-text label used for the collapsed trigger when `label` is a node. */
	text?: string;
	disabled?: boolean;
}

interface SelectProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	disabled?: boolean;
	size?: 'md' | 'sm';
	id?: string;
	className?: string;
	'aria-label'?: string;
}

/**
 * 全局新拟态下拉框（自定义 listbox，而非原生 <select>）。
 * 触发器为凹陷输入井，展开菜单为凸起浮层，键盘可达。
 */
export function Select({
	value,
	onChange,
	options,
	placeholder = '请选择',
	disabled = false,
	size = 'md',
	id,
	className,
	'aria-label': ariaLabel,
}: SelectProps) {
	const reactId = useId();
	const listId = `${id ?? reactId}-list`;
	const wrapRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(-1);

	const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
	const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

	const close = useCallback(() => {
		setOpen(false);
		setHighlight(-1);
	}, []);

	const openMenu = useCallback(() => {
		if (disabled) return;
		setOpen(true);
		setHighlight(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
	}, [disabled, options, selectedIndex]);

	const commit = useCallback(
		(index: number) => {
			const opt = options[index];
			if (!opt || opt.disabled) return;
			onChange(opt.value);
			close();
		},
		[options, onChange, close],
	);

	const moveHighlight = useCallback(
		(dir: 1 | -1) => {
			setHighlight((cur) => {
				const total = options.length;
				let next = cur;
				for (let i = 0; i < total; i += 1) {
					next = (next + dir + total) % total;
					if (!options[next]?.disabled) return next;
				}
				return cur;
			});
		},
		[options],
	);

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
		};
		document.addEventListener('mousedown', onPointer);
		return () => document.removeEventListener('mousedown', onPointer);
	}, [open, close]);

	function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				if (!open) openMenu();
				else moveHighlight(1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (!open) openMenu();
				else moveHighlight(-1);
				break;
			case 'Home':
				if (open) {
					e.preventDefault();
					setHighlight(options.findIndex((o) => !o.disabled));
				}
				break;
			case 'End':
				if (open) {
					e.preventDefault();
					for (let i = options.length - 1; i >= 0; i -= 1) {
						if (!options[i].disabled) {
							setHighlight(i);
							break;
						}
					}
				}
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (!open) openMenu();
				else if (highlight >= 0) commit(highlight);
				break;
			case 'Escape':
				if (open) {
					e.preventDefault();
					close();
				}
				break;
			case 'Tab':
				if (open) close();
				break;
			default:
				break;
		}
	}

	const triggerLabel: ReactNode = selected ? selected.text ?? selected.label : (
		<span className="v2-select__placeholder">{placeholder}</span>
	);

	return (
		<div ref={wrapRef} className={cn('v2-select-wrap', className)}>
			<button
				type="button"
				id={id}
				className={cn('v2-select-trigger', size === 'sm' && 'v2-select-trigger--sm', open && 'is-open')}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel}
				aria-controls={open ? listId : undefined}
				onClick={() => (open ? close() : openMenu())}
				onKeyDown={onKeyDown}
			>
				<span className="v2-select-trigger__label">{triggerLabel}</span>
				<IconChevronDown width={16} height={16} className="v2-select-trigger__chevron" aria-hidden />
			</button>

			{open && (
				<ul className="v2-select-menu" id={listId} role="listbox" tabIndex={-1} aria-activedescendant={highlight >= 0 ? `${listId}-opt-${highlight}` : undefined}>
					{options.map((opt, index) => {
						const isSelected = opt.value === value;
						return (
							<li
								key={opt.value}
								id={`${listId}-opt-${index}`}
								role="option"
								aria-selected={isSelected}
								aria-disabled={opt.disabled || undefined}
								className={cn(
									'v2-select-option',
									index === highlight && 'is-active',
									isSelected && 'is-selected',
									opt.disabled && 'is-disabled',
								)}
								onMouseEnter={() => !opt.disabled && setHighlight(index)}
								onMouseDown={(e) => {
									e.preventDefault();
									commit(index);
								}}
							>
								<span className="v2-select-option__label">{opt.label}</span>
								{isSelected && <IconCheck width={15} height={15} className="v2-select-option__check" aria-hidden />}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
