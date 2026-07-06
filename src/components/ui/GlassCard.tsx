'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface GlassCardProps {
  /** 卡片标题 */
  title?: string;
  /** 副标题 / 英文标签 */
  subtitle?: string;
  /** 右上角徽标（如阶段编号） */
  badge?: ReactNode;
  /** 入场动画的序号，用于错峰延迟 */
  index?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * 可复用的液态玻璃卡片。
 *
 * 统一的毛玻璃容器：半透明渐变 + `backdrop-blur` + 内嵌描边 + 顶部高光 + 柔和内发光，
 * 配合 Framer Motion 错峰入场，作为所有仪表盘控件的视觉底座。
 */
export function GlassCard({
  title,
  subtitle,
  badge,
  index = 0,
  className = '',
  children,
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 130,
        damping: 18,
        delay: index * 0.06,
      }}
      className={`glass app-card relative overflow-hidden ${className}`}
    >
      {/* 顶部高光描边（玻璃厚度感） */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      {/* 柔和内发光（中性） */}
      <div className="app-card-glow pointer-events-none absolute -top-16 right-0 h-32 w-32 rounded-full blur-3xl" />

      <div className="relative p-5">
        {(title || badge) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              {title && (
                <h3 className="text-sm font-semibold tracking-wide text-white">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/40">
                  {subtitle}
                </p>
              )}
            </div>
            {badge}
          </div>
        )}
        {children}
      </div>
    </motion.div>
  );
}

export default GlassCard;
