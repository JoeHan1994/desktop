'use client';

import { useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { NAV_ITEMS, type NavKey } from './navConfig';
import { DashboardView } from '../../features/dashboard/DashboardView';
import { PlaceholderView } from '../../features/placeholder/PlaceholderView';

const TOPBAR_META: Record<NavKey, { title: string; subtitle: string }> = {
	overview: { title: '概览', subtitle: '工作台 / 概览' },
	pipeline: { title: '数据管线', subtitle: '工作台 / 数据管线' },
	knowledge: { title: '知识库', subtitle: '工作台 / 知识库' },
	assistant: { title: '智能助手', subtitle: '系统 / 智能助手' },
	settings: { title: '设置', subtitle: '系统 / 设置' },
};

const PLACEHOLDER_COPY: Record<Exclude<NavKey, 'overview'>, string> = {
	pipeline: '在此编排文档摄取、切分与向量化流程，支持增量与全量重建。',
	knowledge: '集中管理知识库集合、元数据与访问权限。',
	assistant: '基于检索增强生成的对话助手，将在此提供问答与引用溯源。',
	settings: '模型供应商、数据库与接口凭据的统一配置中心。',
};

/** V2 应用外壳：侧边栏 + 顶栏 + 内容区，管理当前激活模块。 */
export function AppShell() {
	const [active, setActive] = useState<NavKey>('overview');

	const content = useMemo(() => {
		if (active === 'overview') return <DashboardView />;
		const nav = NAV_ITEMS.find((item) => item.key === active)!;
		const Icon = nav.icon;
		return (
			<PlaceholderView
				title={nav.label}
				description={PLACEHOLDER_COPY[active]}
				icon={<Icon width={26} height={26} />}
			/>
		);
	}, [active]);

	const meta = TOPBAR_META[active];

	return (
		<div className="v2-shell">
			<Sidebar active={active} onNavigate={setActive} />
			<div className="v2-shell__main">
				<Topbar title={meta.title} subtitle={meta.subtitle} />
				<div className="v2-shell__content">{content}</div>
			</div>
		</div>
	);
}
