'use client';

import { useMemo } from 'react';
import Hyperspeed from './Hyperspeed';
import { useTheme } from '@/features/theme/ThemeContext';

/**
 * 全局 Hyperspeed 背景包装。
 *
 * 从主题读取 distortion 预设（可在外观配置器中切换）；切换预设时重建光速隧道。
 */
export function HyperspeedBackground() {
  const { theme } = useTheme();
  const options = useMemo(
    () => ({ distortion: theme.bgStyle }),
    [theme.bgStyle]
  );

  return (
    <div className="absolute inset-0 -z-0 bg-[#04060c]">
      {theme.bgEnabled && <Hyperspeed effectOptions={options} />}
      {/* 背景明暗遮罩 */}
      <div
        className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: 1 - theme.bgBrightness }}
      />
    </div>
  );
}

export default HyperspeedBackground;
