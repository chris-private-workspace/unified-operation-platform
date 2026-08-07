/**
 * Local dev-bypass: skip the login gate entirely and let the backend's own
 * AUTH_DEV_BYPASS run every request as the seed ADMIN (ADR-0002 risk R-C).
 *
 * Build-time by necessity — it decides whether the app renders a login gate at
 * all, before any request is made. Never set in a prod build. It lived in
 * `msal.ts` until ADR-0028 removed that file; it has nothing to do with MSAL and
 * survives the change untouched.
 */
export const AUTH_DEV_BYPASS = import.meta.env.VITE_AUTH_DEV_BYPASS === 'true';
