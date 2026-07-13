// Local password session (ADR-0005 / AUTH-4a). The locally-signed JWT + identity
// live in localStorage (survives reload; internal-tool tradeoff — cookie/httpOnly
// hardening is AUTH-4c). Entra sessions are handled separately by MSAL.

export interface LocalSessionUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  opcoScopeId: string | null;
}

interface LocalSession {
  token: string;
  user: LocalSessionUser;
  expiresAt: number; // epoch ms
}

const KEY = 'uop.localSession';

/** The current local session, or null if none / expired (auto-cleared on expiry). */
export function getLocalSession(): LocalSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalSession;
    if (!s.token || (s.expiresAt && Date.now() >= s.expiresAt)) {
      clearLocalSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setLocalSession(
  token: string,
  expiresInSec: number,
  user: LocalSessionUser,
): void {
  const s: LocalSession = {
    token,
    user,
    expiresAt: Date.now() + expiresInSec * 1000,
  };
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearLocalSession(): void {
  localStorage.removeItem(KEY);
}

/** The Bearer token for the local session, or null. Used by authHeader (api.ts). */
export function localToken(): string | null {
  return getLocalSession()?.token ?? null;
}
