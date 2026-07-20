import type { ComponentType, SVGProps } from 'react';
import { IconDashboard, IconDatabase, IconLayers, IconSettings, IconSpark } from '../ui/icons';

export type NavKey = 'overview' | 'pipeline' | 'knowledge' | 'assistant' | 'settings';

export interface NavItem {
	key: NavKey;
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	group: string;
}

/** V2 侧边栏导航配置。 */
export const NAV_ITEMS: NavItem[] = [
	{ key: 'overview', label: '概览', icon: IconDashboard, group: '工作台' },
	{ key: 'pipeline', label: '数据管线', icon: IconLayers, group: '工作台' },
	{ key: 'knowledge', label: '知识库', icon: IconDatabase, group: '工作台' },
	{ key: 'assistant', label: '智能助手', icon: IconSpark, group: '系统' },
	{ key: 'settings', label: '设置', icon: IconSettings, group: '系统' },
];
