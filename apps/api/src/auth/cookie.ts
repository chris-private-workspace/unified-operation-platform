import type { CookieOptions, Response } from 'express';

// httpOnly session cookies for the local password session (ADR-0006 §7 /
// AUTH-4c-B). The access token rides in uop_access, the refresh token in
// uop_refresh — both httpOnly (out of reach of page JS → XSS-resistant) and
// SameSite=Strict (a cross-site request never carries them → CSRF defence).
// Entra sessions are unaffected (they use a Bearer header via MSAL).
export const ACCESS_COOKIE = 'uop_access';
export const REFRESH_COOKIE = 'uop_refresh';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // mirrors the access-token TTL
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // mirrors the refresh TTL

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
