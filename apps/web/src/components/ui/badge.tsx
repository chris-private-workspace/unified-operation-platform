import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff display/Badge.jsx (spec, not copied). The console's
// universal state marker — soft-tinted pill + matching text, optional leading
// dot. Stage → tone mapping lives with callers (design-system.md §2, DS-8).
export type BadgeTone =
  'ok' | 'warn' | 'info' | 'danger' | 'neutral' | 'purple';

const TONE: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
  purple: 'bg-purple-soft text-purple',
};

const DOT: Record<BadgeTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  info: 'bg-info',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  purple: 'bg-purple',
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[9px] py-[2px] text-[11.5px] font-semibold leading-[18px]',
        TONE[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-[6px] w-[6px] shrink-0 rounded-full', DOT[tone])}
        />
      )}
      {children}
    </span>
  );
}
