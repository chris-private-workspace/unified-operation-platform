import { useQuery } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/api';
import type {
  DriftAlert,
  LedgerRow,
  LedgerStats,
  OnboardingRequest,
  RequestDetail,
  SkuCatalog,
  TenantSkuRow,
  TenantSkuStats,
} from '@/lib/api-types';

// A 403 (OPCO_IT hitting a tenant-admin surface) is authoritative — never retry
// it; still retry transient failures a couple of times.
const retryUnless403 = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status === 403) && count < 2;

// Read-only TanStack Query hooks over the existing API surface (FE-1 consumes
// GET only; write flows land in later screen phases). Query keys are namespaced
// so later mutations can invalidate them.

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
