import { cn } from '@/lib/utils';

// Rebuilt from design_handoff navigation/Tabs.jsx (spec, not copied). Underline
// tab bar for in-page filtering; active tab carries the accent underline, with
// an optional mono count pill after the label.
export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-[4px] border-b border-border', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-[7px] bg-transparent px-[12px] py-[9px] text-[12.5px]',
              active
                ? 'font-semibold text-fg'
                : 'font-medium text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  'rounded-pill px-[6px] font-mono text-[10.5px]',
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'bg-hover text-fg-subtle',
                )}
              >
                {t.count}
              </span>
            )}
            <span
              className={cn(
                'absolute bottom-[-1px] left-[8px] right-[8px] h-[2px] rounded-[2px]',
                active ? 'bg-accent' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
