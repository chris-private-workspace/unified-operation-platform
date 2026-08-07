import type { CookieOptions, Response } from 'express';

// httpOnly session cookies for the platform session (ADR-0006 §7 / AUTH-4c-B).
// The access token rides in uop_access, the refresh token in uop_refresh — both
// httpOnly (out of reach of page JS → XSS-resistant) and SameSite=Strict (a
// cross-site request never carries them → CSRF defence).
//
// Since ADR-0028 this is the ONLY session the platform issues: an Entra SSO
// sign-in ends at the same setAuthCookies() call a break-glass login does.
export const ACCESS_COOKIE = 'uop_access';
export const REFRESH_COOKIE = 'uop_refresh';

/**
 * The in-flight SSO attempt (ADR-0028): `state` + the PKCE verifier, held for
 * the round trip to Entra and read exactly once, by /auth/entra/callback.
 *
 * SameSite=Strict works here even though the user arrives back from
 * login.microsoftonline.com: that cross-site step is a top-level navigation
 * which only loads the static SPA, and the request that needs this cookie is
 * the SPA's own same-origin fetch afterwards (web's nginx proxies /api/*,
 * ADR-0027 Option A). Nothing has to be relaxed for OAuth.
 */
export const SSO_STATE_COOKIE = 'uop_sso_state';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // mirrors the access-token TTL
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // mirrors the refresh TTL
// Long enough to type a password + approve MFA, short enough that an abandoned
// attempt cannot be resumed later.
const SSO_STATE_MAX_AGE_MS = 10 * 60 * 1000;

// Secure only in production. Dev runs over http://localhost, where the browser
// rejects Secure cookies outright — mirrors main.ts already reading process.env
// for platform mode (PORT). path '/' keeps dev (vite proxies /api/*) and prod on
// one path so the cookie always matches (see W21 plan §5).
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

// clearCookie must be given the same attributes (path / sameSite / secure) the
// cookie was set with, or the browser won't match and clear it.
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}

export function setSsoStateCookie(res: Response, value: string): void {
  res.cookie(SSO_STATE_COOKIE, value, {
    ...baseOptions(),
    maxAge: SSO_STATE_MAX_AGE_MS,
  });
}

/**
 * Drop the attempt cookie. The callback clears it BEFORE it validates anything,
 * so one code is exchanged at most once regardless of how that exchange goes —
 * a failed attempt must not leave a reusable verifier behind.
 */
export function clearSsoStateCookie(res: Response): void {
  res.clearCookie(SSO_STATE_COOKIE, baseOptions());
}
