import { cn } from '../../lib/cn';
import { NAV_ITEMS, type NavKey } from './navConfig';

interface SidebarProps {
	active: NavKey;
	onNavigate: (key: NavKey) => void;
}

/** V2 侧边栏：品牌区 + 分组导航。 */
export function Sidebar({ active, onNavigate }: SidebarProps) {
	const groups = Array.from(new Set(NAV_ITEMS.map((item) => item.group)));

	return (
		<aside className="v2-sidebar">
			<div className="v2-sidebar__brand">
				<span className="v2-sidebar__logo">TF</span>
				<div className="v2-col">
					<span className="v2-subtitle">TerraForge</span>
					<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
						Version 2
					</span>
				</div>
			</div>

			{groups.map((group) => (
				<div key={group}>
					<div className="v2-sidebar__section">{group}</div>
					<nav className="v2-stack-2">
						{NAV_ITEMS.filter((item) => item.group === group).map((item) => {
							const Icon = item.icon;
							return (
								<button
									key={item.key}
									type="button"
									onClick={() => onNavigate(item.key)}
									className={cn('v2-nav-item', active === item.key && 'v2-nav-item--active')}
								>
									<span className="v2-nav-item__icon">
										<Icon />
									</span>
									<span>{item.label}</span>
								</button>
							);
						})}
					</nav>
				</div>
			))}

			<div className="v2-sidebar__spacer" />

			<div className="v2-surface-block v2-stack-2">
				<span className="v2-eyebrow">存储用量</span>
				<div
					style={{
						height: 6,
						borderRadius: 'var(--v2-radius-full)',
						background: 'var(--v2-surface-3)',
						overflow: 'hidden',
					}}
				>
					<div
						style={{
							width: '64%',
							height: '100%',
							background: 'linear-gradient(90deg, var(--v2-brand-400), var(--v2-brand-600))',
						}}
					/>
				</div>
				<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
					6.4 / 10 GB 已使用
				</span>
			</div>
		</aside>
	);
}
