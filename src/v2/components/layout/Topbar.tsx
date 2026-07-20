import { Button } from '../ui/Button';
import { IconBell, IconMoon, IconSearch, IconSun } from '../ui/icons';
import { useV2Theme } from '../../features/theme/ThemeContext';

interface TopbarProps {
	title: string;
	subtitle?: string;
}

/** V2 顶栏：页面标题 + 搜索 + 主题切换 + 用户区。 */
export function Topbar({ title, subtitle }: TopbarProps) {
	const { theme, toggle } = useV2Theme();

	return (
		<header className="v2-topbar">
			<div className="v2-col">
				<span className="v2-subtitle">{title}</span>
				{subtitle && (
					<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
						{subtitle}
					</span>
				)}
			</div>

			<div className="v2-row">
				<div className="v2-topbar__search">
					<IconSearch width={16} height={16} />
					<input placeholder="搜索模块、文档或指令…" aria-label="搜索" />
				</div>
				<Button variant="ghost" iconOnly aria-label="切换主题" onClick={toggle}>
					{theme === 'dark' ? <IconSun /> : <IconMoon />}
				</Button>
				<Button variant="ghost" iconOnly aria-label="通知">
					<IconBell />
				</Button>
				<span className="v2-avatar">HQ</span>
			</div>
		</header>
	);
}
