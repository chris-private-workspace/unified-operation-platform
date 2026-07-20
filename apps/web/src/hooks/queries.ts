import { useQuery } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/api';
import type {
  AdminOpco,
  AdminUser,
  DriftAlert,
  LedgerRow,
  LedgerStats,
  MeResponse,
  OnboardingRequest,
  Opco,
  PermissionEntry,
  RequestDetail,
  Role,
  SkuCatalog,
  TenantSkuRow,
  TenantSkuStats,
} from '@/lib/api-types';
import { getLocalProfile } from '@/lib/auth/local-profile';

// A 403 (OPCO_IT hitting a tenant-admin surface) is authoritative — never retry
// it; still retry transient failures a couple of times.
const retryUnless403 = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status === 403) && count < 2;

// Read-only TanStack Query hooks over the existing API surface (FE-1 consumes
// GET only; write flows land in later screen phases). Query keys are namespaced
// so later mutations can invalidate them.

/**
 * GET /me — the signed-in operator's real identity + role/scope (AUTH-3b). The
 * SSOT for role across every session type (local cookie / Entra Bearer / dev-
 * bypass). A local session seeds initialData from its stored profile so the real
 * role is available instantly (no loading flash); opcoScope (code/displayName) is
 * only in the /me payload, so it fills in on the first fetch. Never retried past a
 * 401 — the refresh-retry in api.ts already handles that.
 */
export function useMe() {
  const profile = getLocalProfile();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<MeResponse>('/me'),
    initialData: profile
      ? {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role as Role,
          opcoScopeId: profile.opcoScopeId,
          opcoScope: null, // not in the profile; the /me fetch fills it in
          mustChangePassword: profile.mustChangePassword,
        }
      : undefined,
  });
}

/** GET /license/catalog — SKU dictionary. */
export function useCatalog() {
  return useQuery({
    queryKey: ['license', 'catalog'],
    queryFn: () => apiGet<SkuCatalog[]>('/license/catalog'),
  });
}

/** GET /license/drift — total-level drift alerts. */
export function useDrift() {
  return useQuery({
    queryKey: ['license', 'drift'],
    queryFn: () => apiGet<DriftAlert[]>('/license/drift'),
  });
}

/** GET /license/ledger — per-OpCo per-SKU ledger rows (opco-scoped, active-only). */
export function useLedger() {
  return useQuery({
    queryKey: ['license', 'ledger'],
    queryFn: () => apiGet<LedgerRow[]>('/license/ledger'),
  });
}

/** GET /license/ledger/stats — scoped aggregate for the Assets + Overview KPIs. */
export function useLedgerStats() {
  return useQuery({
    queryKey: ['license', 'ledger', 'stats'],
    queryFn: () => apiGet<LedgerStats>('/license/ledger/stats'),
  });
}

/**
 * GET /license/tenant-skus — tenant-level per-SKU rows (Platform mode). Lazy:
 * only fires when `enabled` (the Platform tab is active), so By-OpCo users never
 * trigger the 403. ADMIN / REGIONAL only.
 */
export function useTenantSkus(enabled: boolean) {
  return useQuery({
    queryKey: ['license', 'tenant-skus'],
    queryFn: () => apiGet<TenantSkuRow[]>('/license/tenant-skus'),
    enabled,
    retry: retryUnless403,
  });
}

/** GET /license/tenant-skus/stats — tenant aggregate for the Platform recon tiles. */
export function useTenantSkuStats(enabled: boolean) {
  return useQuery({
    queryKey: ['license', 'tenant-skus', 'stats'],
    queryFn: () => apiGet<TenantSkuStats>('/license/tenant-skus/stats'),
    enabled,
    retry: retryUnless403,
  });
}

/**
 * GET /admin/users — all users for the admin console (AUTH-4b). ADMIN-only; a
 * 403 (non-admin) is authoritative (retryUnless403) so the Users & roles tab can
 * show a restricted state instead of spinning. Only mounts when the tab is open.
 */
export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiGet<AdminUser[]>('/admin/users'),
    retry: retryUnless403,
  });
}

/** GET /admin/opcos — active OpCos for the create-user scope selector. */
export function useAdminOpcos() {
  return useQuery({
    queryKey: ['admin', 'opcos'],
    queryFn: () => apiGet<AdminOpco[]>('/admin/opcos'),
    retry: retryUnless403,
  });
}

/**
 * GET /admin/opcos?includeInactive=true — rich OpCo list for the management
 * panel (CH-004, ADMIN / REGIONAL). Includes deactivated OpCos so they can be
 * reactivated. 403 for OPCO_IT → the panel shows a restricted state.
 */
export function useManageOpcos() {
  return useQuery({
    queryKey: ['admin', 'opcos', 'manage'],
    queryFn: () => apiGet<Opco[]>('/admin/opcos?includeInactive=true'),
    retry: retryUnless403,
  });
}

/**
 * GET /admin/permissions — the role × endpoint matrix, derived live from the
 * backend's @Roles metadata (W28 / ADR-0009 Decision 8.5). ADMIN-only: it
 * enumerates every route in the app, so a 403 is authoritative and the tab
 * degrades to a restricted state. Only mounts when the tab is open.
 */
export function usePermissions() {
  return useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => apiGet<PermissionEntry[]>('/admin/permissions'),
    retry: retryUnless403,
  });
}

/** GET /opcos — active OpCos for picker selectors (ADMIN / REGIONAL / OPCO_IT). */
export function useOpcos() {
  return useQuery({
    queryKey: ['opcos'],
    queryFn: () => apiGet<AdminOpco[]>('/opcos'),
  });
}

/** GET /fulfilment/requests — onboarding requests (with opco + lineItems). */
export function useRequests() {
  return useQuery({
    queryKey: ['fulfilment', 'requests'],
    queryFn: () => apiGet<OnboardingRequest[]>('/fulfilment/requests'),
  });
}

/** GET /fulfilment/requests/:id — one request with line items (sku) + events. */
export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['fulfilment', 'requests', id],
    queryFn: () => apiGet<RequestDetail>(`/fulfilment/requests/${id}`),
    enabled: Boolean(id),
  });
}
