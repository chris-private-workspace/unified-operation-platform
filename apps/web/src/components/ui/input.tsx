import { cn } from '@/lib/utils';

// Rebuilt from design_handoff forms/Input.jsx — optional leading icon / trailing slot.
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function Input({ icon, trailing, className, ...props }: InputProps) {
  return (
    <div className="relative flex w-full items-center">
      {icon && (
        <span className="pointer-events-none absolute left-[10px] flex text-fg-subtle">
          {icon}
        </span>
      )}
      <input
        className={cn(
          'h-[34px] w-full rounded-lg border border-border bg-card text-[12.5px] text-fg outline-none placeholder:text-fg-subtle',
          icon ? 'pl-[32px]' : 'pl-[11px]',
          trailing ? 'pr-[34px]' : 'pr-[10px]',
          className,
        )}
        {...props}
      />
      {trailing && (
        <span className="absolute right-[8px] flex">{trailing}</span>
      )}
    </div>
  );
}
