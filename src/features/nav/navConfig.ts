export type ViewId = 'assistant' | 'rag' | 'settings' | 'remote' | 'vectordb' | 'ingestion-pipeline';

export interface NavItem {
	id: ViewId;
	label: string;
	en: string;
	icon: string;
}

export interface NavGroup {
	title: string;
	items: NavItem[];
}

/**
 * 侧边栏导航配置。
 */
export const NAV_GROUPS: NavGroup[] = [
	{
		title: '系统',
		items: [
			{ id: 'assistant', label: 'AI 对话', en: 'Chat', icon: 'chat' },
			{ id: 'rag', label: 'RAG 检索', en: 'RAG', icon: 'workflow' },
			{ id: 'remote', label: '远程机器', en: 'Remote', icon: 'server' },
			{ id: 'settings', label: '设置', en: 'Settings', icon: 'gear' },
		],
	},
	{
		title: '数据',
		items: [
			{ id: 'vectordb', label: '向量数据库', en: 'VectorDB', icon: 'layers' },
			{ id: 'ingestion-pipeline', label: '文档预处理', en: 'Pipeline', icon: 'flow' },
		],
	},
];
