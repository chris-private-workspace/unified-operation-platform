// Minimal typed fetch wrapper (OD2-A). Reads are same-origin '/api/*', proxied
// to the NestJS API by vite in dev (vite.config.ts) and by a reverse proxy in
// prod. Override the base with VITE_API_BASE_URL if the API is on another origin.

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

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
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** POST (no body this phase — trigger endpoints); throws ApiError on non-2xx. */
export async function apiPost<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `POST ${path} failed (${res.status})`);
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
