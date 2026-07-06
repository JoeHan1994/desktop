'use client';

import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type BgStyle, type Theme, useTheme } from '@/features/theme/ThemeContext';

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

const BG_OPTIONS: { value: BgStyle; label: string }[] = [
  { value: 'deepDistortion', label: '深邃 Deep' },
  { value: 'turbulentDistortion', label: '湍流 Turbulent' },
  { value: 'mountainDistortion', label: '山脊 Mountain' },
  { value: 'LongRaceDistortion', label: '长途 Long Race' },
  { value: 'xyDistortion', label: '横摆 XY' },
];

const ACCENT_SWATCHES = [
  '#38bdf8',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#ffffff',
];

const FONT_OPTIONS: { value: Theme['font']; label: string }[] = [
  { value: 'sans', label: '无衅线 Sans' },
  { value: 'serif', label: '衅线 Serif' },
  { value: 'mono', label: '等宽 Mono' },
  { value: 'rounded', label: '圆体 Rounded' },
];

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/70">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-white/80' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${checked ? 'translate-x-4 bg-neutral-900' : 'translate-x-0.5 bg-white'}`}
        />
      </button>
    </div>
  );
}

/**
/**
 * 外观配置面板。
 * 触发按钮已移至标题栏（AppShell），由外部传入 open/onClose 控制开关。
 */
export function ThemeConfigurator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme, reset } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const blob = new Blob([JSON.stringify(theme, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vector-vision-theme.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
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

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* 透明遮罩：点击空白处关闭面板 */}
            <div
              className="fixed inset-0 z-30"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="fixed top-10 right-4 z-40 flex max-h-[calc(100vh-56px)] w-[300px] flex-col rounded-2xl
                border border-white/15 bg-neutral-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
            {/* 置顶标题行 */}
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between rounded-t-2xl border-b border-white/[0.07] bg-neutral-900/95 px-5 py-3.5 backdrop-blur-xl">
              <h3 className="text-sm font-semibold text-white">外观配置</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  重置
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.07] text-white/50 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 可滚动内容区 */}
            <div className="overflow-y-auto px-5 py-4">
            <div className="space-y-4">
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

              {/* 强调色 */}
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

              {/* 字体 */}
              <div>
                <div className="mb-1.5 text-xs text-white/70">字体</div>
                <select
                  value={theme.font}
                  onChange={(e) =>
                    setTheme({ font: e.target.value as Theme['font'] })
                  }
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
                >
                  {FONT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 背景 */}
              <Toggle
                label="背景开关"
                checked={theme.bgEnabled}
                onChange={(v) => setTheme({ bgEnabled: v })}
              />
              <Slider
                label="背景亮度"
                value={theme.bgBrightness}
                min={0.2}
                max={1}
                step={0.05}
                onChange={(v) => setTheme({ bgBrightness: v })}
              />

              {/* 背景风格 */}
              <div>
                <div className="mb-1.5 text-xs text-white/70">背景风格</div>
                <select
                  value={theme.bgStyle}
                  onChange={(e) => setTheme({ bgStyle: e.target.value as BgStyle })}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
                >
                  {BG_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 预设 JSON 导出/导入 */}
              <div className="border-t border-white/10 pt-4">
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
            </div>
            </div>{/* /可滚动内容区 */}
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default ThemeConfigurator;
