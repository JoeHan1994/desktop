'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from '@/components/Sidebar';
import { ThemeConfigurator } from '@/features/theme/ThemeConfigurator';
import type { ViewId } from '@/features/nav/navConfig';
import { AssistantView, KnowledgeBaseManagerView, RagView, SettingsView } from '@/components/views/Views';
import { RemoteMachineView } from '@/features/remote/RemoteMachineView';

const VIEWS: Record<ViewId, () => JSX.Element> = {
	assistant: AssistantView,
	rag: RagView,
	knowledge: KnowledgeBaseManagerView,
	settings: SettingsView,
	remote: RemoteMachineView,
};

type TauriAppWindow = typeof import('@tauri-apps/api/window').appWindow;

/** 导航列宽度 */
const SIDEBAR_COL = 'w-[52px]';

function MyToolBoxLogo() {
	return (
		<svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden="true">
			<defs>
				<linearGradient id="mytoolbox-logo-bg" x1="5" y1="4" x2="28" y2="29" gradientUnits="userSpaceOnUse">
					<stop stopColor="#0B1228" />
					<stop offset="0.55" stopColor="#124A5F" />
					<stop offset="1" stopColor="#18B59F" />
				</linearGradient>
				<linearGradient id="mytoolbox-logo-box" x1="9" y1="10" x2="24" y2="25" gradientUnits="userSpaceOnUse">
					<stop stopColor="#DFFCF6" />
					<stop offset="1" stopColor="#5EEAD4" />
				</linearGradient>
			</defs>
			<rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="url(#mytoolbox-logo-bg)" />
			<rect
				x="3.25"
				y="3.25"
				width="25.5"
				height="25.5"
				rx="7.25"
				stroke="white"
				strokeOpacity="0.2"
				strokeWidth="1.5"
			/>
			<path
				d="M11.5 12.5V11c0-1.2.95-2.15 2.15-2.15h4.7c1.2 0 2.15.95 2.15 2.15v1.5"
				stroke="#B7FFF1"
				strokeWidth="2.1"
				strokeLinecap="round"
			/>
			<path
				d="M8.7 14.25h14.6c1.05 0 1.9.85 1.9 1.9v8.05H6.8v-8.05c0-1.05.85-1.9 1.9-1.9Z"
				fill="url(#mytoolbox-logo-box)"
			/>
			<path d="M6.8 18.65h18.4" stroke="#0B3144" strokeOpacity="0.45" strokeWidth="1.7" />
			<rect x="14.1" y="17.3" width="3.8" height="3.8" rx="1.1" fill="#F8D66B" />
			<path d="M8.8 23.95h14.4" stroke="white" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

export function AppShell() {
	const [active, setActive] = useState<ViewId>('remote');
	const [themeOpen, setThemeOpen] = useState(false);

	/** 缓存 Tauri appWindow 实例，useEffect 挂载后异步加载 */
	const appWin = useRef<TauriAppWindow | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
		import('@tauri-apps/api/window')
			.then(({ appWindow }) => {
				appWin.current = appWindow;
			})
			.catch(() => {});
	}, []);

	function winAction(action: 'minimize' | 'maximize' | 'close') {
		const w = appWin.current;
		if (!w) return;
		if (action === 'minimize') w.minimize();
		else if (action === 'maximize') w.toggleMaximize();
		else w.close();
	}

	/** 点击顶栏空白区域时启动窗口拖拽（跳过按钮/输入框） */
	function handleHeaderMouseDown(e: React.MouseEvent) {
		if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) return;
		appWin.current?.startDragging().catch(() => {});
	}

	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden px-3 pb-3">
			{/* ── 顶部横栏：可拖拽区 + logo · 搜索 · 窗口控制 ──────────────── */}
			<header
				onMouseDown={handleHeaderMouseDown}
				className="relative flex shrink-0 h-11 cursor-default select-none items-center gap-4 px-4"
			>
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

				{/* 左：Logo + 品牌名 */}
				<div className="flex shrink-0 items-center gap-2.5">
					<motion.div
						animate={{ y: [0, -1, 0], scale: [1, 1.03, 1] }}
						transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
						className="drop-shadow-[0_0_18px_rgb(var(--accent-rgb)/0.28)]"
					>
						<MyToolBoxLogo />
					</motion.div>
					<span className="text-sm font-semibold text-white">MyToolBox</span>
				</div>

				{/* 中：搜索条 */}
				<div className="flex min-w-0 flex-1 justify-center">
					<div className="glass glass-input flex w-full max-w-sm items-center gap-2 rounded-full px-4 py-1.5">
						<svg
							viewBox="0 0 24 24"
							className="h-3.5 w-3.5 shrink-0 text-white/25"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<circle cx="11" cy="11" r="7" />
							<path d="m16.5 16.5 3 3" />
						</svg>
						<input
							placeholder="Search"
							className="flex-1 min-w-0 bg-transparent text-sm text-white/70 placeholder:text-white/28 focus:outline-none"
						/>
					</div>
				</div>

				{/* 右：窗口控制按钮组 */}
				<div className="flex shrink-0 items-center gap-1">
					{/* 外观配置 */}
					<button
						onClick={() => setThemeOpen((o) => !o)}
						aria-label="外观配置"
						title="外观配置"
						className={`glass glass-icon-button glass-control h-7 w-7 rounded-full
              ${themeOpen ? 'text-white' : ''}`}
					>
						<svg
							viewBox="0 0 12 12"
							className="h-3 w-3"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
						>
							<line x1="1" y1="2.5" x2="11" y2="2.5" strokeOpacity="0.45" />
							<circle cx="8" cy="2.5" r="1.2" fill="currentColor" stroke="none" />
							<line x1="1" y1="6" x2="11" y2="6" strokeOpacity="0.45" />
							<circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
							<line x1="1" y1="9.5" x2="11" y2="9.5" strokeOpacity="0.45" />
							<circle cx="7" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
						</svg>
					</button>
					<div className="mx-1 h-3.5 w-px bg-white/[0.1]" />
					{/* 最小化 */}
					<button
						onClick={() => winAction('minimize')}
						className="glass glass-icon-button glass-control h-7 w-7 rounded-full"
					>
						<svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
							<rect x="1" y="5.5" width="10" height="1.2" rx="0.6" />
						</svg>
					</button>
					{/* 最大化 */}
					<button
						onClick={() => winAction('maximize')}
						className="glass glass-icon-button glass-control h-7 w-7 rounded-full"
					>
						<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.3">
							<rect x="1.5" y="1.5" width="9" height="9" rx="1" />
						</svg>
					</button>
					{/* 关闭 */}
					<button
						onClick={() => winAction('close')}
						className="glass glass-icon-button glass-control h-7 w-7 rounded-full hover:!bg-rose-500/80 hover:text-white"
					>
						<svg viewBox="0 0 12 12" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
							<line x1="2" y1="2" x2="10" y2="10" />
							<line x1="10" y1="2" x2="2" y2="10" />
						</svg>
					</button>
				</div>
			</header>

			{/* ── 主体区 ──────────────────────────────────────────────────── */}
			<div className="flex min-h-0 flex-1 gap-3">
				{/* 左：侧边栏列（图标圆） */}
				<div className={`flex shrink-0 items-center ${SIDEBAR_COL}`}>
					<Sidebar active={active} onSelect={setActive} />
				</div>

				{/* 右：内容区 */}
				<div className="relative min-h-0 flex-1 overflow-hidden">
					<AnimatePresence mode="wait" initial={false}>
						{Object.entries(VIEWS).map(([id, View]) =>
							active === id ? (
								<motion.div
									key={id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
									className="absolute inset-0"
								>
									<View />
								</motion.div>
							) : null,
						)}
					</AnimatePresence>
				</div>
			</div>

			{/* 外观配置面板 */}
			<ThemeConfigurator open={themeOpen} onClose={() => setThemeOpen(false)} />
		</div>
	);
}

export default AppShell;
