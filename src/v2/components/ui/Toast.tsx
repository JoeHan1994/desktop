'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ToastTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface ToastItem {
	id: number;
	tone: ToastTone;
	title: string;
	body?: string;
}

interface ToastContextValue {
	/** 弹出一条新拟态 Toast，返回其 id。 */
	notify: (toast: Omit<ToastItem, 'id'>) => number;
	/** 手动移除一条 Toast。 */
	dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
	notify: () => 0,
	dismiss: () => {},
});

const toneClass: Record<ToastTone, string> = {
	default: '',
	success: 'v2-toast--success',
	warning: 'v2-toast--warning',
	danger: 'v2-toast--danger',
	info: 'v2-toast--info',
};

/** 全局 Toast Provider：挂载浮层视口并提供 notify/dismiss。 */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const seq = useRef(0);

	const dismiss = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const notify = useCallback(
		(toast: Omit<ToastItem, 'id'>) => {
			const id = ++seq.current;
			setToasts((prev) => [...prev, { ...toast, id }]);
			window.setTimeout(() => dismiss(id), 4200);
			return id;
		},
		[dismiss],
	);

	const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<div className="v2-toast-viewport" role="region" aria-live="polite" aria-label="通知">
				{toasts.map((t) => (
					<div key={t.id} className={cn('v2-toast', toneClass[t.tone])}>
						<div className="v2-fill">
							<div className="v2-toast__title">{t.title}</div>
							{t.body && <div className="v2-toast__body">{t.body}</div>}
						</div>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast() {
	return useContext(ToastContext);
}
