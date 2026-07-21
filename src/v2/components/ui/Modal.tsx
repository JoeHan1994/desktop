'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { IconX } from './icons';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	description?: ReactNode;
	/** Leading icon rendered in a neumorphic badge next to the title. */
	icon?: ReactNode;
	/** Extra controls rendered in the header, left of the close button. */
	headerActions?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	/** Wider layout for content-heavy dialogs. */
	wide?: boolean;
	ariaLabel?: string;
	closeOnOverlay?: boolean;
	closeOnEscape?: boolean;
	showClose?: boolean;
	bodyClassName?: string;
}

/**
 * 全局新拟态模态框。统一遮罩 / 传送门 / Escape / 头部结构。
 * 表面为凸起浮层，遮罩为暗色蒙层（非玻璃态）。
 */
export function Modal({
	open,
	onClose,
	title,
	description,
	icon,
	headerActions,
	children,
	footer,
	wide = false,
	ariaLabel,
	closeOnOverlay = true,
	closeOnEscape = true,
	showClose = true,
	bodyClassName,
}: ModalProps) {
	useEffect(() => {
		if (!open || !closeOnEscape) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, closeOnEscape, onClose]);

	if (!open || typeof document === 'undefined') return null;

	const hasHeader = title != null || description != null || icon != null || headerActions != null || showClose;

	// Portal into the .v2-root token/theme scope so --v2-* custom properties resolve.
	const portalTarget = document.querySelector('.v2-root') ?? document.body;

	return createPortal(
		<div
			className="v2-modal-overlay"
			role="presentation"
			onMouseDown={(e) => {
				if (closeOnOverlay && e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={cn('v2-modal', wide && 'v2-modal--wide')}
				role="dialog"
				aria-modal="true"
				aria-label={ariaLabel}
			>
				{hasHeader && (
					<header className="v2-modal__head">
						<div className="v2-row v2-gap-3" style={{ minWidth: 0 }}>
							{icon && (
								<span className="v2-modal__icon" aria-hidden>
									{icon}
								</span>
							)}
							<div className="v2-col" style={{ minWidth: 0 }}>
								{title != null && <h2 className="v2-modal__title">{title}</h2>}
								{description != null && <p className="v2-modal__desc">{description}</p>}
							</div>
						</div>
						<div className="v2-row v2-gap-2">
							{headerActions}
							{showClose && (
								<Button size="sm" variant="ghost" iconOnly aria-label="关闭" onClick={onClose}>
									<IconX width={16} height={16} />
								</Button>
							)}
						</div>
					</header>
				)}

				<div className={cn('v2-modal__body', bodyClassName)}>{children}</div>

				{footer != null && <footer className="v2-modal__foot">{footer}</footer>}
			</div>
		</div>,
		portalTarget,
	);
}
