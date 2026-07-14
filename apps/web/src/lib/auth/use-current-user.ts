import { useMsal } from '@azure/msal-react';
import { AUTH_DEV_BYPASS } from './msal';
import { getLocalProfile } from './local-profile';
import { useMe } from '@/hooks/queries';
import type { OpcoRef, Role } from '@/lib/api-types';

export interface CurrentUser {
  name: string;
  email: string;
  /** True when running under local dev-bypass (no real Entra / local account). */
  isDevBypass: boolean;
  /** True when there is a real session to sign out of (local password or Entra). */
  canSignOut: boolean;
  /**
   * Real backend role (AUTH-3b), from GET /me. `undefined` while /me is still
   * loading (Entra / dev-bypass first fetch; a local session has it instantly via
   * profile initialData). Gating treats undefined as "no access yet" (fail-safe).
   */
  role: Role | undefined;
  /** OpCo an OPCO_IT user is scoped to (null for ADMIN / REGIONAL), from /me. */
  opcoScope: OpcoRef | null;
}

/**
 * The signed-in identity + real role (ADR-0003 + ADR-0005 + AUTH-3b). Name/email
 * come from the local profile, then MSAL, then an honest dev-bypass label (never a
 * fabricated user). Role/scope come from GET /me (SSOT) via useMe.
 */
export function useCurrentUser(): CurrentUser {
  const { accounts } = useMsal();
  const me = useMe();
  const role = me.data?.role;
  const opcoScope = me.data?.opcoScope ?? null;

  const local = getLocalProfile();
  if (local) {
    return {
      name: local.displayName,
      email: local.email,
      isDevBypass: false,
      canSignOut: true,
      role,
      opcoScope,
    };
  }
  const account = accounts[0];
  if (account) {
    return {
      name: account.name ?? account.username,
      email: account.username,
      isDevBypass: false,
      canSignOut: true,
      role,
      opcoScope,
    };
  }
  return {
    name: 'Developer',
    email: 'Local dev-bypass',
    isDevBypass: AUTH_DEV_BYPASS,
    canSignOut: false,
    role,
    opcoScope,
  };
}
