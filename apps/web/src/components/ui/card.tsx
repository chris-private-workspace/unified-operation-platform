import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff display/Card.jsx (spec, not copied). The console's
// surface primitive: 1px border + 12px radius + resting shadow, optional header
// with a hairline divider. Depth via border + tint, no blur (DS-7).
export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

export function Card({
  title,
  subtitle,
  action,
  padded = true,
  className,
  bodyClassName,
  children,
}: CardProps) {
  const hasHeader = Boolean(title || action);
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card shadow',
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-[12px] border-b border-border px-[16px] py-[14px]">
          <div className="flex flex-col leading-[1.25]">
            {title && (
              <h2 className="m-0 text-[13.5px] font-semibold">{title}</h2>
            )}
            {subtitle && (
              <span className="text-[11.5px] text-fg-subtle">{subtitle}</span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={cn(padded && 'p-[16px]', bodyClassName)}>{children}</div>
    </div>
  );
}
