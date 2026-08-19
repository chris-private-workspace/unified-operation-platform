import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * W49 `F1` — a **non-modal** side panel. Owner-approved new primitive
 * (Chris 2026-08-19); constraints live in `design-system.md §2`.
 *
 * 🔴 There is no handoff spec for this. It is the SECOND primitive in this
 * system not rebuilt from `design_handoff_licenseops` (after `Textarea`), and
 * it is a heavier one: `Textarea` is a field, this changes how the whole shell
 * behaves — a panel that stays open while every other screen keeps working.
 *
 * 🔴 **Non-modal is the only reason it exists**, so it is worth writing down
 * precisely what `Dialog` does that this must not. `dialog.tsx` has NO focus
 * trap (read 2026-08-19 — there is no trap code in it at all). What actually
 * makes the page underneath unusable is three other things:
 *
 *   1. `fixed inset-0` — covering the viewport IS blocking the page
 *   2. the `bg-black/45` scrim, which intercepts every click
 *   3. `aria-modal="true"`, which tells assistive tech the rest is not there
 *
 * This component avoids all three, and each one is separately assertable —
 * which "do not trap focus" never was.
 */

/**
 * 🔴 A constant, NOT a prop.
 *
 * A caller-chosen width is how every caller ends up with a slightly different
 * dock. And it cannot be a percentage: on a wide monitor that becomes half the
 * screen, which is a layout decision hiding inside a style value.
 */
export const DRAWER_WIDTH = 380;

export interface DrawerProps {
  open: boolean;
  /** Also the accessible name — this panel has no `aria-modal` to lean on. */
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Drawer({ open, title, onClose, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      // 🔴 `complementary`, not `dialog`. This panel sits BESIDE the page; it
      // does not replace it. `aria-modal` here would be a lie about the rest of
      // the screen, and the whole point of a dock is that the rest is still
      // there.
      role="complementary"
      aria-label={title}
      style={{ width: DRAWER_WIDTH }}
      /*
       * `right-0 top-0 bottom-0` — a strip, never `inset-0`.
       * `z-40` — below Toast (z-50) and Dialog (z-[90]): a panel somebody left
       * open must not swallow a transient notification, and a real modal still
       * outranks it.
       * Depth is a 1px `border-l` + `bg-card`. No shadow (DS-7): `Dialog` uses
       * `shadow-overlay` because it floats for a moment; this thing stays, and
       * a permanent shadow is a new visual layer on every screen.
       * `fadeIn` is one of the three approved keyframes (DS-9) — a slide-in
       * would be a new motion, which is a separate conversation.
       */
      className="fixed bottom-0 right-0 top-0 z-40 flex max-w-[92vw] flex-col border-l border-border bg-card animate-[fadeIn_.15s_ease]"
    >
      <div className="flex items-center justify-between border-b border-border px-[18px] py-[14px]">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-hover"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/*
       * ⚠️ Deliberately NOT auto-focused on open. `Dialog` pulls attention in
       * because it is the only thing you can act on; a dock is opened by
       * somebody who may well keep typing in the page behind it. Stealing focus
       * here would make the panel modal in behaviour while claiming not to be.
       */}
      <div className="flex-1 overflow-y-auto p-[18px]">{children}</div>
    </aside>
  );
}
