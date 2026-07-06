'use client';

import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/* 状态点                                                              */
/* ------------------------------------------------------------------ */

export type StatusTone = 'online' | 'busy' | 'idle' | 'error';

const TONE: Record<StatusTone, string> = {
  online: 'bg-emerald-400',
  busy: 'bg-sky-400',
  idle: 'bg-white/40',
  error: 'bg-rose-400',
};

export function StatusDot({
  tone = 'online',
  label,
}: {
  tone?: StatusTone;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${TONE[tone]}`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${TONE[tone]}`} />
      </span>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 徽标                                                                */
/* ------------------------------------------------------------------ */

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="glass glass-chip px-2 py-0.5 text-[11px]">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 指标数值                                                            */
/* ------------------------------------------------------------------ */

export function Metric({
  value,
  unit,
  label,
}: {
  value: string | number;
  unit?: string;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold tabular-nums text-white">
          {value}
        </span>
        {unit && <span className="text-xs text-white/45">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-white/45">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 进度条                                                              */
/* ------------------------------------------------------------------ */

export function ProgressBar({
  value,
  tone = 'sky',
}: {
  /** 0 - 100 */
  value: number;
  tone?: 'sky' | 'emerald' | 'violet';
}) {
  const bg =
    tone === 'emerald'
      ? 'linear-gradient(90deg,#6ee7b7,#2dd4bf)'
      : tone === 'violet'
        ? 'linear-gradient(90deg,#c4b5fd,#e879f9)'
        : 'linear-gradient(90deg, rgb(var(--accent-rgb)), rgb(var(--accent-rgb) / 0.5))';
  return (
    <div className="glass-track h-1.5 w-full overflow-hidden rounded-full">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        style={{ background: bg }}
        className="h-full rounded-full"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 迷你折线图（Sparkline）                                             */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  color = 'rgba(255,255,255,0.72)',
  width = 120,
  height = 32,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = height - ((d - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={
          height - ((data[data.length - 1] - min) / span) * (height - 4) - 2
        }
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 得分条（用于 Top-K 距离得分）                                       */
/* ------------------------------------------------------------------ */

export function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 truncate text-[11px] text-white/45">
        {label}
      </span>
      <div className="glass-track h-1.5 flex-1 overflow-hidden rounded-full">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            background:
              'linear-gradient(90deg, rgb(var(--accent-rgb)), rgb(var(--accent-rgb) / 0.5))',
          }}
          className="h-full rounded-full"
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/60">
        {score.toFixed(2)}
      </span>
    </div>
  );
}
