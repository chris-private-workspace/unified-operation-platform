import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

// Mutable mock state for the msal module, toggled per test. vi.hoisted runs
// before the vi.mock factory, so the factory can close over it. authHeader reads
// AUTH_DEV_BYPASS / msalConfigured at call time, so the getters reflect live state.
const m = vi.hoisted(() => ({
  devBypass: false,
  configured: true,
  account: null as { username: string } | null,
  localToken: null as string | null,
  acquireTokenSilent: vi.fn(),
  acquireTokenRedirect: vi.fn(),
}));

// Local password session (ADR-0005) — controllable per test.
vi.mock('@/lib/auth/local-session', () => ({
  localToken: () => m.localToken,
}));

vi.mock('@/lib/auth/msal', () => ({
  API_SCOPE: 'api://uop-test/access',
  get AUTH_DEV_BYPASS() {
    return m.devBypass;
  },
  get msalConfigured() {
    return m.configured;
  },
  msalInstance: {
    getActiveAccount: () => m.account,
    acquireTokenSilent: (args: unknown) => m.acquireTokenSilent(args),
    acquireTokenRedirect: (args: unknown) => m.acquireTokenRedirect(args),
  },
}));

// InteractionRequiredAuthError is the REAL class (not mocked) so the `instanceof`
// check in authHeader matches — that is the whole point of the interactive branch.
import { authHeader } from './api';

const ACCOUNT = { username: 'alice@ricoh.com' };

beforeEach(() => {
  m.devBypass = false;
  m.configured = true;
  m.account = null;
  m.localToken = null;
  m.acquireTokenSilent.mockReset();
  m.acquireTokenRedirect.mockReset();
});

describe('authHeader (ADR-0003 token attach)', () => {
  it('local session token wins → local Bearer, no MSAL call (ADR-0005)', async () => {
    m.localToken = 'local.jwt.tok';
    m.devBypass = true; // even dev-bypass yields to a real local session
    m.account = ACCOUNT;
    expect(await authHeader()).toEqual({
      Authorization: 'Bearer local.jwt.tok',
    });
    expect(m.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('dev-bypass → no header, no token acquired (backend AUTH_DEV_BYPASS carries it)', async () => {
    m.devBypass = true;
    m.account = ACCOUNT; // even with an account present, dev-bypass wins
    expect(await authHeader()).toEqual({});
    expect(m.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('MSAL unconfigured (pre-app-reg) → no header', async () => {
    m.configured = false;
    m.account = ACCOUNT;
    expect(await authHeader()).toEqual({});
    expect(m.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('configured but not signed in → no header (the auth gate handles login)', async () => {
    m.account = null;
    expect(await authHeader()).toEqual({});
    expect(m.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('signed in → Bearer header from a silent token', async () => {
    m.account = ACCOUNT;
    m.acquireTokenSilent.mockResolvedValue({ accessToken: 'tok-abc' });
    expect(await authHeader()).toEqual({ Authorization: 'Bearer tok-abc' });
  });

  it('silent interaction-required → kicks a redirect, sends no header this once', async () => {
    m.account = ACCOUNT;
    m.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError('interaction_required', 'silent failed'),
    );
    expect(await authHeader()).toEqual({});
    expect(m.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  it('other silent failure → no header, and no redirect (avoids a redirect loop)', async () => {
    m.account = ACCOUNT;
    m.acquireTokenSilent.mockRejectedValue(new Error('network'));
    expect(await authHeader()).toEqual({});
    expect(m.acquireTokenRedirect).not.toHaveBeenCalled();
  });
});
