import { cn } from '@/lib/utils';

/**
 * Multi-line text entry — owner-approved primitive (Chris, 2026-08-17 · W47).
 *
 * 🔴 There is NO `Textarea.jsx` in `design_handoff_licenseops`: the prototype
 * never needed one, so this is not a rebuild-from-spec like every other
 * primitive here. Every value below is therefore taken from `Input`, not chosen
 * — same border, radius, background, text size, placeholder colour. The only
 * deliberate differences are the three a single-line field cannot have:
 *
 *   - `h-[34px]` becomes `min-h` + `rows`, since the height is the point
 *   - vertical padding, because text no longer sits on one line
 *   - `leading-[1.55]`, because 12.5px lines set solid are unreadable in bulk
 *
 * 🔴 `resize-y`, never `resize`. Horizontal resize is a browser default that
 * lets a user drag this wider than the dialog containing it — which breaks the
 * one layout rule the whole console holds to (a page never scrolls sideways),
 * from inside a component, with no code change to blame.
 */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 6, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full resize-y rounded-lg border border-border bg-card px-[11px] py-[8px] text-[12.5px] leading-[1.55] text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:opacity-[0.55]',
        className,
      )}
      {...props}
    />
  );
}
