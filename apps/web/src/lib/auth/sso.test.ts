import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  saved: null as unknown,
}));

vi.mock('@/lib/api', () => ({
  apiGet: (p: string) => m.apiGet(p),
  apiPost: (p: string, b?: unknown) => m.apiPost(p, b),
}));

vi.mock('./local-profile', () => ({
  setLocalProfile: (u: unknown) => {
    m.saved = u;
  },
}));

import { completeSsoRedirect, startSso } from './sso';

const USER = {
  id: 'u1',
  email: 'chris@rci-t.com',
  displayName: 'Chris Lai',
  role: 'ADMIN',
  opcoScopeId: null,
  mustChangePassword: false,
};

/** Put the browser on a given URL (jsdom honours replaceState within origin). */
function at(url: string) {
  window.history.replaceState(null, '', url);
}

const currentUrl = () => window.location.pathname + window.location.search;

beforeEach(() => {
  m.apiGet.mockReset();
  m.apiPost.mockReset();
  m.saved = null;
  at('/');
});

describe('startSso (ADR-0028)', () => {
  it('asks the api for the authorize URL — it builds none itself', async () => {
    m.apiGet.mockResolvedValue({
      authorizeUrl: 'https://login.example/authorize?x=1',
    });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    await startSso();

    expect(m.apiGet).toHaveBeenCalledWith('/auth/entra/start');
    expect(assign).toHaveBeenCalledWith('https://login.example/authorize?x=1');
    vi.unstubAllGlobals();
  });
});

describe('completeSsoRedirect (ADR-0028)', () => {
  it('does nothing on an ordinary page load', async () => {
    at('/requests');
    await completeSsoRedirect();
    expect(m.apiPost).not.toHaveBeenCalled();
    expect(currentUrl()).toBe('/requests');
  });

  it('exchanges the code and stores the session', async () => {
    at('/?code=the-code&state=st8');
    m.apiPost.mockResolvedValue({ user: USER });

    await completeSsoRedirect();

    expect(m.apiPost).toHaveBeenCalledWith('/auth/entra/callback', {
      code: 'the-code',
      state: 'st8',
    });
    expect(m.saved).toEqual(USER);
    // The code must not survive in the address bar or in history.
    expect(currentUrl()).toBe('/');
  });

  // 🔴 The reason the scrub happens BEFORE the exchange rather than after it: a
  // failed sign-in is exactly when the user is most likely to reload, and a
  // reload with the code still in the URL replays a spent code.
  it('scrubs the code even when the exchange fails', async () => {
    at('/?code=the-code&state=st8');
    m.apiPost.mockRejectedValue(new Error('401'));

    await completeSsoRedirect();

    expect(currentUrl()).toBe('/login?sso=failed');
    expect(m.saved).toBeNull();
  });

  it('sends an Entra refusal (?error=…) back to login without calling the api', async () => {
    at('/?error=access_denied&error_description=user+cancelled');

    await completeSsoRedirect();

    expect(m.apiPost).not.toHaveBeenCalled();
    expect(currentUrl()).toBe('/login');
  });

  // Control case: half a redirect is not a redirect. Without this, "has code"
  // and "has state" could collapse into one check and nobody would notice.
  it('ignores a code with no state', async () => {
    at('/?code=lonely');
    await completeSsoRedirect();
    expect(m.apiPost).not.toHaveBeenCalled();
  });
});
