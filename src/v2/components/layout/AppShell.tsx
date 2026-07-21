'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { type NavKey } from './navConfig';
import { RemoteMachineModule } from '../modules/RemoteMachineModule';
import { RagManageModule } from '../modules/RagManageModule';
import { SettingsModule } from '../modules/SettingsModule';

const TOPBAR_META: Record<NavKey, { title: string; subtitle: string }> = {
	remote: { title: '远程机器管理', subtitle: '基础设施 / 远程机器' },
	rag: { title: 'RAG 知识库与向量可视化', subtitle: 'AI 引擎 / RAG 知识库' },
	settings: { title: '系统设置', subtitle: '配置 / 系统设置' },
};

/**
 * V2 应用外壳：侧边栏 + 顶栏 + 内容区（Bento × 新拟态）。
 *
 * 内容区根据当前导航渲染三大功能模块，逻辑层复用 src/v2 下的
 * services / hooks / features（domain·application）。
 */
export function AppShell() {
	const [active, setActive] = useState<NavKey>('remote');
	const meta = TOPBAR_META[active];

	return (
		<div className="v2-shell">
			<Sidebar active={active} onNavigate={setActive} />
			<div className="v2-shell__main">
				<Topbar title={meta.title} subtitle={meta.subtitle} />
				<div className="v2-shell__content">
					<div className="v2-animate-in" key={active} data-v2-module={active}>
						{active === 'remote' && <RemoteMachineModule />}
						{active === 'rag' && <RagManageModule />}
						{active === 'settings' && <SettingsModule />}
					</div>
				</div>
			</div>
		</div>
	);
}

