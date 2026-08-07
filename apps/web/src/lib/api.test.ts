import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable mock state, toggled per test. vi.hoisted runs before the vi.mock
// factory, so the factory can close over it. The profile is read at call time,
// so the getter reflects live state.
const m = vi.hoisted(() => ({
  localProfile: null as Record<string, unknown> | null,
  cleared: false,
}));

// The platform session (ADR-0006 §7 / ADR-0028) — the profile is present iff a
// session exists, whichever provider established it; the tokens live in httpOnly
// cookies (not visible to JS).
vi.mock('@/lib/auth/local-profile', () => ({
  getLocalProfile: () => m.localProfile,
  clearLocalProfile: () => {
    m.cleared = true;
  },
}));

import { apiGet, apiPost, ApiError } from './api';

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
  m.localProfile = null;
  m.cleared = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * ADR-0028 replaced an async authHeader() (MSAL silent acquire + Bearer attach)
 * with nothing at all: the session is a cookie the browser sends itself. These
 * tests lock that in — they are what the old "token attach" suite became.
 */
describe('credential transport', () => {
  it('sends the session cookie and NEVER an Authorization header', async () => {
    m.localProfile = PROFILE;
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { value: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/x');
    await apiPost('/y', { a: 1 });

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.credentials).toBe('include');
      expect(init.headers).not.toHaveProperty('Authorization');
    }
  });

  it('sends no Authorization header when signed out either', async () => {
    m.localProfile = null;
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/x');

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      'Authorization',
    );
  });
});

describe('refresh-retry on 401 (ADR-0006 §7)', () => {
  it('401 → /auth/refresh → retry once → success', async () => {
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

  it('401 → refresh fails → clears profile and throws 401 (no retry)', async () => {
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

  // The control case: without a session there is nothing to rotate, and the 401
  // is the honest answer (this is what /auth/login itself gets on bad
  // credentials — refreshing there would be a pointless round trip).
  it('401 without a session is not refreshed', async () => {
    m.localProfile = null;
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/x')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(m.cleared).toBe(false);
  });
});
