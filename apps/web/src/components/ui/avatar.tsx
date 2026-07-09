import { cn } from '@/lib/utils';

export interface AvatarProps {
  name?: string;
  size?: number;
  variant?: 'brand' | 'muted';
  className?: string;
}

// Rebuilt from design_handoff display/Avatar.jsx.
// NOTE(H6 flag): the handoff 'brand' variant uses a gradient ending in a
// non-token hex (#8a0018) — reproduced 1:1 for fidelity, but it conflicts with
// design-system.md DS-7 ("only login has a gradient"). Flagged for owner review.
export function Avatar({
  name = '',
  size = 30,
  variant = 'muted',
  className,
}: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const brand = variant === 'brand';
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        brand ? 'text-white' : 'bg-hover text-fg-muted',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        ...(brand
          ? { background: 'linear-gradient(135deg,var(--accent),#8a0018)' }
          : {}),
      }}
    >
      {initials}
    </div>
  );
}
