import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiPost } from '@/lib/api';
import type {
  AdminUser,
  ChangePasswordBody,
  CreateRequestBody,
  CreateUserBody,
  LedgerImportResult,
  LedgerRow,
  LineItemStage,
  OnboardingRequest,
  ReconcileResult,
  RequestLineItem,
  ResetPasswordBody,
  UpdateLedgerBody,
  UpdateUserBody,
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
 * POST /requests — IT opens a standalone license request (Phase 乙 outbound,
 * ADR-0008 D1). The backend creates the ServiceNow ticket via the provider then
 * a local mirror (fail-closed); it enforces OpCo scope + SKU validity and its
 * error message is surfaced by apiPost. Invalidates the requests list.
 */
export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRequestBody) =>
      apiPost<OnboardingRequest>('/requests', body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] }),
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

/**
 * POST /license/ledger/import — load the O365 allocation CSV into the ledger
 * (ADR-0004 / W13). Same hook drives both the dry-run preview and the commit
 * (dryRun flag). The backend enforces role + curation-as-scope; the UI shows the
 * server's classified preview and surfaces error messages (see apiPost).
 */
export function useAllocationImport() {
  return useMutation({
    mutationFn: (vars: { csv: string; dryRun: boolean }) =>
      apiPost<LedgerImportResult>('/license/ledger/import', vars),
  });
}

/**
 * PATCH /license/ledger/:id — manual per-row ledger correction (W23-B / ADR-0007).
 * Returns the updated row. Invalidates the ledger + its stats (['license','ledger']
 * prefix covers both), the tenant-skus Platform totals (Σ of the ledger), and drift
 * (Σ assigned feeds reconciliation). The backend enforces scope (assertOpcoScope →
 * 403) + non-negative; the UI surfaces its error message.
 */
export function useUpdateLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateLedgerBody }) =>
      apiPatch<LedgerRow>(`/license/ledger/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['license', 'tenant-skus'] });
      qc.invalidateQueries({ queryKey: ['license', 'drift'] });
    },
  });
}

// User admin (AUTH-4b). ADMIN-only endpoints; the backend enforces every rule
// (email uniqueness, role↔scope, last-admin / self safety) and its message is
// surfaced by apiPost/apiPatch for the caller's toast.

/** POST /admin/users — create a local account with an admin-set password. */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) =>
      apiPost<AdminUser>('/admin/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/** PATCH /admin/users/:id — change role / OpCo scope / active. */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateUserBody }) =>
      apiPatch<AdminUser>(`/admin/users/${vars.id}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// Password lifecycle (AUTH-4c-A). Both endpoints return 204 (no body).

/** PATCH /me/password — a local user changes their own password. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      apiPatch<void>('/me/password', body),
  });
}

/** POST /admin/users/:id/reset-password — admin sets a new password (force-change on next login). */
export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: ResetPasswordBody }) =>
      apiPost<void>(`/admin/users/${vars.id}/reset-password`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}
