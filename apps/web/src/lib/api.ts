// Minimal typed fetch wrapper (OD2-A). Reads are same-origin '/api/*', proxied
// to the NestJS API by vite in dev (vite.config.ts) and by a reverse proxy in
// prod. Override the base with VITE_API_BASE_URL if the API is on another origin.

import { getLocalProfile, clearLocalProfile } from './auth/local-profile';

/**
 * Exported since W46 G6: `EventSource` does not go through the wrapper below,
 * so the SSE hook needs the same answer. Two places computing it independently
 * is how a dev proxy and a production reverse proxy end up disagreeing about
 * where the API is.
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * No Authorization header, ever (ADR-0028). Both providers — break-glass
 * password and Entra SSO — end at the same httpOnly platform session cookie,
 * which `credentials:'include'` sends automatically. The browser never holds a
 * token, so there is nothing for page JS to attach, leak, or refresh.
 *
 * This replaced an async authHeader() that acquired Entra tokens through MSAL,
 * along with the silent-acquire / interaction-required dance ADR-0003 listed as
 * its own main source of complexity.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * The parsed error body, when there was one. Most failures say everything
     * they need to in `message`; some carry a list the UI has to render — the
     * catalog import's alias collisions (CH-019) name which SKUs clash, and
     * folding that into a sentence stops being readable past the first one.
     */
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parse a non-2xx body once: the server's `message`, plus the raw body. */
async function errorFrom(res: Response, fallback: string): Promise<ApiError> {
  try {
    const data = (await res.json()) as {
      message?: string | string[];
    } & Record<string, unknown>;
    const m = data.message;
    const message = m ? (Array.isArray(m) ? m.join(', ') : m) : fallback;
    return new ApiError(res.status, message, data);
  } catch {
    return new ApiError(res.status, fallback); // non-JSON body
  }
}

// Single-flight refresh (ADR-0006 §7): concurrent 401s share one /auth/refresh
// call so the refresh token rotates exactly once. Resolves to whether a new
// session was issued. Uses raw fetch (not doFetch) so it never recurses.
let refreshInFlight: Promise<boolean> | null = null;
function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * fetch with the session cookie + a one-shot refresh-retry (ADR-0006 §7). On a
 * 401 for an established session we rotate via /auth/refresh once and replay the
 * request; if refresh fails we drop the profile so the auth gate sends the user
 * back to Login. Login itself has no profile yet, so a bad-credentials 401 is
 * returned as-is. Since ADR-0028 this covers SSO sessions too — they hold the
 * same refresh token, so they rotate the same way.
 */
async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const withCreds: RequestInit = { ...init, credentials: 'include' };
  let res = await fetch(`${API_BASE}${path}`, withCreds);
  if (res.status === 401 && getLocalProfile()) {
    if (await tryRefresh()) {
      res = await fetch(`${API_BASE}${path}`, withCreds);
    } else {
      clearLocalProfile();
    }
  }
  return res;
}

/** GET a JSON resource; throws ApiError on a non-2xx response. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await doFetch(path, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    /**
     * Surface the server's own message, exactly like apiPost/apiPatch/apiDelete
     * already do — this was the odd one out.
     *
     * CH-013 is what made it matter: a 404 from /requests/servicenow-lookup says
     * "a request the integration account cannot see is indistinguishable from
     * one that does not exist", and swallowing that sends the operator hunting
     * for a typo that is not there.
     */
    let message = `GET ${path} failed (${res.status})`;
    try {
      const data = await res.json();
      const m = (data as { message?: string | string[] }).message;
      if (m) message = Array.isArray(m) ? m.join(', ') : m;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/**
 * POST a trigger endpoint, optionally with a JSON body. On a non-2xx the server's
 * `message` is surfaced (same as apiPatch) so callers can toast the real reason
 * (e.g. "Microsoft Graph is unavailable …") rather than a generic string.
 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await doFetch(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw await errorFrom(res, `POST ${path} failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T; // No Content (e.g. logout)
  return res.json() as Promise<T>;
}

/**
 * PATCH with an optional JSON body. On a non-2xx the server's `message` (NestJS
 * error shape) is surfaced so callers can toast the real reason (seat exhausted,
 * sync gate, …) rather than a generic string.
 *
 * 🔴 W45 — this used to build the ApiError by hand and pass only `message`, so
 * `detail` was ALWAYS undefined on a PATCH. ADR-0029 puts the assign step
 * breakdown in the 400 body, and it was silently unreachable: every layer was
 * green (api tests, web tests, tsc, lint) because the UI tests construct their
 * own ApiError with a detail, so nothing exercised the real transport. Routed
 * through `errorFrom` like apiPost, which has carried the body since CH-019.
 */
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await doFetch(path, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw await errorFrom(res, `PATCH ${path} failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T; // No Content (e.g. change password)
  return res.json() as Promise<T>;
}

/**
 * DELETE. Surfaces the server's `message` on non-2xx (e.g. the 409 a locked line
 * item returns) so callers can toast the real reason rather than a generic string.
 */
export async function apiDelete<T>(path: string): Promise<T> {
  const res = await doFetch(path, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let message = `DELETE ${path} failed (${res.status})`;
    try {
      const data = await res.json();
      const m = (data as { message?: string | string[] }).message;
      if (m) message = Array.isArray(m) ? m.join(', ') : m;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
