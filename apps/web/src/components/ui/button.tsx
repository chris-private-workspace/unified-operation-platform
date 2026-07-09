import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Rebuilt from design_handoff forms/Button.jsx (spec, not copied). Colors /
// radius / font via tokens; control dims mirror the spec exactly (DS-1/DS-2).
const button = cva(
  'inline-flex cursor-pointer items-center justify-center gap-[7px] whitespace-nowrap font-sans transition-[filter,background] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-[0.55]',
  {
    variants: {
      variant: {
        primary:
          'border border-transparent bg-accent font-semibold text-accent-fg',
        secondary: 'border border-border bg-card font-medium text-fg',
        ghost:
          'border border-transparent bg-transparent font-medium text-fg-muted',
        danger:
          'border border-transparent bg-danger-soft font-medium text-danger',
      },
      size: {
        sm: 'h-[28px] rounded-md px-[11px] text-[11.5px]',
        md: 'h-[34px] rounded-lg px-[14px] text-[12.5px]',
        lg: 'h-[36px] rounded-lg px-[16px] text-[13.5px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  icon?: React.ReactNode;
}

export function Button({
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(button({ variant, size }), className)} {...props}>
      {icon}
      {children}
    </button>
  );
}
