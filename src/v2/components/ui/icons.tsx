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

export function IconChat(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
		</svg>
	);
}

export function IconServer(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="3" y="4" width="18" height="7" rx="2" />
			<rect x="3" y="13" width="18" height="7" rx="2" />
			<path d="M7 7.5h.01M7 16.5h.01" />
		</svg>
	);
}

export function IconUpload(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<path d="M17 8l-5-5-5 5M12 3v12" />
		</svg>
	);
}

export function IconDownload(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<path d="M7 10l5 5 5-5M12 15V3" />
		</svg>
	);
}

export function IconKey(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="7.5" cy="15.5" r="4.5" />
			<path d="m10.7 12.3 8.3-8.3M16 6l3 3M14 8l3 3" />
		</svg>
	);
}

export function IconEye(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

export function IconEyeOff(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.4 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.6 6.6A13.34 13.34 0 0 0 2 11s3.6 7 10 7a9.12 9.12 0 0 0 5.4-1.6" />
			<path d="M14.12 14.12A3 3 0 1 1 9.88 9.88M2 2l20 20" />
		</svg>
	);
}

export function IconPlay(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M6 4.5v15l13-7.5-13-7.5Z" />
		</svg>
	);
}

export function IconTerminal(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="m7 9 3 3-3 3M13 15h4" />
		</svg>
	);
}

export function IconTrash(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
		</svg>
	);
}

export function IconEdit(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
		</svg>
	);
}

export function IconFilter(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
		</svg>
	);
}

export function IconRefresh(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
		</svg>
	);
}

export function IconCheck(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}

export function IconX(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M18 6 6 18M6 6l12 12" />
		</svg>
	);
}

export function IconShield(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
		</svg>
	);
}

export function IconCpu(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="6" y="6" width="12" height="12" rx="2" />
			<path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
		</svg>
	);
}

export function IconFile(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M14 3v5h5" />
			<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" />
		</svg>
	);
}

export function IconZoomIn(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
		</svg>
	);
}

export function IconZoomOut(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3M8 11h6" />
		</svg>
	);
}

export function IconChevronRight(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="m9 6 6 6-6 6" />
		</svg>
	);
}

export function IconChevronDown(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="m6 9 6 6 6-6" />
		</svg>
	);
}

export function IconTarget(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="8" />
			<circle cx="12" cy="12" r="4" />
			<circle cx="12" cy="12" r="0.5" />
		</svg>
	);
}

export function IconPower(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 2v10" />
			<path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
		</svg>
	);
}

export function IconFolder(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M4 4h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
		</svg>
	);
}

export function IconMonitor(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="2" y="3" width="20" height="14" rx="2" />
			<path d="M8 21h8M12 17v4" />
		</svg>
	);
}

export function IconSave(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
			<path d="M17 21v-8H7v8M7 3v5h8" />
		</svg>
	);
}

export function IconLink(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
			<path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
		</svg>
	);
}
