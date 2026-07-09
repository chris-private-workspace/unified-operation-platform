import { cn } from '@/lib/utils';

// Rebuilt from design_handoff forms/SegmentedControl.jsx — 2–3 exclusive options.
export interface SegmentedControlProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex gap-[2px] rounded-lg border border-border bg-card p-[2px]">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-md px-[13px] font-sans',
              size === 'sm' ? 'h-[26px] text-[11px]' : 'h-[30px] text-[12px]',
              active
                ? 'bg-accent font-semibold text-accent-fg'
                : 'font-medium text-fg-muted',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
