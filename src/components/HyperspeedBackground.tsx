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
	const isMinimalLight = theme.backgroundTheme === 'minimalLight';
	const hasCustomImage = typeof theme.bgImageDataUrl === 'string' && theme.bgImageDataUrl.startsWith('data:image/');
	const imageStyle: CSSProperties = {
		backgroundImage: hasCustomImage ? `url(${theme.bgImageDataUrl})` : undefined,
		backgroundPosition: theme.bgImagePosition,
		backgroundRepeat: 'no-repeat',
		backgroundSize: theme.bgImageFit,
	};
	const galaxyPreset = GALAXY_PRESETS[theme.bgStyle];

	if (isMinimalLight) {
		return (
			<div className="pointer-events-none absolute inset-0 z-0 bg-[rgb(var(--background))]">
				{theme.bgEnabled && (
					<>
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(37,99,235,0.12),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(20,184,166,0.1),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f8fafc_42%,#eef2f7_100%)]" />
						<div
							className="absolute inset-0 opacity-[0.42]"
							style={{
								backgroundImage:
									'linear-gradient(rgba(15,23,42,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.055) 1px, transparent 1px)',
								backgroundSize: '44px 44px',
							}}
						/>
					</>
				)}
				<div
					className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-300"
					style={{ opacity: Math.max(0, 1 - theme.bgBrightness) * 0.68 }}
				/>
			</div>
		);
	}

	return (
		<div className="pointer-events-none absolute inset-0 z-0 bg-[#04060c]">
			{theme.bgEnabled && hasCustomImage ? (
				<div className="absolute inset-0 transition-opacity duration-300" style={imageStyle} />
			) : (
				theme.bgEnabled && <Galaxy {...galaxyPreset} mouseInteraction={false} />
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
