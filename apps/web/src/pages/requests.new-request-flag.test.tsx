import { render, screen } from '@testing-library/react';
import { Navigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * CH-024 A — the parked "New request" entry point.
 *
 * Both directions are tested because the flag exists to be flipped back: a test
 * that only pins the OFF state would let the ON path rot silently until someone
 * turns it on and finds a broken screen.
 *
 * Both entry points are tested for the same reason the change touches both —
 * hiding the button while `/requests/new` still renders the form is not
 * "parked", it is "hidden", and a bookmark walks straight past it.
 *
 * `useNavigate` is stubbed but the rest of react-router-dom is real: the route
 * assertion needs the genuine `Navigate` and `createBrowserRouter`.
 */
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/queries', () => ({
  useMe: vi.fn(() => ({ data: { id: 'u1' } })),
  useRequests: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  // Imported by other screens the router pulls in; never called here.
  useCatalog: vi.fn(),
  useLedger: vi.fn(),
  useLedgerStats: vi.fn(),
  useTenantSkus: vi.fn(),
  useTenantSkuStats: vi.fn(),
  useRequest: vi.fn(),
  // W47 — the agent registry screen, pulled in by the router for the same
  // reason as the rest of this list. Declared, never rendered here.
  useAgentProfiles: vi.fn(),
  useAgentRuns: vi.fn(),
}));

/**
 * Re-import with the flag set the way this test needs it.
 *
 * 🔴 The two loaders are separate because `@/router` pulls in every screen in
 * the app. Loading it for the button assertion too pushed that test past the
 * 5s timeout under a full parallel run — it passed in isolation, which is the
 * worst way for a test to be too slow.
 *
 * 🔴 W47 — that happened AGAIN, and the second time says something the first
 * did not: this cost is not a one-off, it grows with the app. Adding `/agent`
 * to the router was enough to push the two `loadRouter` tests over 5s under a
 * parallel run (1.5s in isolation), because every screen the router names is
 * imported before the route table can be read.
 *
 * So the two loader tests carry an explicit timeout rather than relying on the
 * default. Splitting the loaders bought margin once; a per-test budget is what
 * stops the NEXT screen from doing this a third time — and the failure mode
 * being avoided is the expensive one: green in isolation, red in CI, blamed on
 * whichever change happened to be last.
 */
const ROUTER_LOAD_TIMEOUT_MS = 20_000;
function setFlag(enabled: boolean) {
  vi.resetModules();
  vi.doMock('@/lib/features', () => ({ NEW_REQUEST_ENABLED: enabled }));
}

async function loadRequests(enabled: boolean) {
  setFlag(enabled);
  return (await import('./requests')).Requests;
}

async function loadRouter(enabled: boolean) {
  setFlag(enabled);
  return (await import('@/router')).router;
}

/** The `requests/new` entry in the authenticated route tree. */
function newRequestRoute(router: { routes: any[] }) {
  const shell = router.routes.find((r) => r.path === '/');
  return shell?.children?.find((c: any) => c.path === 'requests/new');
}

afterEach(() => {
  vi.doUnmock('@/lib/features');
});

describe('New request — parked (flag off)', () => {
  it('renders no button at all, rather than a disabled one', async () => {
    const Requests = await loadRequests(false);
    render(<Requests />);

    // queryByRole, not "is it disabled": a control that cannot be pressed
    // reads as broken, and nothing here is broken.
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
  });

  it(
    'redirects /requests/new instead of rendering the form',
    async () => {
      const route = newRequestRoute(await loadRouter(false));

      expect(route).toBeTruthy();
      expect(route.element.type).toBe(Navigate);
      expect(route.element.props.to).toBe('/requests');
      // `replace` keeps the parked URL out of history, so Back does not bounce
      // the operator straight into another redirect.
      expect(route.element.props.replace).toBe(true);
    },
    ROUTER_LOAD_TIMEOUT_MS,
  );
});

describe('New request — restored (flag on)', () => {
  it('renders the button again', async () => {
    const Requests = await loadRequests(true);
    render(<Requests />);

    expect(screen.getByRole('button', { name: 'New request' })).toBeTruthy();
  });

  it(
    'routes /requests/new to the real screen again',
    async () => {
      const route = newRequestRoute(await loadRouter(true));

      expect(route.element.type).not.toBe(Navigate);
      // Named rather than compared by identity: `resetModules` means the imported
      // NewRequest here would be a different module instance than the router's.
      expect(route.element.type.name).toBe('NewRequest');
    },
    ROUTER_LOAD_TIMEOUT_MS,
  );
});
