import type { BadgeTone } from '@/components/ui/badge';
import type { AuditFilters } from './api-types';

// Pure helpers for the Audit log page (W29 F4). Mirrors the backend's
// AUDIT_ACTIONS / target types — hand-written like the rest of api-types
// (OD2-A: no generated client).

/** Every action the backend records, for the filter select. */
export const AUDIT_ACTION_OPTIONS = [
  'user.create',
  'user.update',
  'user.role_change',
  'user.deactivate',
  'user.password_reset', // admin reset someone else's
  'user.password_change', // self-service (actorId === targetId)
  'auth.login_success',
  'auth.login_failed',
  'auth.locked',
  'opco.create',
  'opco.update',
  'catalog.update',
  'allocation.import',
  'drift.resolve',
] as const;

/** Target types the backend whitelists, for the filter select. */
export const AUDIT_TARGET_TYPE_OPTIONS = [
  'AppUser',
  'Opco',
  'SkuCatalog',
  'DriftAlert',
  'AllocationImport',
] as const;

/**
 * Semantic tint per action (DS-8) — token palette only. Security-relevant
 * events are tinted so they read as something to look at; routine changes stay
 * neutral. Unknown actions (backend ahead of frontend) fall back to neutral.
 */
export function auditActionTone(action: string): BadgeTone {
  switch (action) {
    case 'user.role_change': // privilege change — the event auditors care most about
    case 'auth.login_failed':
      return 'warn';
    case 'auth.locked':
      return 'danger';
    case 'drift.resolve':
      return 'ok';
    case 'auth.login_success':
      return 'info';
    default:
      return 'neutral';
  }
}

/**
 * Serialise filters → the GET /admin/audit query string. Skips empty values so
 * "All actions" simply omits the param. Returns '' when nothing is set.
 */
export function auditQueryString(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
