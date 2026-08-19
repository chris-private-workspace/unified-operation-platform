import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Drawer, DRAWER_WIDTH } from './drawer';

/**
 * W49 `F1-4` — the first primitive in this system with a test, and there is a
 * reason it is this one.
 *
 * Every other primitive is checked by rendering it: a wrong colour or radius is
 * visible. `Drawer`'s whole reason to exist is **non-modal**, and none of what
 * makes it non-modal shows up in a screenshot — `aria-modal`, a scrim, and
 * `inset-0` are invisible until somebody tries to click the page behind it.
 *
 * 🔴 The three assertions below replace a sentence that could not be tested.
 * The plan and the scope report both said "Dialog traps focus, so we need a new
 * primitive" — and `dialog.tsx` has no focus-trap code at all. What actually
 * blocks the page is `fixed inset-0`, the 45% scrim, and `aria-modal="true"`.
 * Those three are each assertable; "does not trap focus" never was.
 *
 * ⚠️ What this file CANNOT prove: that the page underneath is genuinely
 * clickable. jsdom applies no Tailwind, so nothing here has real geometry —
 * these are the STRUCTURAL preconditions. `G2` (dock open, the table underneath
 * still responds) is verified live in `F2-2`.
 */

const open = (over: Partial<React.ComponentProps<typeof Drawer>> = {}) =>
  render(
    <Drawer open title="Assistant" onClose={vi.fn()} {...over}>
      <p>panel body</p>
    </Drawer>,
  );

describe('Drawer (W49 F1)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Drawer open={false} title="Assistant" onClose={vi.fn()}>
        <p>panel body</p>
      </Drawer>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // ── the three things `Dialog` does that this must not ─────────

  /**
   * 🔴 #1 — a strip, never the whole viewport.
   *
   * Asserted as "has `right-0` and has neither `inset-0` nor `left-0`", because
   * covering the viewport IS blocking the page. A drawer that grew a `left-0`
   * would still look right in a screenshot at 1440px and be a modal at 380px.
   */
  it('occupies a strip, not the whole viewport', () => {
    open();
    const panel = screen.getByRole('complementary');

    expect(panel.className).toContain('right-0');
    expect(panel.className).not.toMatch(/\binset-0\b/);
    expect(panel.className).not.toMatch(/\bleft-0\b/);
  });

  /**
   * 🔴 #2 — no scrim.
   *
   * Asserted structurally rather than by hunting for a class name: the whole
   * render is ONE element. `Dialog` wraps its panel in a full-screen div whose
   * `bg-black/45` intercepts every click, and that wrapper is the scrim. If one
   * ever appears here, this element count changes.
   */
  it('renders one element and no wrapper that could intercept clicks', () => {
    const { container } = open();

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe('ASIDE');
  });

  /**
   * 🔴 #3 — never claims the rest of the screen is gone.
   *
   * `aria-modal="true"` tells assistive tech to ignore everything else, which
   * is precisely the opposite of a dock's purpose. `role="complementary"` says
   * "beside", `role="dialog"` would say "instead of".
   */
  it('does not tell assistive tech the page is gone', () => {
    open();
    const panel = screen.getByRole('complementary');

    expect(panel).not.toHaveAttribute('aria-modal');
    expect(panel).toHaveAttribute('aria-label', 'Assistant');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // ── behaviour ─────────────────────────────────────────────────

  it('closes on Escape', () => {
    const onClose = vi.fn();
    open({ onClose });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 Opening the dock must not move the caret out of whatever the person was
   * typing in. `Dialog` pulls focus in because it is the only thing you can act
   * on; stealing it here would make this modal in behaviour while claiming in
   * its role attribute not to be.
   */
  it('does not steal focus from the page when it opens', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    open();

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  /**
   * ⚠️ Width is a module constant and NOT a prop — a caller-chosen width is how
   * every caller ends up with a slightly different dock. This asserts the value
   * actually reaches the element, so removing the prop cannot quietly become
   * "no width at all".
   */
  it('uses the one fixed width, in pixels', () => {
    open();

    expect(screen.getByRole('complementary')).toHaveStyle({
      width: `${DRAWER_WIDTH}px`,
    });
  });

  it('closes from the close button', () => {
    const onClose = vi.fn();
    open({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
