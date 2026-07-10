import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiPost } from '@/lib/api';
import type {
  LineItemStage,
  OnboardingRequest,
  ReconcileResult,
  RequestLineItem,
} from '@/lib/api-types';

// Write hooks for the request detail (OD1=B). Each does query invalidation in
// onSuccess; callers attach toast feedback via mutate(vars, { onSuccess/onError }).
// The backend enforces every gate (stage/sync/seat) — the frontend just calls
// and surfaces the server's error message (see apiPatch).

const base = '/fulfilment/requests';

/** PATCH …/:lineItemId/stage — advance a line item to the next legal stage. */
export function useAdvanceStage(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { lineItemId: string; toStage: LineItemStage }) =>
      apiPatch<RequestLineItem>(
        `${base}/${requestId}/line-items/${vars.lineItemId}/stage`,
        { toStage: vars.toStage },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

/** PATCH …/:lineItemId/assign — assign the license (sync/seat gated backend). */
export function useAssignLineItem(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { lineItemId: string; usageLocation?: string }) =>
      apiPatch<RequestLineItem>(
        `${base}/${requestId}/line-items/${vars.lineItemId}/assign`,
        vars.usageLocation ? { usageLocation: vars.usageLocation } : undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
      // assignment moves the ledger, so drift may change too
      qc.invalidateQueries({ queryKey: ['license', 'drift'] });
    },
  });
}

/** PATCH …/:id/sync — open the Azure sync gate (Phase-1 simulation). */
export function useMarkSynced(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPatch<OnboardingRequest>(`${base}/${requestId}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

/**
 * POST /license/reconcile — run total-level reconciliation (Graph → drift).
 * The backend hits Microsoft Graph; on a Graph outage it returns a clean 503
 * (BE-graph-harden) whose message apiPost surfaces for the caller's toast.
 */
export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<ReconcileResult>('/license/reconcile'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license', 'drift'] });
    },
  });
}
