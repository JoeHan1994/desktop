'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
	theme: ThemeMode;
	toggle: () => void;
	setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'terraforge.v2.theme';

/**
 * V2 主题上下文：仅作用于 v2 子树，通过 data-v2-theme 属性切换深浅色，
 * 与 v1 的 ThemeProvider 完全隔离。
 */
export function V2ThemeProvider({
	children,
	defaultTheme = 'dark',
}: {
	children: ReactNode;
	defaultTheme?: ThemeMode;
}) {
	const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);

	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(STORAGE_KEY);
			if (saved === 'dark' || saved === 'light') setThemeState(saved);
		} catch {
			/* localStorage 不可用时忽略 */
		}
	}, []);

	const setTheme = useCallback((mode: ThemeMode) => {
		setThemeState(mode);
		try {
			window.localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			/* 忽略持久化失败 */
		}
	}, []);

	const toggle = useCallback(() => {
		setThemeState((prev) => {
			const next = prev === 'dark' ? 'light' : 'dark';
			try {
				window.localStorage.setItem(STORAGE_KEY, next);
			} catch {
				/* 忽略 */
			}
			return next;
		});
	}, []);

	const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useV2Theme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error('useV2Theme 必须在 V2ThemeProvider 内使用');
	return ctx;
}
