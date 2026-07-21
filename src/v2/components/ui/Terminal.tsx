import { cn } from '../../lib/cn';

export interface TerminalLine {
	id: string | number;
	text: string;
	/** out=stdout(绿) err=stderr(红) sys=状态(蓝) prompt=命令行(紫) */
	stream?: 'out' | 'err' | 'sys' | 'prompt';
}

interface TerminalWindowProps {
	title?: string;
	lines: TerminalLine[];
	className?: string;
	/** 空态占位文本。 */
	placeholder?: string;
}

/** 内嵌终端窗口（TerminalWindow）：凹陷深色容器 + 交通灯栏。 */
export function TerminalWindow({ title = 'session', lines, className, placeholder }: TerminalWindowProps) {
	return (
		<div className={cn('v2-terminal', className)}>
			<div className="v2-terminal__bar">
				<span className="v2-terminal__dot" style={{ background: '#ff5f56' }} />
				<span className="v2-terminal__dot" style={{ background: '#ffbd2e' }} />
				<span className="v2-terminal__dot" style={{ background: '#27c93f' }} />
				<span className="v2-terminal__title">{title}</span>
			</div>
			<div className="v2-terminal__body">
				{lines.length === 0 && placeholder ? (
					<div className="v2-terminal__line" style={{ opacity: 0.5 }}>
						{placeholder}
					</div>
				) : (
					lines.map((l) => (
						<div
							key={l.id}
							className={cn('v2-terminal__line', l.stream && `v2-terminal__line--${l.stream}`)}
						>
							{l.stream === 'prompt' && <span className="v2-terminal__prompt">$ </span>}
							{l.text}
						</div>
					))
				)}
			</div>
		</div>
	);
}
