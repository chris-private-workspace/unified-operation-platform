import { cn } from '@/lib/utils';

// Rebuilt from design_handoff navigation/NavItem.jsx — sidebar row.
export interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  count?: number | null;
  countTone?: 'neutral' | 'danger';
  collapsed?: boolean;
  disabled?: boolean;
  soon?: boolean;
  onClick?: () => void;
}

export function NavItem({
  icon,
  label,
  active,
  count,
  countTone = 'neutral',
  collapsed,
  disabled,
  soon,
  onClick,
}: NavItemProps) {
  return (
    <a
      onClick={disabled ? undefined : onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'relative flex items-center gap-[10px] rounded-lg text-[13px] no-underline',
        collapsed
          ? 'justify-center p-[8px]'
          : 'justify-start px-[10px] py-[8px]',
        active
          ? 'bg-active font-semibold text-fg'
          : 'font-medium text-fg-muted',
        disabled
          ? 'cursor-not-allowed text-fg-subtle opacity-60'
          : 'cursor-pointer',
      )}
    >
      <span className="flex shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && soon && (
        <span className="rounded-pill border border-border px-[6px] text-[9.5px] font-semibold uppercase tracking-[.03em] text-fg-subtle">
          Soon
        </span>
      )}
      {!collapsed && count != null && (
        <span
          className={cn(
            'rounded-pill px-[6px] font-mono text-[11px]',
            countTone === 'danger'
              ? 'bg-danger-soft text-danger'
              : 'bg-hover text-fg-subtle',
          )}
        >
          {count}
        </span>
      )}
    </a>
  );
}
