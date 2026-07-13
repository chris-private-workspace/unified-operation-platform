// Local password identity (ADR-0006 §7 / AUTH-4c-B). The access + refresh tokens
// now live in httpOnly cookies (out of page-JS reach → XSS-resistant); only this
// non-sensitive profile is kept in localStorage so the UI can render the identity
// without a round-trip. Session lifetime is owned by the cookies, not this record
// — its presence just means "a local session was established".

export interface LocalProfile {
  id: string;
  email: string;
  displayName: string;
  role: string;
  opcoScopeId: string | null;
  mustChangePassword: boolean; // AUTH-4c-A — gate the app until changed
}

const KEY = 'uop.localProfile';

/** The current local profile, or null if none. */
export function getLocalProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch {
    return null;
  }
}

export function setLocalProfile(user: LocalProfile): void {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearLocalProfile(): void {
  localStorage.removeItem(KEY);
}

/** Clear the force-change flag after a successful change (AUTH-4c-A), keeping the profile. */
export function clearMustChangePassword(): void {
  const p = getLocalProfile();
  if (!p) return;
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...p, mustChangePassword: false }),
  );
}
