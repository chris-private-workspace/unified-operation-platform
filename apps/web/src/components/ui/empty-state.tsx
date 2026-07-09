import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff feedback/EmptyState.jsx (spec, not copied).
// Centered zero-data / all-clear message for a card or table body: tone-tinted
// icon chip + title + optional description + optional action. Used for both
// all-clear ("no drift") and no-endpoint-yet states (FE-1 honest-data rule).
export type EmptyTone = 'ok' | 'neutral' | 'info' | 'danger';

const CHIP: Record<EmptyTone, string> = {
  ok: 'bg-ok-soft text-ok',
  neutral: 'bg-hover text-fg-subtle',
  info: 'bg-info-soft text-info',
  danger: 'bg-danger-soft text-danger',
};

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: EmptyTone;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-[10px] px-[24px] py-[40px] text-center',
        className,
      )}
    >
      {icon && (
        // 11px chip radius mirrors the handoff spec exactly (one-off, not a token).
        <span
          className={cn(
            'flex h-[40px] w-[40px] items-center justify-center rounded-[11px]',
            CHIP[tone],
          )}
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-[340px] flex-col gap-[3px]">
        <span className="text-[13.5px] font-semibold text-fg">{title}</span>
        {description && (
          <span className="text-[12px] leading-[1.5] text-fg-subtle">
            {description}
          </span>
        )}
      </div>
      {action && <div className="mt-[4px]">{action}</div>}
    </div>
  );
}
