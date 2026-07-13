import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

// Mutable mock state, toggled per test. vi.hoisted runs before the vi.mock factory,
// so the factory can close over it. authHeader reads AUTH_DEV_BYPASS / msalConfigured
// / the local profile at call time, so the getters reflect live state.
const m = vi.hoisted(() => ({
  devBypass: false,
  configured: true,
  account: null as { username: string } | null,
  localProfile: null as Record<string, unknown> | null,
  cleared: false,
  acquireTokenSilent: vi.fn(),
  acquireTokenRedirect: vi.fn(),
}));

// Local password session (ADR-0006 §7) — the profile is present iff a local
// session exists; the tokens live in httpOnly cookies (not visible to JS).
vi.mock('@/lib/auth/local-profile', () => ({
  getLocalProfile: () => m.localProfile,
  clearLocalProfile: () => {
    m.cleared = true;
  },
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
import { apiGet, authHeader, ApiError } from './api';

const ACCOUNT = { username: 'alice@ricoh.com' };
const PROFILE = {
  id: 'u1',
  email: 'a@x',
  displayName: 'A',
  role: 'ADMIN',
  opcoScopeId: null,
  mustChangePassword: false,
};

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  m.devBypass = false;
  m.configured = true;
  m.account = null;
  m.localProfile = null;
  m.cleared = false;
  m.acquireTokenSilent.mockReset();
  m.acquireTokenRedirect.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authHeader (token attach)', () => {
  it('local session → no header (httpOnly cookie carries it), no MSAL call (ADR-0006 §7)', async () => {
    m.localProfile = PROFILE;
    m.devBypass = true; // even dev-bypass yields to a real local session
    m.account = ACCOUNT;
    expect(await authHeader()).toEqual({});
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

describe('refresh-retry on 401 (ADR-0006 §7)', () => {
  it('local 401 → /auth/refresh → retry once → success', async () => {
    m.localProfile = PROFILE;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, {})) // GET /x → 401
      .mockResolvedValueOnce(jsonRes(200, {})) // POST /auth/refresh → ok
      .mockResolvedValueOnce(jsonRes(200, { value: 1 })); // GET /x retry → data
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/x')).resolves.toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/refresh');
    expect(m.cleared).toBe(false);
  });

  it('local 401 → refresh fails → clears profile and throws 401 (no retry)', async () => {
    m.localProfile = PROFILE;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, {})) // GET /x → 401
      .mockResolvedValueOnce(jsonRes(401, {})); // refresh → not ok
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/x')).rejects.toBeInstanceOf(ApiError);
    expect(m.cleared).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // no retry
  });

  it('401 without a local profile is not refreshed (Entra path is MSAL’s job)', async () => {
    m.localProfile = null;
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/x')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(m.cleared).toBe(false);
  });
});
