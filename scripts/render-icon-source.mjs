// 将 source.svg 渲染为 1024×1024 PNG，供 `tauri icon` 生成全部尺寸
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');
const svg = readFileSync(join(iconsDir, 'source.svg'));

await sharp(svg, { density: 384 })
	.resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
	.png()
	.toFile(join(iconsDir, 'source.png'));

console.log('source.png (1024×1024) generated');
