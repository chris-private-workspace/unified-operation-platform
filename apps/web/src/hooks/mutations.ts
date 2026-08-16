import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type {
  AddLineItemBody,
  AdminUser,
  AgentKillSwitchStatus,
  AgentRun,
  AllocationResetBody,
  AllocationResetResult,
  AssignResult,
  ChangePasswordBody,
  ConnectorConfig,
  CreateOpcoBody,
  CreateRequestBody,
  CreateUserBody,
  ImportFromServiceNowBody,
  LedgerFullResetBody,
  LedgerFullResetResult,
  CatalogImportBody,
  CatalogImportResult,
  LedgerImportResult,
  LedgerRow,
  LineItemStage,
  OnboardingRequest,
  Opco,
  OutboundFailure,
  ProbeResult,
  ReconcileResult,
  RequestLineItem,
  ResetPasswordBody,
  ServiceNowLookupResult,
  SkuCatalog,
  SyncCheckResult,
  UpdateCatalogBody,
  UpdateLedgerBody,
  UpdateOpcoBody,
  UpdateRequestBody,
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

/**
 * PATCH …/:lineItemId/assign — assign the license (sync/seat/budget gated
 * backend). `budgetOverrideReason` is ADMIN-only (W36 / ADR-0016 D3): a
 * non-admin sending it gets a 403 rather than a silently ignored field, so the
 * UI must only ever put it on the wire for an admin.
 *
 * ADR-0029 — answers `AssignResult`, not the bare line item. The line item is
 * still in there as `.lineItem`; what is new is the per-step breakdown that
 * comes with it, on success AND (as the 400 body) on a refusal.
 */
export function useAssignLineItem(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      lineItemId: string;
      usageLocation?: string;
      budgetOverrideReason?: string;
    }) => {
      // Build the body from what is actually set, and keep sending `undefined`
      // when nothing is — an empty `{}` would put an override field nowhere
      // near the wire but still change the request shape for every plain assign.
      const body = {
        ...(vars.usageLocation && { usageLocation: vars.usageLocation }),
        ...(vars.budgetOverrideReason && {
          budgetOverrideReason: vars.budgetOverrideReason,
        }),
      };
      return apiPatch<AssignResult>(
        `${base}/${requestId}/line-items/${vars.lineItemId}/assign`,
        Object.keys(body).length > 0 ? body : undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
      // assignment moves the ledger, so drift may change too
      qc.invalidateQueries({ queryKey: ['license', 'drift'] });
      // …and assignedQuantity itself moved (+1). The prefix also covers
      // ['license','ledger','stats']. Required by CH-009: request detail now
      // renders that number next to the Assign button, so leaving it cached
      // would show the operator a stale budget straight after assigning.
      // NOT tenant-skus: that reads TenantSkuSnapshot, which an assign does
      // not touch (it is deliberately an as-of-last-sync figure).
      qc.invalidateQueries({ queryKey: ['license', 'ledger'] });
    },
  });
}

/**
 * PATCH …/:id — edit the request header (CH-007). The backend strips sync keys
 * and gates targetUpn on sync; a 409/403 message is surfaced by apiPatch.
 */
export function useUpdateRequest(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateRequestBody) =>
      apiPatch<OnboardingRequest>(`${base}/${requestId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

/** POST …/:id/line-items — author a line item (intake requests only, CH-007 D6). */
export function useAddLineItem(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddLineItemBody) =>
      apiPost<RequestLineItem>(`${base}/${requestId}/line-items`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

/** DELETE …/:id/line-items/:lineItemId — remove an unsent REQUESTED line (D5). */
export function useRemoveLineItem(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineItemId: string) =>
      apiDelete<{ id: string; removed: boolean }>(
        `${base}/${requestId}/line-items/${lineItemId}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

/**
 * POST …/:id/sync-check — CH-015. Ask Graph now instead of waiting for the
 * ten-minute sweep. A miss writes nothing, so invalidating on every outcome is
 * harmless and keeps the timeline correct on a hit.
 */
/* ── W46 F8 / ADR-0036 — AI-Assist runs ──────────────────────
 *
 * All four invalidate the SAME key, and one of them invalidates the request
 * too: approving a proposal creates real line items through the existing path,
 * so a request detail left on screen would otherwise still show the old lines
 * next to a run that says it created them.
 */

const agentRunKey = (requestId: string) => ['agent', 'runs', requestId];

export function useStartAgentRun(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<AgentRun>('/agent/runs', { requestId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentRunKey(requestId) });
    },
  });
}

/**
 * Stop a run and reject whatever was still waiting on it.
 *
 * ⚠️ It does not reach into the model — a run is only inside the runtime for
 * the duration of one request. What this ends is the platform's own state: a
 * run parked on a decision that is never coming.
 */
export function useAbortAgentRun(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiPost<AgentRun>(`/agent/runs/${runId}/abort`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentRunKey(requestId) });
    },
  });
}

/**
 * PATCH /agent/kill-switch — 期二 G3. ADMIN-only.
 *
 * Invalidates the review stats too: switching the agent off is exactly when
 * somebody is looking at both, and a stale approval rate beside a freshly
 * flipped switch is the kind of small inconsistency that makes a person
 * distrust the screen at the worst moment.
 */
export function useSetAgentKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { enabled: boolean; reason?: string }) =>
      apiPatch<AgentKillSwitchStatus>('/agent/kill-switch', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent'] });
    },
  });
}

export function useDecideProposal(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; reason?: string }) =>
      input.reason === undefined
        ? apiPost<unknown>(`/agent/proposals/${input.proposalId}/approve`)
        : apiPost<unknown>(`/agent/proposals/${input.proposalId}/reject`, {
            reason: input.reason,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentRunKey(requestId) });
      // The approval path creates line items through RequestService, so the
      // request itself has moved on too.
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

export function useSyncCheck(requestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<SyncCheckResult>(`${base}/${requestId}/sync-check`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests', requestId] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'requests'] });
    },
  });
}

/**
 * PATCH …/:id/sync — assert the gate open WITHOUT asking Graph.
 *
 * CH-015 kept this as the break-glass it always was (ADR-0015 D3): when Graph is
 * unreachable someone still needs a way through. Prefer useSyncCheck — that one
 * has evidence behind it.
 */
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
 * POST /license/ledger/allocation/reset — zero allocatedQuantity so a bad
 * import can be redone (CH-016). Same hook drives the dry-run preview and the
 * commit, like the import above.
 *
 * Unlike the import it invalidates the ledger, and only on a real commit: a
 * dry-run changed nothing, so refetching after one would just be noise.
 */
export function useAllocationReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: AllocationResetBody) =>
      apiPost<AllocationResetResult>('/license/ledger/allocation/reset', vars),
    onSuccess: (res) => {
      if (res.dryRun) return;
      qc.invalidateQueries({ queryKey: ['license', 'ledger'] });
    },
  });
}

/**
 * POST /license/ledger/reset — zero BOTH ledger numbers (CH-017 / ADR-0022).
 *
 * A separate hook from the one above rather than a flag on it, mirroring the
 * backend split: the two endpoints do not carry the same risk (this one wipes a
 * baseline no import can rebuild) or the same roles (ADMIN only).
 */
export function useLedgerFullReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: LedgerFullResetBody) =>
      apiPost<LedgerFullResetResult>('/license/ledger/reset', vars),
    onSuccess: (res) => {
      if (res.dryRun) return;
      qc.invalidateQueries({ queryKey: ['license', 'ledger'] });
    },
  });
}

/**
 * POST /admin/integrations/:key/test — run one read-only probe (W30 / ADR-0010
 * D5). Invalidates the connector list so the row picks up the stored result.
 * The backend throttles per connector (10s → 429); the UI just surfaces the
 * server's message rather than tracking the cooldown itself.
 */
export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiPost<ProbeResult>(`/admin/integrations/${key}/test`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
    },
  });
}

/**
 * PATCH /admin/integrations/:key/config — update a connector's non-secret config
 * (W34 / ADR-0013). ADMIN-only. Returns the refreshed config and invalidates the
 * connector list so the row reflects the new values. Changes take effect on the
 * next API restart (C2) — the panel says so.
 */
export function useUpdateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      values,
    }: {
      key: string;
      values: Record<string, string | null>;
    }) =>
      apiPatch<ConnectorConfig>(`/admin/integrations/${key}/config`, {
        values,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'integrations'] });
    },
  });
}

/**
 * Repair / abandon / reopen a queued outbound failure (W31 / ADR-0011).
 *
 * One hook, because all three are the same shape — but the CALLER must not
 * present them as one generic action: what `retry` does depends on the failure's
 * kind, and for `request.mirror` it writes local rows without contacting
 * ServiceNow (D3). See repairAction() in lib/outbound-failures.
 *
 * A repair can create a request (submit kind) or write one locally (mirror
 * kind), so the requests list and the audit trail are both invalidated.
 */
export function useRepairFailure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      action: 'retry' | 'abandon' | 'reopen';
    }) =>
      apiPost<OutboundFailure>(
        `/admin/outbound-failures/${vars.id}/${vars.action}`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'outbound-failures'] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
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

/**
 * PATCH /license/catalog/:id — curate alias / category / base-flag (CH-003).
 * ADMIN / REGIONAL only (backend @Roles); invalidates the catalog list so the
 * table + any category grouping refreshes. Server message surfaces for the toast.
 */
export function useUpdateCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateCatalogBody }) =>
      apiPatch<SkuCatalog>(`/license/catalog/${vars.id}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['license', 'catalog'] }),
  });
}

/**
 * POST /license/catalog/import — bulk curation from an edited export
 * (CH-019 / ADR-0023). Same hook drives the dry-run preview and the commit,
 * like the allocation import above.
 *
 * Invalidates only on a real commit: a dry run wrote nothing, so refetching
 * after one is noise. The backend owns both gates (alias collisions, alias
 * clears) — the panel renders what it refuses, it never decides.
 */
export function useCatalogImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CatalogImportBody) =>
      apiPost<CatalogImportResult>('/license/catalog/import', vars),
    onSuccess: (res) => {
      if (!res.dryRun) {
        qc.invalidateQueries({ queryKey: ['license', 'catalog'] });
      }
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

// OpCo management (CH-004). ADMIN / REGIONAL; the backend enforces code
// uniqueness (409) + immutability. Invalidating ['admin','opcos'] refreshes both
// the management panel and the user-scope selector; ['opcos'] the pickers; and
// ['license','ledger'] so a new OpCo appears in the Assets By-OpCo table.

/** POST /admin/opcos — create an Operating Company. */
export function useCreateOpco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOpcoBody) => apiPost<Opco>('/admin/opcos', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'opcos'] });
      qc.invalidateQueries({ queryKey: ['opcos'] });
      qc.invalidateQueries({ queryKey: ['license', 'ledger'] });
    },
  });
}

/** PATCH /admin/opcos/:id — edit displayName / company / costCenter / active. */
export function useUpdateOpco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateOpcoBody }) =>
      apiPatch<Opco>(`/admin/opcos/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'opcos'] });
      qc.invalidateQueries({ queryKey: ['opcos'] });
      qc.invalidateQueries({ queryKey: ['license', 'ledger'] });
    },
  });
}

// ── CH-013 / ADR-0021 — import a real ServiceNow REQ (ADMIN only) ──

/**
 * GET /requests/servicenow-lookup — but as a mutation, deliberately.
 *
 * It is a read, yet every call costs a round-trip to a shared corporate
 * ServiceNow instance (1 + N GETs). A `useQuery` would refetch on mount, on
 * focus, on reconnect — none of which the operator asked for. This one fires
 * when a button is pressed and never otherwise.
 */
export function useServiceNowLookup() {
  return useMutation({
    mutationFn: (reqNumber: string) =>
      apiGet<ServiceNowLookupResult>(
        `/requests/servicenow-lookup?req=${encodeURIComponent(reqNumber)}`,
      ),
  });
}

/** POST /requests/import-from-servicenow — creates the platform request. */
export function useServiceNowImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportFromServiceNowBody) =>
      apiPost<OnboardingRequest>('/requests/import-from-servicenow', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['fulfilment', 'activity'] });
    },
  });
}
