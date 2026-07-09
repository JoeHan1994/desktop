import type { SVGProps } from 'react';

/** 简洁线性图标集（24×24 stroke），用于侧边栏导航。 */
const PATHS: Record<string, React.ReactNode> = {
	grid: (
		<>
			<rect x="3" y="3" width="7" height="7" rx="1.5" />
			<rect x="14" y="3" width="7" height="7" rx="1.5" />
			<rect x="3" y="14" width="7" height="7" rx="1.5" />
			<rect x="14" y="14" width="7" height="7" rx="1.5" />
		</>
	),
	inbox: (
		<>
			<path d="M22 12h-6l-2 3h-4l-2-3H2" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		</>
	),
	waveform: (
		<>
			<path d="M2 12h3l2-7 4 16 3-11 2 4h6" />
		</>
	),
	database: (
		<>
			<ellipse cx="12" cy="5" rx="9" ry="3" />
			<path d="M3 5v14a9 3 0 0 0 18 0V5" />
			<path d="M3 12a9 3 0 0 0 18 0" />
		</>
	),
	search: (
		<>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3" />
		</>
	),
	workflow: (
		<>
			<rect x="3" y="3" width="5" height="5" rx="1" />
			<rect x="16" y="3" width="5" height="5" rx="1" />
			<rect x="9.5" y="16" width="5" height="5" rx="1" />
			<path d="M5.5 8v3a1 1 0 0 0 1 1h5" />
			<path d="M18.5 8v3a1 1 0 0 1-1 1h-5m2.5 0v3" />
		</>
	),
	orbit: (
		<>
			<circle cx="12" cy="12" r="3" />
			<ellipse cx="12" cy="12" rx="10" ry="4.5" />
			<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)" />
		</>
	),
	chat: (
		<>
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
		</>
	),
	gear: (
		<>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
		</>
	),
	server: (
		<>
			<rect x="2" y="2" width="20" height="8" rx="2" />
			<rect x="2" y="14" width="20" height="8" rx="2" />
			<line x1="6" y1="6" x2="6.01" y2="6" />
			<line x1="6" y1="18" x2="6.01" y2="18" />
		</>
	),
	monitor: (
		<>
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M8 20h8" />
			<path d="M12 16v4" />
		</>
	),
	download: (
		<>
			<path d="M12 3v12" />
			<path d="m7 10 5 5 5-5" />
			<path d="M5 21h14" />
		</>
	),
	upload: (
		<>
			<path d="M12 21V9" />
			<path d="m7 14 5-5 5 5" />
			<path d="M5 3h14" />
		</>
	),
	plus: (
		<>
			<path d="M12 5v14" />
			<path d="M5 12h14" />
		</>
	),
	plug: (
		<>
			<path d="M12 22v-5" />
			<path d="M9 8V2" />
			<path d="M15 8V2" />
			<path d="M7 8h10v3a5 5 0 0 1-10 0V8z" />
		</>
	),
	'plug-off': (
		<>
			<path d="m3 3 18 18" />
			<path d="M12 22v-5" />
			<path d="M9 8V5" />
			<path d="M15 8V2" />
			<path d="M7 8h7" />
			<path d="M17 11a5 5 0 0 1-8.8 3.2" />
		</>
	),
	pencil: (
		<>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
		</>
	),
	trash: (
		<>
			<path d="M3 6h18" />
			<path d="M8 6V4h8v2" />
			<path d="M19 6l-1 14H6L5 6" />
			<path d="M10 11v5" />
			<path d="M14 11v5" />
		</>
	),
	play: (
		<>
			<path d="M8 5v14l11-7L8 5z" />
		</>
	),
	stop: (
		<>
			<rect x="6" y="6" width="12" height="12" rx="1.5" />
		</>
	),
	loader: (
		<>
			<path d="M12 2v4" />
			<path d="M12 18v4" />
			<path d="m4.93 4.93 2.83 2.83" />
			<path d="m16.24 16.24 2.83 2.83" />
			<path d="M2 12h4" />
			<path d="M18 12h4" />
			<path d="m4.93 19.07 2.83-2.83" />
			<path d="m16.24 7.76 2.83-2.83" />
		</>
	),
	copy: (
		<>
			<rect x="9" y="9" width="11" height="11" rx="2" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</>
	),
	check: (
		<>
			<path d="m20 6-11 11-5-5" />
		</>
	),
	x: (
		<>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</>
	),
};

export interface IconProps extends SVGProps<SVGSVGElement> {
	name: string;
}

export function Icon({ name, ...props }: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			{PATHS[name] ?? null}
		</svg>
	);
}

export default Icon;
