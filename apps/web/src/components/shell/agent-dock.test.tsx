import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentDock, AgentDockLauncher } from './agent-dock';
import { useUiStore } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import type { Role } from '@/lib/api-types';

/**
 * W49 `F2` — mounting the dock in the shell.
 *
 * 🔴 `R5` is the reason the source scan below exists. The role gate is easy to
 * get right once and lose later: the launcher is the obvious place to hide, and
 * hiding a button is indistinguishable from gating a feature until something
 * else opens the panel — which `F3` will, from a route. A reviewer would have to
 * remember. This file does not.
 *
 * ⚠️ What this file CANNOT prove: `G2` (the table underneath still responds).
 * jsdom applies no Tailwind, so nothing here has geometry — see `drawer.test.tsx`
 * for the same caveat. `G2` is verified live in `F2-2`.
 */

vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));

const asRole = (role: Role | undefined) =>
  vi.mocked(useCurrentUser).mockReturnValue({ role } as never);

const renderLauncher = () =>
  render(
    <MemoryRouter>
      <AgentDockLauncher />
    </MemoryRouter>,
  );

const renderDock = () =>
  render(
    <MemoryRouter>
      <AgentDock />
    </MemoryRouter>,
  );

beforeEach(() => {
  useUiStore.setState({ dockOpen: false });
});

describe('agent dock role gate (W49 F2-3)', () => {
  it.each<Role>(['ADMIN', 'REGIONAL'])('offers the launcher to %s', (role) => {
    asRole(role);
    renderLauncher();

    expect(
      screen.getByRole('button', { name: 'Assistant' }),
    ).toBeInTheDocument();
  });

  /**
   * 🔴 `undefined` is in this list on purpose. It is the real state while GET
   * /me is still in flight, and `canUseAgent` treats it as no-access — a gate
   * that only handled known roles would flash the dock open on every cold load.
   */
  it.each<Role | undefined>(['OPCO_IT', undefined])(
    'offers nothing to %s',
    (role) => {
      asRole(role);
      const { container } = renderLauncher();

      expect(container).toBeEmptyDOMElement();
    },
  );

  /**
   * 🔴 The panel gates itself rather than relying on the launcher being hidden.
   * Asserted with the store ALREADY open, which is the state that matters: a
   * role change (or `F3` opening it from a route) must not leave a panel behind
   * for somebody who may not use the agent.
   */
  it('renders no panel for a role that cannot use the agent, even when open', () => {
    asRole('OPCO_IT');
    useUiStore.setState({ dockOpen: true });
    const { container } = renderDock();

    expect(container).toBeEmptyDOMElement();
  });
});

describe('agent dock open state (W49 F2-4)', () => {
  it('renders nothing until it is opened', () => {
    asRole('ADMIN');
    const { container } = renderDock();

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the panel when the store says open', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderDock();

    expect(
      screen.getByRole('complementary', { name: 'Assistant' }),
    ).toBeInTheDocument();
  });

  it('the launcher toggles the store both ways', () => {
    asRole('ADMIN');
    renderLauncher();
    const button = screen.getByRole('button', { name: 'Assistant' });

    fireEvent.click(button);
    expect(useUiStore.getState().dockOpen).toBe(true);

    fireEvent.click(button);
    expect(useUiStore.getState().dockOpen).toBe(false);
  });

  /**
   * ⚠️ This is what "the open state persists" means here: the state is in the
   * store, so unmounting and remounting the panel — which is what a route change
   * does to everything below the shell — finds it still open. It is deliberately
   * NOT localStorage; see the note in `store/ui.ts`.
   */
  it('survives a remount, because the state is not the component’s', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });

    const first = renderDock();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    first.unmount();

    renderDock();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('the launcher reports its state to assistive tech', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderLauncher();

    expect(screen.getByRole('button', { name: 'Assistant' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

// ── R5: the gate cannot be lost in a later edit ──────────────────

const DOCK = join(__dirname, 'agent-dock.tsx');

/**
 * Split on the export boundary so each component's body is checked separately.
 * A whole-file `toContain('useDockVisible')` would pass while a newly added
 * third export skipped the gate entirely — which is exactly the edit this is
 * here to catch.
 */
function exportedComponents(): { name: string; body: string }[] {
  const source = readFileSync(DOCK, 'utf8');
  return source
    .split(/^export function /gm)
    .slice(1)
    .map((part) => ({ name: part.slice(0, part.indexOf('(')), body: part }));
}

describe('every dock entry point runs the same gate (W49 R5)', () => {
  /**
   * 🔴 The vacuity guard, and it is not ceremony — W47 shipped two assertions
   * aimed at a collaborator that no longer existed, so they could not go red.
   * If the file is renamed or the split regex stops matching, this returns []
   * and every assertion below would pass having checked nothing.
   */
  it('finds the exports it is about to check', () => {
    const parts = exportedComponents();

    expect(parts.map((p) => p.name)).toEqual([
      'AgentDockLauncher',
      'AgentDock',
    ]);
  });

  it('gates each one', () => {
    for (const { name, body } of exportedComponents()) {
      expect(body, `${name} does not call useDockVisible()`).toContain(
        'useDockVisible()',
      );
    }
  });

  /**
   * And that the shared helper asks the platform's predicate rather than
   * re-deriving one. A local `role === 'ADMIN'` here would be a second answer to
   * a question `roles.ts` already owns.
   */
  it('derives visibility from canUseAgent, not from a local role check', () => {
    const source = readFileSync(DOCK, 'utf8');

    expect(source).toContain('canUseAgent(role)');
    expect(source).not.toMatch(/role === '/);
  });
});
