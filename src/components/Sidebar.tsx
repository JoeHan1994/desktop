'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { NAV_GROUPS, type ViewId } from '@/features/nav/navConfig';

export interface SidebarProps {
  active: ViewId;
  onSelect: (id: ViewId) => void;
}

/**
 * 每个导航项独立占一个圆形玻璃块，仅显示图标，激活项带强调色光晕。
 */
export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.title} className="flex flex-col items-center gap-2">
          {/* 组间分隔线 */}
          {gi > 0 && (
            <div className="my-0.5 h-px w-6 rounded-full bg-white/[0.08]" />
          )}
          {group.items.map((item) => {
            const isActive = item.id === active;
            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                title={item.label}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors
                  ${
                    isActive
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/75'
                  }`}
                style={{
                  background: isActive
                    ? 'rgb(var(--glass-rgb) / 0.16)'
                    : 'rgb(255 255 255 / 0.05)',
                  border: isActive
                    ? '1px solid rgb(var(--accent-rgb) / 0.5)'
                    : '1px solid rgb(255 255 255 / 0.08)',
                  backdropFilter: 'blur(16px) saturate(1.4)',
                  WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
                  boxShadow: isActive
                    ? '0 0 16px rgb(var(--accent-rgb) / 0.28), inset 0 1px 0 rgb(255 255 255 / 0.1)'
                    : 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-ring"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'rgb(var(--accent-rgb) / 0.10)' }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  />
                )}
                <Icon name={item.icon} className="relative z-10 h-4 w-4" />
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default Sidebar;

