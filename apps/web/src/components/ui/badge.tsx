import type { ReactNode } from 'react';
import { TONE_SOFT, type BadgeTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff display/Badge.jsx (spec, not copied). The console's
// universal state marker — soft-tinted pill + matching text, optional leading
// dot. Stage → tone mapping lives with callers (design-system.md §2, DS-8).
// The tint scale itself lives in lib/tones so other surfaces share one table.
export type { BadgeTone };

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
        TONE_SOFT[tone],
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
