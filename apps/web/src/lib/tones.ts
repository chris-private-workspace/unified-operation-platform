// The console's semantic tint scale (design-system.md §2, DS-8). Lives in lib/
// rather than beside Badge so components other than Badge can tint from the
// SAME table — a second copy would let two surfaces drift into different
// palettes for the same tone. Badge re-exports the type for its callers.

export type BadgeTone =
  'ok' | 'warn' | 'info' | 'danger' | 'neutral' | 'purple';

/** Soft-tint surface + matching solid foreground. */
export const TONE_SOFT: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
  purple: 'bg-purple-soft text-purple',
};
