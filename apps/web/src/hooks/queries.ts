import { useQuery } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/api';
import type {
  ActivityEvent,
  AdminOpco,
  AdminUser,
  AgentKillSwitchStatus,
  AgentConversation,
  AgentProfile,
  AgentReviewStats,
  AgentRun,
  AgentRunPage,
  AuditFilters,
  AuditPage,
  ConnectorStatus,
  DriftAlert,
  LedgerRow,
  LedgerStats,
  MeResponse,
  OnboardingRequest,
  Opco,
  OutboundFailureFilters,
  OutboundFailurePage,
  PermissionEntry,
  RequestDetail,
  Role,
  SkuCatalog,
  TenantSkuRow,
  TenantSkuStats,
} from '@/lib/api-types';
import { getLocalProfile } from '@/lib/auth/local-profile';
import { auditQueryString } from '@/lib/audit';
import {
  agentRunsQueryString,
  type AgentRunFilters,
} from '@/lib/agent-registry';

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

/**
 * GET /auth/sso/status — can this deployment offer SSO (ADR-0028)? Public and
 * side-effect free, so the login screen can ask before any session exists.
 *
 * 🔴 A RUNTIME answer. Under ADR-0003 this was a build-time constant baked into
 * the bundle (`msalConfigured`), which meant every Entra config change needed a
 * rebuild. `staleTime: Infinity` because deployment config cannot change while
 * the page is open; `retry: false` because an unreachable API should leave the
 * button off, not stall the login screen behind three attempts.
 */
export function useSsoStatus() {
  return useQuery({
    queryKey: ['auth', 'sso-status'],
    queryFn: () => apiGet<{ enabled: boolean }>('/auth/sso/status'),
    staleTime: Infinity,
    retry: false,
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

/**
 * GET /license/ledger — per-OpCo per-SKU ledger rows (opco-scoped, active-only).
 * CH-008: 0/0 rows are excluded server-side unless includeEmpty. It is part of
 * the query key so the two variants cannot serve each other from cache; the
 * ['license','ledger'] invalidation prefix still covers both.
 *
 * Only the Assets By-OpCo toggle passes true. Request detail (CH-009) must NOT
 * — see CH-009 spec §2.4: a missing row there already reads as "no allocation
 * set", which is exactly what a 0/0 cell means.
 */
export function useLedger(includeEmpty = false) {
  return useQuery({
    queryKey: ['license', 'ledger', { includeEmpty }],
    queryFn: () =>
      apiGet<LedgerRow[]>(
        includeEmpty ? '/license/ledger?includeEmpty=true' : '/license/ledger',
      ),
  });
}

/** GET /license/ledger/stats — scoped aggregate for the Assets + Overview KPIs. */
export function useLedgerStats(includeEmpty = false) {
  return useQuery({
    queryKey: ['license', 'ledger', 'stats', { includeEmpty }],
    queryFn: () =>
      apiGet<LedgerStats>(
        includeEmpty
          ? '/license/ledger/stats?includeEmpty=true'
          : '/license/ledger/stats',
      ),
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

/**
 * GET /agent/kill-switch — 期二 G3. ADMIN-only, so a 403 is authoritative and
 * the tab degrades to a restricted state rather than retrying.
 */
export function useAgentKillSwitch() {
  return useQuery({
    queryKey: ['agent', 'kill-switch'],
    queryFn: () => apiGet<AgentKillSwitchStatus>('/agent/kill-switch'),
    retry: retryUnless403,
  });
}

/**
 * GET /agent/review-stats — 期二 G7 (R13). ADMIN-only.
 *
 * The window is part of the query key so each one caches independently, the
 * same shape the audit filters use.
 */
export function useAgentReviewStats(days: number) {
  return useQuery({
    queryKey: ['agent', 'review-stats', days],
    queryFn: () => apiGet<AgentReviewStats>(`/agent/review-stats?days=${days}`),
    retry: retryUnless403,
  });
}

/**
 * GET /admin/audit — the platform audit trail (W29 F4). ADMIN-only: the rows
 * carry P-B whitelisted PII, so a 403 is authoritative (retryUnless403) and the
 * /audit page degrades to a restricted state. Filters are part of the query key
 * so each filter/page combination caches independently.
 */
export function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: () =>
      apiGet<AuditPage>(`/admin/audit${auditQueryString(filters)}`),
    retry: retryUnless403,
  });
}

/**
 * GET /fulfilment/activity — the operational feed (CH-006). Open to all three
 * roles and opco-scoped server-side, so unlike useAuditLog there is no 403 to
 * design around: an OPCO_IT operator gets its own OpCo's events.
 */
export function useActivity(limit: number) {
  return useQuery({
    queryKey: ['fulfilment', 'activity', limit],
    queryFn: () =>
      apiGet<ActivityEvent[]>(`/fulfilment/activity?limit=${limit}`),
    retry: retryUnless403,
  });
}

/**
 * GET /admin/integrations — connector rows (W30). ADMIN-only: it describes how
 * the platform is wired to its vendors, so a 403 is authoritative and the tab
 * degrades to a restricted state.
 */
export function useIntegrations() {
  return useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: () => apiGet<ConnectorStatus[]>('/admin/integrations'),
    retry: retryUnless403,
  });
}

/**
 * GET /admin/outbound-failures — the delivery failure queue (W31 / ADR-0011).
 * ADMIN + REGIONAL, so a 403 is authoritative (retryUnless403) and the page
 * degrades to a restricted state. Filters are part of the query key so each
 * filter combination caches independently.
 */
export function useOutboundFailures(filters: OutboundFailureFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['admin', 'outbound-failures', filters],
    queryFn: () =>
      apiGet<OutboundFailurePage>(
        `/admin/outbound-failures${qs ? `?${qs}` : ''}`,
      ),
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

/**
 * W46 F8 — the most recent AI-Assist run on a request, or null.
 *
 * "Most recent" rather than "the open one": a finished run's proposals and
 * transcript are still what a person opens the card to read.
 *
 * 🔴 Still no polling — and since 期二 G6 that is no longer a gap being lived
 * with. `useAgentRunEvents` opens an SSE connection while a run is live and
 * invalidates THIS query on every change (ADR-0039 F10), so the card updates
 * without an interval that would bill a request every few seconds whether or
 * not anything moved.
 *
 * 🟢 Which is why this hook did not change: a notify-then-refetch channel and a
 * poll read the same endpoint, so if ACA's ingress turns out to buffer SSE
 * (F7 / R22), the fallback is an option on this query — not a contract change.
 */
export function useAgentRun(requestId: string | undefined) {
  return useQuery({
    queryKey: ['agent', 'runs', requestId],
    queryFn: () =>
      // W47 F4 — moved from `/agent/runs?requestId=`, which now means "every
      // run" and returns a paged summary rather than one full run.
      apiGet<AgentRun | null>(`/agent/runs/latest?requestId=${requestId}`),
    enabled: Boolean(requestId),
  });
}

/**
 * W47 F5 — every agent profile, retired ones included.
 *
 * `includeInactive=true` because this is the screen that MANAGES them: a retired
 * profile that vanishes from the only page that could bring it back is a profile
 * nobody can un-retire. The run list beside it still shows retired profiles by
 * name, since historical runs point at them.
 */
export function useAgentProfiles() {
  return useQuery({
    queryKey: ['agent', 'profiles'],
    queryFn: () =>
      apiGet<AgentProfile[]>('/agent/profiles?includeInactive=true'),
    retry: retryUnless403,
  });
}

/**
 * W47 F5 — the global run list, cursor-paged.
 *
 * ⚠️ The filters are part of the query key, so each combination caches
 * separately — including `cursor`. That is what makes paging back and forth
 * instant rather than refetching, and it is the same convention `useAuditLog`
 * uses for its offset.
 */
export function useAgentRuns(filters: AgentRunFilters) {
  return useQuery({
    queryKey: ['agent', 'runs', 'all', filters],
    queryFn: () =>
      apiGet<AgentRunPage>(`/agent/runs${agentRunsQueryString(filters)}`),
    retry: retryUnless403,
  });
}

/**
 * W48 F5 — this person's threads.
 *
 * ⚠️ Archived ones are NOT fetched. `/assistant` is a place to talk, not to
 * manage a history: an archived thread is one somebody put away, and the way
 * back is to unarchive it deliberately rather than to scroll past it. That
 * differs from `useAgentProfiles`, which DOES ask for retired rows — because
 * that screen is the only place a retired profile can be brought back, and
 * hiding it there would strand it.
 */
export function useAgentConversations() {
  return useQuery({
    queryKey: ['agent', 'conversations'],
    queryFn: () => apiGet<AgentConversation[]>('/agent/conversations'),
    retry: retryUnless403,
  });
}

/** One thread, with its turns and the runs it started. */
export function useAgentConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['agent', 'conversations', id],
    queryFn: () => apiGet<AgentConversation>(`/agent/conversations/${id}`),
    enabled: Boolean(id),
    retry: retryUnless403,
  });
}
