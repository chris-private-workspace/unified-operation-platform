// Minimal typed fetch wrapper (OD2-A). Reads are same-origin '/api/*', proxied
// to the NestJS API by vite in dev (vite.config.ts) and by a reverse proxy in
// prod. Override the base with VITE_API_BASE_URL if the API is on another origin.

import { InteractionRequiredAuthError } from '@azure/msal-browser';
import {
  msalInstance,
  msalConfigured,
  API_SCOPE,
  AUTH_DEV_BYPASS,
} from './auth/msal';
import { localToken } from './auth/local-session';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * Authorization header for an API call (ADR-0003 + ADR-0005). A local password
 * session takes priority → its Bearer. Otherwise: dev-bypass or unconfigured MSAL
 * (pre-app-reg) → no header (backend AUTH_DEV_BYPASS carries it); else acquire an
 * Entra token silently, and on interaction-required kick a redirect and send
 * unauthenticated once. H4: never log the token. Exported for unit testing.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const local = localToken();
  if (local) return { Authorization: `Bearer ${local}` };
  if (AUTH_DEV_BYPASS || !msalConfigured) return {};
  const account = msalInstance.getActiveAccount();
  if (!account) return {}; // not signed in — the auth gate sends the user to Login
  try {
    const { accessToken } = await msalInstance.acquireTokenSilent({
      scopes: [API_SCOPE],
      account,
    });
    return { Authorization: `Bearer ${accessToken}` };
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      void msalInstance.acquireTokenRedirect({ scopes: [API_SCOPE], account });
    }
    return {};
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** GET a JSON resource; throws ApiError on a non-2xx response. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * POST a trigger endpoint, optionally with a JSON body. On a non-2xx the server's
 * `message` is surfaced (same as apiPatch) so callers can toast the real reason
 * (e.g. "Microsoft Graph is unavailable …") rather than a generic string.
 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(await authHeader()),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `POST ${path} failed (${res.status})`;
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
 * PATCH with an optional JSON body. On a non-2xx the server's `message` (NestJS
 * error shape) is surfaced so callers can toast the real reason (seat exhausted,
 * sync gate, …) rather than a generic string.
 */
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      ...(await authHeader()),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `PATCH ${path} failed (${res.status})`;
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
