export type ViewId = 'assistant' | 'settings';

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
      { id: 'assistant', label: 'AI 对话', en: 'Chat',     icon: 'chat' },
      { id: 'settings',  label: '设置',    en: 'Settings', icon: 'gear' },
    ],
  },
];
