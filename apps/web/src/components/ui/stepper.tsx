import { Fragment } from 'react';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff navigation/Stepper.jsx (spec, not copied). Compact
// per-line-item stage progress: 11px dots joined by 26px rules. Reached dots use
// accent; the current dot gets a soft accent ring; future dots use border-strong.
export interface StepperProps {
  /** Ordered step labels (used as dot titles). */
  steps: string[];
  /** Current stage name (matched against steps) or its index. */
  current: number | string;
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  const currentIdx =
    typeof current === 'number' ? current : steps.indexOf(current);
  return (
    <div className={cn('flex items-center', className)}>
      {steps.map((label, i) => {
        const reached = i <= currentIdx;
        const done = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <Fragment key={label + i}>
            {i > 0 && (
              <div
                className={cn(
                  'h-[2px] w-[26px]',
                  reached ? 'bg-accent' : 'bg-border-strong',
                )}
              />
            )}
            <span
              title={label}
              className={cn(
                'h-[11px] w-[11px] shrink-0 rounded-full border-2',
                reached ? 'border-accent' : 'border-border-strong',
                done ? 'bg-accent' : 'bg-card',
                isCurrent && 'shadow-[0_0_0_3px_var(--accent-soft)]',
              )}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
