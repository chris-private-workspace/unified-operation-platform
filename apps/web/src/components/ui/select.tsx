import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff forms/Select.d.ts — a native <select> styled to
// match Input (same height / radius / tokens), with a lucide chevron. Native
// select keeps keyboard + a11y for free; used in the create-user dialog.
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative flex w-full items-center">
      <select
        className={cn(
          'h-[34px] w-full cursor-pointer appearance-none rounded-lg border border-border bg-card pl-[11px] pr-[30px] text-[12.5px] text-fg outline-none disabled:cursor-not-allowed disabled:opacity-[0.55]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2}
        className="pointer-events-none absolute right-[9px] text-fg-subtle"
      />
    </div>
  );
}
