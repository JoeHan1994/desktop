'use client';

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
	type BackgroundTheme,
	type BgImageFit,
	type BgImagePosition,
	type BgStyle,
	type Theme,
	useTheme,
} from '@/features/theme/ThemeContext';
import { GALAXY_STYLE_OPTIONS } from '@/components/galaxyPresets';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/Switch';

interface SliderProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	suffix?: string;
	onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, suffix, onChange }: SliderProps) {
	return (
		<label className="block">
			<div className="mb-1.5 flex items-center justify-between">
				<span className="text-xs text-white/70">{label}</span>
				<span className="text-xs tabular-nums text-white/45">
					{value}
					{suffix}
				</span>
			</div>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(parseFloat(e.target.value))}
				className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
			/>
		</label>
	);
}

const ACCENT_SWATCHES = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#ffffff'];

const FONT_OPTIONS: { value: Theme['font']; label: string }[] = [
	{ value: 'sans', label: '无衅线 Sans' },
	{ value: 'serif', label: '衅线 Serif' },
	{ value: 'mono', label: '等宽 Mono' },
	{ value: 'rounded', label: '圆体 Rounded' },
];

const BG_IMAGE_FIT_OPTIONS: { value: BgImageFit; label: string }[] = [
	{ value: 'cover', label: '填满 Cover' },
	{ value: 'contain', label: '完整 Contain' },
	{ value: 'auto', label: '原始 Auto' },
];

const BG_IMAGE_POSITION_OPTIONS: { value: BgImagePosition; label: string }[] = [
	{ value: 'center', label: '居中 Center' },
	{ value: 'top', label: '顶部 Top' },
	{ value: 'bottom', label: '底部 Bottom' },
];

const MAX_BACKGROUND_IMAGE_BYTES = 2 * 1024 * 1024;

const BACKGROUND_THEME_OPTIONS: { value: BackgroundTheme; label: string }[] = [
	{ value: 'minimalLight', label: '白色简约' },
	{ value: 'galaxyDark', label: '深色动态' },
];

const LIGHT_THEME_PATCH: Partial<Theme> = {
	backgroundTheme: 'minimalLight',
	glassAlpha: 0.72,
	glassBlur: 18,
	glassSaturate: 1.08,
	borderAlpha: 0.42,
	radius: 18,
	accent: '#2563eb',
	textStrength: 1,
	shadowStrength: 0.32,
	bgBrightness: 1,
	bgEnabled: true,
};

const DARK_THEME_PATCH: Partial<Theme> = {
	backgroundTheme: 'galaxyDark',
	glassAlpha: 0.12,
	glassBlur: 24,
	glassSaturate: 1.5,
	borderAlpha: 0.2,
	radius: 28,
	accent: '#38bdf8',
	textStrength: 1,
	shadowStrength: 1,
	bgBrightness: 1,
	bgEnabled: true,
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<div className="flex items-center justify-between text-xs">
			<span className="text-white/70">{label}</span>
			<Switch checked={checked} onChange={onChange} ariaLabel={label} />
		</div>
	);
}

function CollapsibleSection({
	title,
	children,
	defaultOpen = false,
}: {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultOpen);

	return (
		<section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
			<button
				type="button"
				aria-expanded={expanded}
				onClick={() => setExpanded((value) => !value)}
				className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium text-white/75 transition-colors hover:bg-white/[0.04] hover:text-white"
			>
				<span>{title}</span>
				<svg
					viewBox="0 0 12 12"
					className={`h-3 w-3 shrink-0 text-white/45 transition-transform ${expanded ? 'rotate-180' : ''}`}
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M3 4.5 6 7.5l3-3" />
				</svg>
			</button>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.18, ease: 'easeOut' }}
					>
						<div className="space-y-4 border-t border-white/[0.07] px-3 py-3">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

/**
 * 外观配置面板。
 * 触发按钮已移至标题栏（AppShell），由外部传入 open/onClose 控制开关。
 */
export function ThemeConfigurator({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { theme, setTheme, reset } = useTheme();
	const fileRef = useRef<HTMLInputElement>(null);
	const bgImageFileRef = useRef<HTMLInputElement>(null);
	const [bgImageError, setBgImageError] = useState('');

	function handleExport() {
		const blob = new Blob([JSON.stringify(theme, null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'mytoolbox-theme.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleImport(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		file.text().then((txt) => {
			try {
				setTheme(JSON.parse(txt) as Partial<Theme>);
			} catch {
				/* 忽略非法 JSON */
			}
		});
	}

	function handleBackgroundImageChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		setBgImageError('');
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			setBgImageError('请选择图片文件');
			return;
		}

		if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
			setBgImageError('图片不能超过 2MB');
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result === 'string' && result.startsWith('data:image/')) {
				setTheme({ bgImageDataUrl: result, bgEnabled: true });
			} else {
				setBgImageError('图片读取失败');
			}
		};
		reader.onerror = () => setBgImageError('图片读取失败');
		reader.readAsDataURL(file);
	}

	function handleClearBackgroundImage() {
		setBgImageError('');
		setTheme({ bgImageDataUrl: '' });
	}

	function handleBackgroundThemeChange(value: BackgroundTheme) {
		setBgImageError('');
		setTheme(value === 'minimalLight' ? LIGHT_THEME_PATCH : DARK_THEME_PATCH);
	}

	const hasCustomBackgroundImage =
		typeof theme.bgImageDataUrl === 'string' && theme.bgImageDataUrl.startsWith('data:image/');
	const isGalaxyDarkTheme = theme.backgroundTheme === 'galaxyDark';
	const dynamicBackgroundActive = isGalaxyDarkTheme && theme.bgEnabled && !hasCustomBackgroundImage;

	return (
		<>
			<AnimatePresence>
				{open && (
					<>
						{/* 透明遮罩：点击空白处关闭面板 */}
						<div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />
						<motion.div
							initial={{ opacity: 0, y: -8, scale: 0.97 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -8, scale: 0.97 }}
							transition={{ type: 'spring', stiffness: 280, damping: 26 }}
							className="glass app-popover fixed top-10 right-4 z-40 flex max-h-[calc(100vh-56px)] w-[min(90vw,300px)] flex-col overflow-hidden rounded-2xl shadow-2xl"
						>
							{/* 置顶标题行 */}
							<div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.04] px-5 py-3.5 backdrop-blur-xl">
								<h3 className="text-sm font-semibold card-title">外观配置</h3>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => {
											reset();
											setBgImageError('');
										}}
										className="glass glass-button glass-control rounded-lg px-2 py-1 text-[11px]"
									>
										重置
									</button>
									<button
										type="button"
										onClick={onClose}
										className="glass glass-icon-button glass-control h-6 w-6 rounded-full"
										aria-label="关闭"
										title="关闭"
									>
										<Icon name="x" className="h-3.5 w-3.5" aria-hidden="true" />
									</button>
								</div>
							</div>

							{/* 可滚动内容区 */}
							<div className="overflow-y-auto px-5 py-4">
								<div className="space-y-4">
									<CollapsibleSection title="玻璃效果">
										<Slider
											label="玻璃透明度"
											value={theme.glassAlpha}
											min={0.02}
											max={0.35}
											step={0.01}
											onChange={(v) => setTheme({ glassAlpha: v })}
										/>
										<Slider
											label="毛玻璃模糊"
											value={theme.glassBlur}
											min={0}
											max={40}
											step={1}
											suffix="px"
											onChange={(v) => setTheme({ glassBlur: v })}
										/>
										<Slider
											label="饱和度"
											value={theme.glassSaturate}
											min={1}
											max={2}
											step={0.05}
											onChange={(v) => setTheme({ glassSaturate: v })}
										/>
										<Slider
											label="边框强度"
											value={theme.borderAlpha}
											min={0}
											max={0.6}
											step={0.01}
											onChange={(v) => setTheme({ borderAlpha: v })}
										/>
										<Slider
											label="圆角"
											value={theme.radius}
											min={6}
											max={40}
											step={1}
											suffix="px"
											onChange={(v) => setTheme({ radius: v })}
										/>
									</CollapsibleSection>

									<CollapsibleSection title="色彩与文字">
										<Slider
											label="文字亮度"
											value={theme.textStrength}
											min={0.6}
											max={1}
											step={0.02}
											onChange={(v) => setTheme({ textStrength: v })}
										/>
										<Slider
											label="阴影强度"
											value={theme.shadowStrength}
											min={0}
											max={1}
											step={0.05}
											onChange={(v) => setTheme({ shadowStrength: v })}
										/>

										<div>
											<div className="mb-2 text-xs text-white/70">强调色</div>
											<div className="flex flex-wrap items-center gap-2">
												{ACCENT_SWATCHES.map((c) => (
													<button
														key={c}
														type="button"
														onClick={() => setTheme({ accent: c })}
														className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
															theme.accent.toLowerCase() === c.toLowerCase()
																? 'border-white ring-2 ring-white/40'
																: 'border-white/20'
														}`}
														style={{ backgroundColor: c }}
														aria-label={c}
													/>
												))}
												<input
													type="color"
													value={theme.accent}
													onChange={(e) => setTheme({ accent: e.target.value })}
													className="h-6 w-8 cursor-pointer rounded border border-white/20 bg-transparent"
													aria-label="自定义强调色"
												/>
											</div>
										</div>

										<div>
											<div className="mb-1.5 text-xs text-white/70">字体</div>
											<select
												value={theme.font}
												onChange={(e) => setTheme({ font: e.target.value as Theme['font'] })}
												className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
											>
												{FONT_OPTIONS.map((o) => (
													<option key={o.value} value={o.value}>
														{o.label}
													</option>
												))}
											</select>
										</div>
									</CollapsibleSection>

									<CollapsibleSection title="背景">
										<div>
											<div className="mb-2 text-xs text-white/70">背景主题</div>
											<div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-black/20 p-1">
												{BACKGROUND_THEME_OPTIONS.map((option) => {
													const selected = theme.backgroundTheme === option.value;
													return (
														<button
															key={option.value}
															type="button"
															onClick={() => handleBackgroundThemeChange(option.value)}
															className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
																selected
																	? 'bg-white/15 text-white shadow-sm'
																	: 'text-white/45 hover:bg-white/[0.07] hover:text-white/80'
															}`}
														>
															{option.label}
														</button>
													);
												})}
											</div>
											<div className="mt-1.5 text-[11px] text-white/35">
												{theme.backgroundTheme === 'minimalLight'
													? '使用浅色背景与深色文字，动态背景和自定义图暂不生效。'
													: '使用深色动态背景，可继续选择 Galaxy 预设或自定义图片。'}
											</div>
										</div>

										<Toggle label="背景开关" checked={theme.bgEnabled} onChange={(v) => setTheme({ bgEnabled: v })} />
										<Slider
											label="背景亮度"
											value={theme.bgBrightness}
											min={0.2}
											max={1}
											step={0.05}
											onChange={(v) => setTheme({ bgBrightness: v })}
										/>

										<div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
											<div className="flex items-center justify-between gap-3">
												<div>
													<div className="text-xs text-white/70">自定义背景图</div>
													<div className="mt-0.5 text-[11px] text-white/40">
														{hasCustomBackgroundImage ? '已选择图片' : '未选择图片'}
													</div>
												</div>
												{hasCustomBackgroundImage && (
													<div
														className="h-9 w-12 shrink-0 rounded-lg border border-white/15 bg-cover bg-center"
														style={{ backgroundImage: `url(${theme.bgImageDataUrl})` }}
														aria-hidden="true"
													/>
												)}
											</div>
											<div className="flex gap-2">
												<button
													type="button"
													onClick={() => bgImageFileRef.current?.click()}
													disabled={!isGalaxyDarkTheme}
													className="flex-1 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30"
												>
													{hasCustomBackgroundImage ? '更换图片' : '选择图片'}
												</button>
												<button
													type="button"
													onClick={handleClearBackgroundImage}
													disabled={!hasCustomBackgroundImage}
													className="flex-1 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30"
												>
													清除图片
												</button>
												<input
													ref={bgImageFileRef}
													type="file"
													accept="image/*"
													className="hidden"
													onChange={handleBackgroundImageChange}
												/>
											</div>
											{bgImageError && <div className="text-[11px] text-rose-300">{bgImageError}</div>}
										</div>

										<div className="grid grid-cols-2 gap-2">
											<div>
												<div className="mb-1.5 text-xs text-white/70">图片填充</div>
												<select
													value={theme.bgImageFit}
													onChange={(e) => setTheme({ bgImageFit: e.target.value as BgImageFit })}
													className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
												>
													{BG_IMAGE_FIT_OPTIONS.map((o) => (
														<option key={o.value} value={o.value}>
															{o.label}
														</option>
													))}
												</select>
											</div>
											<div>
												<div className="mb-1.5 text-xs text-white/70">图片位置</div>
												<select
													value={theme.bgImagePosition}
													onChange={(e) => setTheme({ bgImagePosition: e.target.value as BgImagePosition })}
													className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
												>
													{BG_IMAGE_POSITION_OPTIONS.map((o) => (
														<option key={o.value} value={o.value}>
															{o.label}
														</option>
													))}
												</select>
											</div>
										</div>

										<div>
											<div className="mb-1.5 flex items-center justify-between gap-2">
												<span className="text-xs text-white/70">动态背景预设</span>
												{!dynamicBackgroundActive && <span className="text-[10px] text-white/35">当前未生效</span>}
											</div>
											<select
												value={theme.bgStyle}
												onChange={(e) => setTheme({ bgStyle: e.target.value as BgStyle })}
												disabled={!dynamicBackgroundActive}
												className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none disabled:cursor-not-allowed disabled:text-white/35"
											>
												{GALAXY_STYLE_OPTIONS.map((o) => (
													<option key={o.value} value={o.value}>
														{o.label}
													</option>
												))}
											</select>
											{!dynamicBackgroundActive && (
												<div className="mt-1 text-[11px] text-white/35">
													{isGalaxyDarkTheme
														? '关闭自定义背景图并开启背景后，此预设会控制 Galaxy 动态背景。'
														: '切换到深色动态主题后，此预设会控制 Galaxy 动态背景。'}
												</div>
											)}
										</div>
									</CollapsibleSection>

									<CollapsibleSection title="预设" defaultOpen={false}>
										<div>
											<div className="mb-2 text-xs text-white/70">预设 JSON</div>
											<div className="flex gap-2">
												<button
													type="button"
													onClick={handleExport}
													className="flex-1 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
												>
													导出
												</button>
												<button
													type="button"
													onClick={() => fileRef.current?.click()}
													className="flex-1 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
												>
													导入
												</button>
												<input
													ref={fileRef}
													type="file"
													accept="application/json,.json"
													className="hidden"
													onChange={handleImport}
												/>
											</div>
										</div>
									</CollapsibleSection>
								</div>
							</div>
							{/* /可滚动内容区 */}
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	);
}

export default ThemeConfigurator;
