import { AUTH_DEV_BYPASS } from './dev-bypass';
import { getLocalProfile } from './local-profile';
import { useMe } from '@/hooks/queries';
import type { OpcoRef, Role } from '@/lib/api-types';

export interface CurrentUser {
  name: string;
  email: string;
  /** True when running under local dev-bypass (no real session). */
  isDevBypass: boolean;
  /** True when there is a real session to sign out of (either provider). */
  canSignOut: boolean;
  /**
   * Real backend role (AUTH-3b), from GET /me. `undefined` while /me is still
   * loading (dev-bypass first fetch; a real session has it instantly via profile
   * initialData). Gating treats undefined as "no access yet" (fail-safe).
   */
  role: Role | undefined;
  /** OpCo an OPCO_IT user is scoped to (null for ADMIN / REGIONAL), from /me. */
  opcoScope: OpcoRef | null;
}

/**
 * The signed-in identity + real role (ADR-0005 / ADR-0028 / AUTH-3b). Name and
 * email come from the stored session profile, which both providers write, then
 * an honest dev-bypass label (never a fabricated user). Role/scope come from
 * GET /me (SSOT) via useMe.
 */
export function useCurrentUser(): CurrentUser {
  const me = useMe();
  const role = me.data?.role;
  const opcoScope = me.data?.opcoScope ?? null;

  const session = getLocalProfile();
  if (session) {
    return {
      name: session.displayName,
      email: session.email,
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
