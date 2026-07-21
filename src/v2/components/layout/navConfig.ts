import type { ComponentType, SVGProps } from 'react';
import { IconDatabase, IconServer, IconSettings } from '../ui/icons';

export type NavKey = 'remote' | 'rag' | 'settings';

export interface NavItem {
	key: NavKey;
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	group: string;
}

/**
 * V2 侧边栏导航配置（对应设计说明书的三大功能模块）：
 *   remote   → Remote Machine Management（协议 / 脚本 / 证书）
 *   rag      → RAG Knowledge Base & Chunk Visualizer
 *   settings → System Settings（模型 / 数据库 / 系统）
 */
export const NAV_ITEMS: NavItem[] = [
	{ key: 'remote', label: '远程机器', icon: IconServer, group: '基础设施' },
	{ key: 'rag', label: 'RAG 知识库', icon: IconDatabase, group: 'AI 引擎' },
	{ key: 'settings', label: '系统设置', icon: IconSettings, group: '配置' },
];
