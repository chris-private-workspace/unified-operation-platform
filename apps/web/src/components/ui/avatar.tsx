import { cn } from '@/lib/utils';

export interface AvatarProps {
  name?: string;
  size?: number;
  variant?: 'brand' | 'muted';
  className?: string;
}

// Rebuilt from design_handoff display/Avatar.jsx.
// The 'brand' variant's gradient (accent → accent-deep) is an owner-approved
// DS-7 exception: login + Avatar are the two legit gradients. The handoff's
// hardcoded #8a0018 is tokenized as --accent-deep (index.css). See DS-7.
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
          ? {
              background:
                'linear-gradient(135deg,var(--accent),var(--accent-deep))',
            }
          : {}),
      }}
    >
      {initials}
    </div>
  );
}
