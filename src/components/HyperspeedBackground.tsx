'use client';

import { type CSSProperties } from 'react';
import Galaxy from './Galaxy';
import { GALAXY_PRESETS } from './galaxyPresets';
import { useTheme } from '@/features/theme/ThemeContext';

/**
 * 全局动态背景包装。
 */
export function HyperspeedBackground() {
  const { theme } = useTheme();
  const hasCustomImage =
    typeof theme.bgImageDataUrl === 'string' &&
    theme.bgImageDataUrl.startsWith('data:image/');
  const imageStyle: CSSProperties = {
    backgroundImage: hasCustomImage ? `url(${theme.bgImageDataUrl})` : undefined,
    backgroundPosition: theme.bgImagePosition,
    backgroundRepeat: 'no-repeat',
    backgroundSize: theme.bgImageFit,
  };
  const galaxyPreset = GALAXY_PRESETS[theme.bgStyle];

  return (
    <div className="pointer-events-none absolute inset-0 z-0 bg-[#04060c]">
      {theme.bgEnabled && hasCustomImage ? (
        <div className="absolute inset-0 transition-opacity duration-300" style={imageStyle} />
      ) : (
        theme.bgEnabled && <Galaxy {...galaxyPreset} />
      )}
      {/* 背景明暗遮罩 */}
      <div
        className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: 1 - theme.bgBrightness }}
      />
    </div>
  );
}

export default HyperspeedBackground;
