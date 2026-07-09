import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff display/StatCard.jsx (spec, not copied). A KPI
// tile: label + tone-tinted icon chip, big value, optional delta pill, sub-line.
// tone only tints the icon chip; the value stays neutral (design-system.md §2).
// The big value is SANS (Geist 27/600/-.02em) per the prototype — mono is for
// inline identifiers / counts, not the hero KPI figure (verified vs prototype).
export type StatTone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral';

const CHIP: Record<StatTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
  delta?: ReactNode;
  sub?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'info',
  delta,
  sub,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[10px] rounded-2xl border border-border bg-card p-[16px] pb-[14px] shadow',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-fg-muted">{label}</span>
        <span
          className={cn(
            'flex h-[28px] w-[28px] items-center justify-center rounded-lg',
            CHIP[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-end gap-[8px]">
        <span className="text-[27px] font-semibold leading-none tracking-[-.02em]">
          {value}
        </span>
        {delta && (
          <span className="inline-flex items-center rounded-pill bg-ok-soft px-[7px] py-[1px] text-[10.5px] font-semibold text-ok">
            {delta}
          </span>
        )}
      </div>
      {sub && <span className="text-[11.5px] text-fg-subtle">{sub}</span>}
    </div>
  );
}
