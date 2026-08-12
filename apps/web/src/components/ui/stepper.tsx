import { Fragment } from 'react';
import { Check } from 'lucide-react';
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
        // CH-025 A — sitting on the LAST step means the path is finished, not
        // "in progress on the final stage". The ring says "we are working on
        // this"; a tick says "there is nothing after this". Without it a
        // completed line looked identical to one still being worked on.
        const isTerminal = isCurrent && i === steps.length - 1;
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
            {isTerminal ? (
              <span
                title={label}
                className="flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg"
              >
                <Check size={8} strokeWidth={3.5} />
              </span>
            ) : (
              <span
                title={label}
                className={cn(
                  'h-[11px] w-[11px] shrink-0 rounded-full border-2',
                  reached ? 'border-accent' : 'border-border-strong',
                  done ? 'bg-accent' : 'bg-card',
                  isCurrent && 'shadow-[0_0_0_3px_var(--accent-soft)]',
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
