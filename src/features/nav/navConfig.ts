export type ViewId = 'assistant' | 'rag' | 'knowledge' | 'settings' | 'remote';

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
      { id: 'assistant', label: 'AI 对话',  en: 'Chat',      icon: 'chat'     },
      { id: 'rag',       label: 'RAG 检索', en: 'RAG',       icon: 'workflow' },
      { id: 'knowledge', label: 'Knowledge Base Manager', en: 'Knowledge', icon: 'database' },
      { id: 'remote',    label: '远程机器', en: 'Remote',    icon: 'server'   },
      { id: 'settings',  label: '设置',     en: 'Settings',  icon: 'gear'     },
    ],
  },
];
