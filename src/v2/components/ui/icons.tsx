import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
	width: 18,
	height: 18,
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.8,
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
};

/** 轻量线性图标集（stroke=currentColor，继承文本色）。 */
export function IconDashboard(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="3" y="3" width="7" height="9" rx="1.5" />
			<rect x="14" y="3" width="7" height="5" rx="1.5" />
			<rect x="14" y="12" width="7" height="9" rx="1.5" />
			<rect x="3" y="16" width="7" height="5" rx="1.5" />
		</svg>
	);
}

export function IconLayers(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="m12 3 9 5-9 5-9-5 9-5Z" />
			<path d="m3 13 9 5 9-5" />
		</svg>
	);
}

export function IconSpark(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
		</svg>
	);
}

export function IconDatabase(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<ellipse cx="12" cy="5" rx="8" ry="3" />
			<path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
			<path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
		</svg>
	);
}

export function IconSettings(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.61.76 1.03 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
		</svg>
	);
}

export function IconSearch(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3" />
		</svg>
	);
}

export function IconBell(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
			<path d="M13.7 21a2 2 0 0 1-3.4 0" />
		</svg>
	);
}

export function IconSun(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		</svg>
	);
}

export function IconMoon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
		</svg>
	);
}

export function IconPlus(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}
