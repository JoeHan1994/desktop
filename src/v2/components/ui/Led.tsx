import { cn } from '../../lib/cn';

export type LedTone = 'idle' | 'ssh' | 'rdp' | 'warn' | 'danger' | 'vector';

/** 状态指示 LED（CertificateBadge / 表格状态灯）。 */
export function Led({ tone = 'idle', className }: { tone?: LedTone; className?: string }) {
	return <span className={cn('v2-led', tone !== 'idle' && `v2-led--${tone}`, className)} />;
}
