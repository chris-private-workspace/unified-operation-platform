import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type {
  DriftAlert,
  LedgerRow,
  LedgerStats,
  OnboardingRequest,
  RequestDetail,
  SkuCatalog,
} from '@/lib/api-types';

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
