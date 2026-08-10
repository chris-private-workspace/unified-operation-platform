import { apiGet, apiPost } from '@/lib/api';
import { setLocalProfile } from './local-profile';
import type { SessionResponse } from '@/lib/api-types';

/**
 * Entra SSO from the browser's side (ADR-0028). Deliberately thin: the API owns
 * the client secret, the PKCE verifier, the `state`, and the token exchange —
 * everything here does is send the user to Entra and hand back what comes home.
 *
 * 🔴 There is no Entra configuration in this bundle. client id / tenant /
 * redirect URI are read by the API at RUNTIME, which is what makes changing any
 * of them a restart rather than a rebuild — the single biggest practical win of
 * ADR-0028 over the MSAL design it replaced.
 */

/** GET /auth/entra/start → send the browser to Entra. */
export async function startSso(): Promise<void> {
  const { authorizeUrl } = await apiGet<{ authorizeUrl: string }>(
    '/auth/entra/start',
  );
  window.location.assign(authorizeUrl);
}

/**
 * Handle the redirect back from Entra, if this page load IS one.
 *
 * Called once before the app renders (main.tsx), for the same reason MSAL's
 * handleRedirectPromise was: the redirect lands on `/`, which is a guarded
 * route, and letting the router run first would bounce the user to /login with
 * the code still unspent in the URL.
 *
 * Resolves either way — a failed sign-in must still render the app (at /login),
 * never a blank page.
 */
export async function completeSsoRedirect(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (!code || !state) {
    // Entra reports a refusal (user cancelled, admin consent required, …) as
    // ?error=… with no code. Same destination as a failure, but it is not one:
    // nothing was attempted, so there is nothing to warn about.
    if (error) scrubUrl('/login');
    return;
  }

  // Scrub BEFORE the exchange. An authorization code in the address bar is one
  // reload / one shared link away from being replayed, and it has no business
  // in browser history either.
  scrubUrl(window.location.pathname);

  try {
    const res = await apiPost<SessionResponse>('/auth/entra/callback', {
      code,
      state,
    });
    setLocalProfile(res.user);
  } catch {
    // The API already logged why (H4: the reason belongs in the api log, not in
    // a URL). All the user needs is a way back to a working login screen.
    scrubUrl('/login?sso=failed');
  }
}

/** Replace the current history entry, dropping the OAuth query string. */
function scrubUrl(to: string): void {
  window.history.replaceState(null, '', to);
}
