import { cn } from '@/lib/utils';

// Rebuilt from design_handoff forms/IconButton.jsx — square bordered icon control.
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function IconButton({
  active,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border transition-colors disabled:cursor-not-allowed disabled:opacity-[0.55]',
        active ? 'bg-active text-fg' : 'cursor-pointer bg-card text-fg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
