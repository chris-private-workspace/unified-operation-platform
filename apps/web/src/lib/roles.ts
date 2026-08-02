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

/**
 * The outbound failure queue is ADMIN + REGIONAL (ADR-0011 D4) — wider than the
 * rest of the admin console, because a failed delivery is an operations problem
 * and REGIONAL is who chases it.
 *
 * Same predicate as canSeePlatform today, but kept separate on purpose: they
 * answer different questions ("may I see tenant-wide numbers?" vs "may I repair
 * a delivery?"), and collapsing them would mean a future change to one silently
 * moves the other.
 */
export function canRepairOutbound(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'REGIONAL';
}

/**
 * Breaking an OpCo's licence budget on purpose is ADMIN-only (W36 / ADR-0016
 * D3) — REGIONAL is deliberately excluded even though it can see every OpCo.
 *
 * Same predicate as canSeeAdminNav today, kept separate for the same reason
 * canRepairOutbound is: "may I open the admin console?" and "may I overspend a
 * budget?" are different questions, and one changing must not silently move the
 * other. The backend 403 is the real authority; this only hides the entry, so
 * nobody is offered a control that would refuse them.
 */
export function canOverrideBudget(role: Role | undefined): boolean {
  return role === 'ADMIN';
}

/**
 * Wiping the ledger's assigned baseline is ADMIN-only (CH-017 / ADR-0022 D3),
 * narrower than the allocation reset next to it (ADMIN + REGIONAL). The reason
 * is asymmetric recoverability, not seniority: a wiped allocation comes back
 * with an import, a wiped assigned baseline needs the ops script.
 *
 * Separate predicate for the same reason as the two above — the backend 403 is
 * the real authority; this only decides whether the option is offered.
 */
export function canFullResetLedger(role: Role | undefined): boolean {
  return role === 'ADMIN';
}
