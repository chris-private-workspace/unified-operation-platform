import {
  PublicClientApplication,
  LogLevel,
  type Configuration,
} from '@azure/msal-browser';

// MSAL config is env-driven (ADR-0003, H4) — no hardcoded tenant/client, no token logging.
// Real values arrive with the IT SPA app registration (AUTH-2b). Until then clientId is
// empty (msalConfigured === false); dev-bypass keeps the app usable locally.
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? '';
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? '';

/** Scope the SPA requests, so the token audience matches the backend (ADR-0002 ENTRA_API_AUDIENCE). */
export const API_SCOPE = import.meta.env.VITE_ENTRA_API_SCOPE ?? '';

/** Local dev-bypass: skip the login gate and send no Bearer (pairs with backend AUTH_DEV_BYPASS). */
export const AUTH_DEV_BYPASS = import.meta.env.VITE_AUTH_DEV_BYPASS === 'true';

/** MSAL only works once IT provisions the SPA app registration (a real clientId). */
export const msalConfigured = clientId.length > 0;

const msalConfig: Configuration = {
  auth: {
    // Placeholders keep MSAL constructible before the app registration exists; msalConfigured
    // gates every real login/token call, so these dummy values are never used against Entra.
    clientId: clientId || '00000000-0000-0000-0000-000000000000',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI ?? window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage', // per-tab; cleared when the tab closes
  },
  system: {
    loggerOptions: {
      // H4: drop any PII message; surface only warnings/errors, never token/claim bodies.
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
        else if (level === LogLevel.Warning) console.warn(message);
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning,
    },
  },
};

/** Module-level singleton so non-component code (api.ts) shares one instance (ADR-0003). */
export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Initialize MSAL + process any redirect response before the app renders.
 * Required by msal-browser v3+ (avoids uninitialized_public_client_application).
 * No-op when unconfigured (pre-app-reg) so dev-bypass carries the app.
 */
export async function initMsal(): Promise<void> {
  if (!msalConfigured) return;
  await msalInstance.initialize();
  const response = await msalInstance.handleRedirectPromise();
  if (response?.account) {
    msalInstance.setActiveAccount(response.account);
  } else if (!msalInstance.getActiveAccount()) {
    const [first] = msalInstance.getAllAccounts();
    if (first) msalInstance.setActiveAccount(first);
  }
}
