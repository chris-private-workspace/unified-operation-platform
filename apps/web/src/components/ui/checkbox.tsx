import { cn } from '@/lib/utils';

// Rebuilt from design_handoff forms/Checkbox.jsx — native checkbox tinted with --accent
// (token-only via arbitrary property, DS-1), optional trailing label.
export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: React.ReactNode;
}

export function Checkbox({
  label,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  const box = (
    <input
      type="checkbox"
      disabled={disabled}
      className={cn(
        'h-[16px] w-[16px] cursor-pointer [accent-color:var(--accent)] disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
  if (!label) return box;
  return (
    <label
      className={cn(
        'flex items-center gap-[9px] text-[12.5px] text-fg',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      {box}
      {label}
    </label>
  );
}
