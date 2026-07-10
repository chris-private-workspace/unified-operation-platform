import { useMsal } from '@azure/msal-react';
import { AUTH_DEV_BYPASS } from './msal';

export interface CurrentUser {
  name: string;
  email: string;
  /** True when running under local dev-bypass (no real Entra account). */
  isDevBypass: boolean;
}

/**
 * The signed-in identity from MSAL (ADR-0003). Under dev-bypass there is no real
 * account, so return an honest local label rather than a fabricated user.
 */
export function useCurrentUser(): CurrentUser {
  const { accounts } = useMsal();
  const account = accounts[0];
  if (account) {
    return {
      name: account.name ?? account.username,
      email: account.username,
      isDevBypass: false,
    };
  }
  return { name: 'Developer', email: 'Local dev-bypass', isDevBypass: AUTH_DEV_BYPASS };
}
