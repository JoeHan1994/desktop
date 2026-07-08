'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSetting, setSetting } from '@/services/tauriBridge';

/** 动态背景预设；保留旧 value 以兼容已保存主题。 */
export type BgStyle =
	| 'deepDistortion'
	| 'turbulentDistortion'
	| 'mountainDistortion'
	| 'LongRaceDistortion'
	| 'xyDistortion';

export type BgImageFit = 'cover' | 'contain' | 'auto';
export type BgImagePosition = 'center' | 'top' | 'bottom';
export type BackgroundTheme = 'minimalLight' | 'galaxyDark';

export interface Theme {
	/** 玻璃透明度 0–0.35 */
	glassAlpha: number;
	/** 毛玻璃模糊 px 0–40 */
	glassBlur: number;
	/** 背景饱和度增强 1–2 */
	glassSaturate: number;
	/** 边框透明度 0–0.6 */
	borderAlpha: number;
	/** 圆角 px 6–40 */
	radius: number;
	/** 强调色（hex） */
	accent: string;
	/** 动态背景预设 */
	bgStyle: BgStyle;
	/** 背景主题 */
	backgroundTheme: BackgroundTheme;
	/** 文字亮度 0.6–1 */
	textStrength: number;
	/** 阴影强度 0–1 */
	shadowStrength: number;
	/** 背景亮度 0.2–1 */
	bgBrightness: number;
	/** 背景开关 */
	bgEnabled: boolean;
	/** 自定义背景图（data URL） */
	bgImageDataUrl?: string;
	/** 自定义背景图填充方式 */
	bgImageFit: BgImageFit;
	/** 自定义背景图位置 */
	bgImagePosition: BgImagePosition;
	/** 字体 */
	font: 'sans' | 'serif' | 'mono' | 'rounded';
}

export const FONT_STACKS: Record<Theme['font'], string> = {
	sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
	serif: "ui-serif, Georgia, Cambria, 'Times New Roman', 'Songti SC', serif",
	mono: "ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace",
	rounded: "'SF Pro Rounded', ui-rounded, 'Segoe UI', 'Hiragino Sans', system-ui, sans-serif",
};

export const DEFAULT_THEME: Theme = {
	glassAlpha: 0.72,
	glassBlur: 18,
	glassSaturate: 1.08,
	borderAlpha: 0.42,
	radius: 18,
	accent: '#2563eb',
	bgStyle: 'deepDistortion',
	backgroundTheme: 'minimalLight',
	textStrength: 1,
	shadowStrength: 0.32,
	bgBrightness: 1,
	bgEnabled: true,
	bgImageDataUrl: '',
	bgImageFit: 'cover',
	bgImagePosition: 'center',
	font: 'sans',
};

function hexToRgbTriplet(hex: string): string {
	const m = hex.replace('#', '');
	const n =
		m.length === 3
			? m
					.split('')
					.map((c) => c + c)
					.join('')
			: m;
	const r = parseInt(n.slice(0, 2), 16) || 0;
	const g = parseInt(n.slice(2, 4), 16) || 0;
	const b = parseInt(n.slice(4, 6), 16) || 0;
	return `${r} ${g} ${b}`;
}

interface ThemeContextValue {
	theme: Theme;
	setTheme: (patch: Partial<Theme>) => void;
	reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error('useTheme 必须在 <ThemeProvider> 内使用');
	return ctx;
}

const STORAGE_KEY = 'vv-theme';
const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window;

/**
 * 全局主题 Provider。
 *
 * 持久化策略（双写双读，互为兜底）：
 *  1. Tauri 环境：读写 SQLite（`app_settings` 表，key = 'vv-theme'）
 *  2. 始终同步写 localStorage（供 web/dev 模式及离线回退使用）
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

	// ── 启动时加载持久化配置 ────────────────────────────────────────────
	useEffect(() => {
		async function load() {
			let raw: string | null = null;

			// 优先从 SQLite 读取
			if (isTauri()) {
				try {
					raw = await getSetting(STORAGE_KEY);
				} catch {
					/* 忽略 */
				}
			}

			// 回退到 localStorage
			if (!raw) {
				try {
					raw = localStorage.getItem(STORAGE_KEY);
				} catch {
					/* 忽略 */
				}
			}

			if (raw) {
				try {
					setThemeState({ ...DEFAULT_THEME, ...JSON.parse(raw) });
				} catch {
					/* 忽略 */
				}
			}
		}
		load();
	}, []);

	// ── 主题变更：应用 CSS 变量 + 持久化 ───────────────────────────────
	useEffect(() => {
		const s = document.documentElement.style;
		const isLight = theme.backgroundTheme === 'minimalLight';
		const foreground = isLight ? '15 23 42' : '255 255 255';
		const background = isLight ? '248 250 252' : '0 0 0';

		document.documentElement.dataset.backgroundTheme = theme.backgroundTheme;
		s.setProperty('--background', background);
		s.setProperty('--foreground', foreground);
		s.setProperty('--glass-alpha', String(theme.glassAlpha));
		s.setProperty('--glass-blur', `${theme.glassBlur}px`);
		s.setProperty('--glass-saturate', String(theme.glassSaturate));
		s.setProperty('--glass-border-alpha', String(theme.borderAlpha));
		s.setProperty('--glass-radius', `${theme.radius}px`);
		s.setProperty('--accent-rgb', hexToRgbTriplet(theme.accent));
		s.setProperty('--text-strength', String(theme.textStrength));
		s.setProperty('--shadow-strength', String(theme.shadowStrength));
		s.setProperty('--app-font', FONT_STACKS[theme.font] ?? FONT_STACKS.sans);

		const json = JSON.stringify(theme);

		// 写 localStorage（dev / web 模式兜底）
		try {
			localStorage.setItem(STORAGE_KEY, json);
		} catch {
			/* 忽略 */
		}

		// 写 SQLite（Tauri 生产环境）
		if (isTauri()) {
			setSetting(STORAGE_KEY, json).catch(() => {
				/* 忽略 */
			});
		}
	}, [theme]);

	const setTheme = useCallback((patch: Partial<Theme>) => setThemeState((t) => ({ ...t, ...patch })), []);
	const reset = useCallback(() => setThemeState(DEFAULT_THEME), []);

	return <ThemeContext.Provider value={{ theme, setTheme, reset }}>{children}</ThemeContext.Provider>;
}
