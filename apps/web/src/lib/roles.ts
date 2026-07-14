import type { OpcoRef, Role } from './api-types';

// Pure role → display / gating helpers (AUTH-3b). Role comes from GET /me
// (use-current-user). `undefined` = /me still loading → fail-safe: neutral label
// and no elevated access. The backend fail-closed 403 (AUTH-3a) is the real
// authority; these only decide what the UI offers.

/** Top-bar subtitle: the signed-in role + its data scope. */
export function roleScopeLabel(
  role: Role | undefined,
  opcoScope: OpcoRef | null,
): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin — all OpCos';
    case 'REGIONAL':
      return 'Regional — all OpCos';
    case 'OPCO_IT':
      return opcoScope
        ? `${opcoScope.code} — ${opcoScope.displayName} only`
        : 'OpCo IT';
    default:
      return 'Signing in…';
  }
}

/** Platform (tenant-wide) surfaces are for ADMIN / REGIONAL; OPCO_IT is 403'd. */
export function canSeePlatform(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'REGIONAL';
}

/** The admin console (Users & roles / Integrations) is ADMIN-only. */
export function canSeeAdminNav(role: Role | undefined): boolean {
  return role === 'ADMIN';
}
