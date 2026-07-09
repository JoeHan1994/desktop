'use client';

import { motion } from 'framer-motion';

/**
 * 3D 悬浮标题。
 *
 * 通过 CSS 透视（perspective）+ `rotateX` 倾斜 + 分层立体文字阴影模拟挤出（extrusion）
 * 的 3D 质感，并用 Framer Motion 让标题在空间中持续上下悬浮，与液态玻璃场景呼应。
 */
export function HeroTitle() {
	return (
		<div className="text-center [perspective:900px]">
			<motion.h1
				initial={{ opacity: 0, y: 24, rotateX: 30 }}
				animate={{ opacity: 1, y: [0, -10, 0], rotateX: 8 }}
				transition={{
					opacity: { duration: 0.9, ease: 'easeOut' },
					rotateX: { duration: 0.9, ease: 'easeOut' },
					y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
				}}
				style={{
					transformStyle: 'preserve-3d',
					textShadow: '0 1px 0 rgba(255,255,255,0.35), 0 2px 8px rgba(0,0,0,0.45), 0 0 48px rgba(255,255,255,0.14)',
				}}
				className="select-none bg-gradient-to-b from-white to-white/70 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl"
			>
				MyToolBox
			</motion.h1>

			<motion.p
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: [0, -6, 0] }}
				transition={{
					opacity: { duration: 0.9, delay: 0.2, ease: 'easeOut' },
					y: { duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
				}}
				style={{ textShadow: '0 2px 14px rgba(0,0,0,0.4)' }}
				className="mt-3 select-none text-white/55"
			>
				3D 液态玻璃向量数据库可视化看板
			</motion.p>
		</div>
	);
}

export default HeroTitle;
