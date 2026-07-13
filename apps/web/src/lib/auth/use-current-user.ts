import { useMsal } from '@azure/msal-react';
import { AUTH_DEV_BYPASS } from './msal';
import { getLocalProfile } from './local-profile';

export interface CurrentUser {
  name: string;
  email: string;
  /** True when running under local dev-bypass (no real Entra / local account). */
  isDevBypass: boolean;
  /** True when there is a real session to sign out of (local password or Entra). */
  canSignOut: boolean;
}

/**
 * The signed-in identity (ADR-0003 + ADR-0005): a local password session first,
 * then MSAL, then an honest dev-bypass label (never a fabricated user).
 */
export function useCurrentUser(): CurrentUser {
  const { accounts } = useMsal();
  const local = getLocalProfile();
  if (local) {
    return {
      name: local.displayName,
      email: local.email,
      isDevBypass: false,
      canSignOut: true,
    };
  }
  const account = accounts[0];
  if (account) {
    return {
      name: account.name ?? account.username,
      email: account.username,
      isDevBypass: false,
      canSignOut: true,
    };
  }
  return {
    name: 'Developer',
    email: 'Local dev-bypass',
    isDevBypass: AUTH_DEV_BYPASS,
    canSignOut: false,
  };
}
