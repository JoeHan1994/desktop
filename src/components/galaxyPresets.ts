import type { BgStyle } from '@/features/theme/ThemeContext';
import type { GalaxyProps } from '@/components/Galaxy';

export const GALAXY_STYLE_OPTIONS: { value: BgStyle; label: string }[] = [
  { value: 'deepDistortion', label: '深空 Deep Space' },
  { value: 'turbulentDistortion', label: '星云 Nebula' },
  { value: 'mountainDistortion', label: '暖辉 Amber' },
  { value: 'LongRaceDistortion', label: '流星 Comet' },
  { value: 'xyDistortion', label: '极光 Aurora' },
];

export const GALAXY_PRESETS: Record<BgStyle, Pick<GalaxyProps,
  | 'density'
  | 'glowIntensity'
  | 'hueShift'
  | 'rotation'
  | 'rotationSpeed'
  | 'saturation'
  | 'speed'
  | 'starSpeed'
  | 'twinkleIntensity'
>> = {
  deepDistortion: {
    density: 1,
    glowIntensity: 0.3,
    hueShift: 140,
    rotation: [1, 0],
    rotationSpeed: 0.1,
    saturation: 0,
    speed: 1,
    starSpeed: 0.5,
    twinkleIntensity: 0.3,
  },
  turbulentDistortion: {
    density: 1.25,
    glowIntensity: 0.42,
    hueShift: 220,
    rotation: [0.92, 0.38],
    rotationSpeed: 0.16,
    saturation: 0.28,
    speed: 1.25,
    starSpeed: 0.65,
    twinkleIntensity: 0.45,
  },
  mountainDistortion: {
    density: 0.85,
    glowIntensity: 0.34,
    hueShift: 80,
    rotation: [0.98, -0.2],
    rotationSpeed: 0.06,
    saturation: 0.18,
    speed: 0.82,
    starSpeed: 0.4,
    twinkleIntensity: 0.22,
  },
  LongRaceDistortion: {
    density: 1.45,
    glowIntensity: 0.36,
    hueShift: 180,
    rotation: [1, 0],
    rotationSpeed: 0.08,
    saturation: 0.12,
    speed: 1.55,
    starSpeed: 0.85,
    twinkleIntensity: 0.3,
  },
  xyDistortion: {
    density: 1.1,
    glowIntensity: 0.38,
    hueShift: 300,
    rotation: [0.7, 0.7],
    rotationSpeed: 0.12,
    saturation: 0.35,
    speed: 1.05,
    starSpeed: 0.55,
    twinkleIntensity: 0.38,
  },
};