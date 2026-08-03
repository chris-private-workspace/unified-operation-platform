// Hand-written mirrors of the apps/api response DTOs (OD2-A: no generated
// client, no new dep). Keep in sync with:
//   apps/api/src/license/dto/{catalog,reconcile}.dto.ts
//   apps/api/src/fulfilment/dto/request-view.dto.ts
// Date fields arrive as ISO strings over JSON, so they are typed `string`.

export type DriftStatus = 'OPEN' | 'RESOLVED';

export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type LineItemStage =
  | 'REQUESTED'
  | 'QUOTING'
  | 'OPCO_APPROVED'
  | 'AWAITING_VENDOR'
  | 'READY'
  | 'ASSIGNED'
  | 'CANCELLED';

export type EventType =
  'STAGE_CHANGE' | 'ASSIGN' | 'SYNC' | 'RECONCILE' | 'NOTE';

/** GET /license/catalog → SkuCatalogDto[] */
export interface SkuCatalog {
  id: string;
  skuId: string; // M365 GUID — source of truth
  skuPartNumber: string;
  displayName: string;
  businessAlias: string | null;
  category: string | null;
  isBaseLicense: boolean;
  active: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

/** PATCH /license/catalog/:id body — curated fields only (CH-003). */
export interface UpdateCatalogBody {
  businessAlias?: string | null;
  category?: string | null;
  isBaseLicense?: boolean;
}

/**
 * POST /license/catalog/import → CatalogImportResultDto (CH-019 / ADR-0023).
 * The SKU Catalog export, edited and uploaded back. SKUs are matched on skuId;
 * only the three curated columns are writable.
 */
export interface CatalogImportBody {
  csv: string;
  dryRun?: boolean;
  /** Required to commit when the file clears any business alias (D6). */
  confirmClears?: boolean;
}

export interface CatalogTextChange {
  before: string | null;
  after: string | null;
}

export interface CatalogFlagChange {
  before: boolean;
  after: boolean;
}

export interface CatalogImportChange {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
  /** Present only when that field changed. */
  alias?: CatalogTextChange;
  category?: CatalogTextChange;
  isBaseLicense?: CatalogFlagChange;
  /** Alias goes from a value to none — its consequence is invisible on screen. */
  clearsAlias: boolean;
}

export interface CatalogImportSummary {
  rows: number;
  matched: number;
  changes: number;
  aliasClears: number;
}

export interface CatalogImportResult {
  dryRun: boolean;
  committed: number;
  summary: CatalogImportSummary;
  changes: CatalogImportChange[];
  skippedSkuIds: string[];
  unknownColumns: string[];
}

/** ApiError.detail shape for a 400 the import panel renders (not just toasts). */
export interface CatalogImportErrorDetail {
  code?: string;
  collisions?: { alias: string; skuPartNumbers: string[] }[];
  duplicateSkuIds?: string[];
  duplicateColumns?: string[];
  invalidBaseValues?: { line: number; value: string }[];
  foundColumns?: string[];
  aliasClears?: number;
}

/** POST /license/catalog/sync → CatalogSyncResultDto */
export interface CatalogSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  snapshots: number;
}

/** POST /license/reconcile → ReconcileResultDto */
export interface ReconcileResult {
  checked: number; // active SKUs checked
  opened: number;
  updated: number;
  resolved: number;
  drift: number; // OPEN drift alerts remaining after this run
}

/** POST /license/ledger/import → LedgerImportResultDto (ADR-0004). */
export interface LedgerImportChange {
  opcoCode: string;
  skuBusinessAlias: string;
  skuPartNumber: string;
  before: number;
  target: number;
  delta: number;
}

export interface LedgerImportSummary {
  opcoColumns: number;
  skuRows: number;
  mappedSkuRows: number;
  changes: number;
}

export interface LedgerImportResult {
  dryRun: boolean;
  committed: number;
  summary: LedgerImportSummary;
  changes: LedgerImportChange[];
  skippedSkuLabels: string[];
  unknownOpcoHeaders: string[];
}

/**
 * POST /license/ledger/allocation/reset → AllocationResetResultDto (CH-016).
 * The way back out of a bad import: the import is upsert-only, so a cell that
 * was in the bad CSV but not the corrected one can only be cleared here.
 */
export interface AllocationResetRow {
  opcoCode: string;
  skuPartNumber: string;
  before: number;
  /** false = the SKU is inactive, so re-importing cannot restore this cell */
  skuActive: boolean;
}

export interface AllocationResetBody {
  /** omit / true = preview only; false = write zeros */
  dryRun?: boolean;
  /** limit to one OpCo by code; omit = every OpCo */
  opcoCode?: string;
}

export interface AllocationResetResult {
  dryRun: boolean;
  affected: number;
  /** the OpCo code it was limited to, or 'all' */
  scope: string;
  /** subset of `affected` whose SKU is inactive — re-import cannot restore these */
  irreversible: number;
  rows: AllocationResetRow[];
  /** server-authored consequences text — render verbatim, do not paraphrase */
  warning: string;
}

/**
 * POST /license/ledger/reset → LedgerFullResetResultDto (CH-017 / ADR-0022).
 * The stronger sibling of the allocation reset above: it also zeroes
 * `assignedQuantity`, which no import can rebuild. Rows are never deleted.
 */
export interface LedgerFullResetRow {
  opcoCode: string;
  skuPartNumber: string;
  allocatedBefore: number;
  assignedBefore: number;
  /** false = the SKU is inactive, so re-importing cannot restore even its allocation */
  skuActive: boolean;
}

export interface LedgerFullResetBody {
  /** omit / true = preview only; false = write zeros */
  dryRun?: boolean;
  /** limit to one OpCo by code; omit = every OpCo */
  opcoCode?: string;
  /** required on commit — must equal `opcoCode`, or 'ALL' when unscoped */
  confirm?: string;
}

export interface LedgerFullResetResult {
  dryRun: boolean;
  affected: number;
  /** the OpCo code it was limited to, or 'all' */
  scope: string;
  allocatedCells: number;
  /** cells losing their assigned baseline — NONE are restorable by re-importing */
  assignedCells: number;
  /** subset of allocatedCells whose SKU is inactive */
  irreversibleAllocated: number;
  rows: LedgerFullResetRow[];
  /** server-authored consequences text — render verbatim, do not paraphrase */
  warning: string;
}

/** OpCo reference embedded in a ledger row (GET /license/ledger). */
export interface LedgerOpcoRef {
  code: string;
  displayName: string;
}

/** SKU reference embedded in a ledger row. */
export interface LedgerSkuRef {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
  category: string | null;
}

/**
 * GET /license/ledger → LedgerRowDto[] (W14). Two-layer numbers per DESIGN §5:
 * allocatedQuantity = owned/budget, assignedQuantity = assigned. headroom /
 * overAllocated are backend-derived; utilization % is a display-layer concern.
 */
export interface LedgerRow {
  id: string;
  opcoId: string;
  skuCatalogId: string;
  allocatedQuantity: number;
  assignedQuantity: number;
  headroom: number; // allocatedQuantity - assignedQuantity
  overAllocated: boolean; // assignedQuantity > allocatedQuantity
  opco: LedgerOpcoRef;
  sku: LedgerSkuRef;
}

/**
 * PATCH /license/ledger/:id body (W23-B / ADR-0007) — manual set of one or both
 * ABSOLUTE quantities + an optional audited reason. At least one quantity must be
 * supplied; non-negative ints (the backend also enforces both).
 */
export interface UpdateLedgerBody {
  allocatedQuantity?: number;
  assignedQuantity?: number;
  reason?: string;
}

/** GET /license/ledger/stats → LedgerStatsDto (scoped aggregate for the KPIs). */
export interface LedgerStats {
  totalAllocated: number;
  totalAssigned: number;
  totalHeadroom: number;
  skusTracked: number;
  opcosTracked: number;
  overAllocatedCount: number;
}

/**
 * GET /license/tenant-skus → TenantSkuRowDto[] (W16). Tenant three-layer view
 * (DESIGN §5): owned (M365 prepaidUnits.enabled) → allocatedToOpcos (Σ OpCo
 * budget) → assignedToUsers. owned / tenantConsumed / unallocated are null when
 * a SKU is allocated but never synced from tenant. ADMIN / REGIONAL only — a
 * GET by OPCO_IT returns 403 (Platform view is a tenant-wide admin surface).
 */
export interface TenantSkuRow {
  skuCatalogId: string;
  sku: LedgerSkuRef;
  owned: number | null;
  tenantConsumed: number | null;
  allocatedToOpcos: number;
  assignedToUsers: number;
  unallocated: number | null; // owned - allocatedToOpcos
  overAllocated: boolean; // allocatedToOpcos > owned
}

/**
 * POST /auth/login & POST /auth/refresh → SessionResponseDto (ADR-0006 §7). The
 * access + refresh tokens are delivered as httpOnly cookies; the body only carries
 * the signed-in identity.
 */
export interface SessionResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    opcoScopeId: string | null;
    mustChangePassword: boolean; // AUTH-4c-A force-change-on-first-login
  };
}

/**
 * GET /me → MeDto (AUTH-3a/3b) — the signed-in operator's real identity + role +
 * OpCo scope. The SSOT the frontend consumes for role display / gating.
 */
export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  opcoScopeId: string | null;
  opcoScope: OpcoRef | null; // { code, displayName } — set for OPCO_IT
  mustChangePassword: boolean;
}

/** PATCH /me/password body (AUTH-4c-A self-service change). */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/** POST /admin/users/:id/reset-password body (AUTH-4c-A admin reset). */
export interface ResetPasswordBody {
  newPassword: string;
}

/** App roles (Prisma Role enum). */
export type Role = 'ADMIN' | 'REGIONAL' | 'OPCO_IT';

/**
 * GET /admin/users → AdminUserDto[] (AUTH-4b). Covers both providers; the
 * backend never serialises passwordHash. ADMIN-only — a non-admin caller gets
 * 403 (the Users & roles tab degrades to a restricted state).
 */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  opcoScopeId: string | null;
  opcoScope: OpcoRef | null; // { code, displayName }
  authProvider: string; // 'entra' | 'local'
  active: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean; // local account still on an admin-set password
}

/**
 * GET /admin/opcos → thin shape the create-user scope selector + pickers use.
 * The endpoint now returns the richer Opco (below); this stays a subset.
 */
export interface AdminOpco {
  id: string;
  code: string;
  displayName: string;
}

/** GET /admin/opcos (rich) — the OpCo management panel (CH-004). */
export interface Opco {
  id: string;
  code: string;
  displayName: string;
  company: string;
  costCenter: string | null;
  active: boolean;
}

/** POST /admin/opcos body — create an OpCo (code immutable after this). */
export interface CreateOpcoBody {
  code: string;
  displayName: string;
  company: string;
  costCenter?: string | null;
  active?: boolean;
}

/** PATCH /admin/opcos/:id body — edit an OpCo (code is not editable). */
export interface UpdateOpcoBody {
  displayName?: string;
  company?: string;
  costCenter?: string | null;
  active?: boolean;
}

/**
 * How a route is protected (W28 / ADR-0009 Decision 8.5). Derived live from the
 * backend's @Roles metadata — never hand-maintained here.
 * `unguarded` = no @Roles and not on the reviewed allow-list, i.e. any signed-in
 * user can reach it. Treat as a finding, not a state.
 */
export type AccessKind =
  'roles' | 'public' | 'm2m' | 'authenticated' | 'unguarded';

/**
 * GET /admin/permissions → the derived role × endpoint matrix (ADMIN-only; a
 * non-admin caller 403s and the tab shows a restricted state).
 *
 * NOTE: this answers "which role may CALL this endpoint". It does NOT express
 * row-level scope — OPCO_IT is additionally limited to its own OpCo by the
 * backend (AUTH-3a opco-scope.ts), which no endpoint-level matrix can show.
 */
export interface PermissionEntry {
  controller: string;
  handler: string;
  method: string;
  path: string;
  access: AccessKind;
  roles: Role[];
  guards: string[];
}

/**
 * GET /admin/audit → one platform audit-trail event (W29 / ADR-0009). ADMIN-only
 * — before/after may carry P-B whitelisted PII (email / displayName), so a 403
 * for any other role is authoritative and the page degrades to restricted.
 * before/after hold whitelisted fields only; for updates it is the changed-field
 * diff, so keys vary per row.
 */
export interface AuditActor {
  email: string;
  displayName: string;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string; // 'user.role_change' | 'opco.update' | … (backend AUDIT_ACTIONS)
  targetType: string; // 'AppUser' | 'Opco' | 'SkuCatalog' | 'DriftAlert' | 'AllocationImport'
  targetId: string;
  actorId: string | null; // null = system / cron / m2m
  actor: AuditActor | null;
  actorType: 'user' | 'system' | 'm2m';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditPage {
  total: number;
  limit: number;
  offset: number;
  entries: AuditEntry[];
}

/**
 * Outbound delivery failures (W31 / ADR-0011). ADMIN + REGIONAL — wider than
 * the audit trail on purpose: a failed delivery is an operations problem, and
 * `payload` carries only what REGIONAL already sees on the request itself.
 */
export interface OutboundFailure {
  id: string;
  kind: string; // 'request.submit' | 'request.mirror' | 'servicenow.worknote'
  status: string; // 'open' | 'resolved' | 'abandoned'
  /** Whitelisted retry inputs — never credentials. */
  payload: Record<string, unknown> | null;
  /**
   * Side-effects that already happened. Present on request.mirror ONLY — its
   * presence is exactly why that kind must not be re-submitted (D3).
   */
  externalRef: Record<string, unknown> | null;
  lastError: string;
  attemptCount: number;
  lastAttemptAt: string;
  requestId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
}

export interface OutboundFailurePage {
  total: number;
  limit: number;
  offset: number;
  entries: OutboundFailure[];
}

export interface OutboundFailureFilters {
  status?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}

/** GET /admin/audit query — all optional; mirrors apps/api audit-query.dto.ts. */
export interface AuditFilters {
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: string; // ISO 8601
  to?: string;
  limit?: number; // backend caps at 100
  offset?: number;
}

/**
 * GET /admin/integrations → connector rows (W30 / ADR-0010 item 4). ADMIN-only.
 *
 * `state` is DEPLOYMENT SHAPE, not health — `required` means the config is
 * getOrThrow-ed at boot, so the app could not be running without it (a
 * `configured: true` field would be a tautology). A failed probe never changes
 * `state`; it lands in `lastProbe`, which is in-process only and cleared on
 * restart — so it must never be presented as a history.
 */
export type ConnectorState = 'required' | 'active' | 'inactive';

export interface ProbeResult {
  ok: boolean;
  message: string; // safe for display — never the vendor's own error text
  at: string;
}

/** W34 / ADR-0013 — an editable non-secret connector field. */
export interface ConnectorField {
  column: string;
  label: string;
  value: string | null; // non-secret value — a secret value never appears here
  source: 'db' | 'env' | 'unset';
}

/** A secret field: env-only. `configured` says whether env has a value — never the value. */
export interface ConnectorSecret {
  envKey: string;
  label: string;
  configured: boolean;
}

export interface ConnectorConfig {
  editable: ConnectorField[];
  secrets: ConnectorSecret[];
}

export interface ConnectorStatus {
  key: string; // 'graph' | 'servicenow' | 'n8n-outbound' | 'n8n-inbound'
  label: string;
  state: ConnectorState;
  /** When it last demonstrably worked (derived) — NOT when it was last checked. */
  lastSuccessAt: string | null;
  /** Set when lastSuccessAt can never be derived for this connector. */
  lastSuccessNote: string | null;
  lastProbe: ProbeResult | null;
  probeable: boolean;
  probeNote: string | null;
  /** Editable non-secret config + secret configured-status (W34 / ADR-0013). */
  config: ConnectorConfig;
}

/** POST /admin/users body — create a local account (admin sets the password). */
export interface CreateUserBody {
  email: string;
  displayName: string;
  role: Role;
  opcoScopeId?: string | null;
  initialPassword: string;
}

/** PATCH /admin/users/:id body — change role / scope / active. */
export interface UpdateUserBody {
  role?: Role;
  opcoScopeId?: string | null;
  active?: boolean;
}

/** GET /license/tenant-skus/stats → TenantSkuStatsDto (Platform recon tiles). */
export interface TenantSkuStats {
  totalOwned: number;
  totalAllocated: number;
  totalAssigned: number;
  totalUnallocated: number; // totalOwned - totalAllocated (may be negative)
  skusOverAllocated: number;
}

/** GET /license/drift → DriftAlertDto[] */
export interface DriftSkuRef {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
}

export interface DriftAlert {
  id: string;
  skuCatalogId: string;
  ledgerAssignedSum: number;
  tenantConsumed: number;
  delta: number; // tenantConsumed - ledgerAssignedSum
  status: DriftStatus;
  note: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  sku: DriftSkuRef;
}

/** OpCo reference (service include: { code, displayName }). */
export interface OpcoRef {
  code: string;
  displayName: string;
}

/** SKU reference embedded in a detail line item (service include). */
export interface LineItemSkuRef {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
}

/** A per-SKU line item (stage lives here). `sku` present on the detail view. */
export interface RequestLineItem {
  id: string;
  requestId: string;
  skuCatalogId: string;
  quantity: number;
  procurementRequired: boolean;
  stage: LineItemStage;
  // Per-line ServiceNow RITM (ADR-0008 D6). null = platform-authored line with
  // no SN presence → removable (CH-007 D5). Non-null = it exists in ServiceNow.
  serviceNowSysId: string | null;
  serviceNowNumber: string | null;
  quoteRef: string | null;
  poRef: string | null;
  quotedAt: string | null;
  opcoApprovedAt: string | null;
  vendorOrderedAt: string | null;
  readyAt: string | null;
  assignedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  sku?: LineItemSkuRef;
}

/** An operational-history event (detail view). */
export interface RequestEvent {
  id: string;
  requestId: string;
  lineItemId: string | null;
  type: EventType;
  fromStage: LineItemStage | null;
  toStage: LineItemStage | null;
  message: string | null;
  actorId: string | null;
  createdAt: string;
}

/**
 * GET /fulfilment/activity → the same events, read ACROSS requests (CH-006).
 *
 * Flatter than RequestEvent above: the actor's name and a human request handle
 * are resolved server-side, since a feed row has no request context to borrow
 * from. Onboarding PII (targetUpn / requesterEmail) is deliberately absent —
 * this surface is open to OPCO_IT.
 */
export interface ActivityEvent {
  id: string;
  type: EventType;
  fromStage: LineItemStage | null;
  toStage: LineItemStage | null;
  message: string | null;
  createdAt: string;
  /** null for platform-written events (SYNC / NOTE) — no operator caused them. */
  actorName: string | null;
  requestId: string;
  /** ServiceNow number when the request has one, else a short id tail. */
  requestRef: string;
}

// ── CH-013 / ADR-0021 — import a real ServiceNow REQ (ADMIN only) ──

/** One active catalog task under a RITM. Only what the server chose to publish. */
export interface ServiceNowLookupTask {
  number: string;
  state: string;
}

export interface ServiceNowLookupRitm {
  number: string;
  title: string;
  activeTaskCount: number;
  /** false when activeTaskCount ≠ 1 — the platform could not close it (ADR-0018 D3). */
  importable: boolean;
  blockedReason: string | null;
  tasks: ServiceNowLookupTask[];
}

/** GET /requests/servicenow-lookup?req= */
export interface ServiceNowLookupResult {
  number: string;
  shortDescription: string;
  openedAt: string;
  items: ServiceNowLookupRitm[];
}

/**
 * POST /requests/import-from-servicenow body.
 *
 * No `ritmSysId`: the server re-reads the REQ and resolves it (ADR-0021 D5).
 * `skuId` is the M365 GUID, never a name or a catalogue row id.
 */
export interface ImportFromServiceNowBody {
  reqNumber: string;
  opcoCode: string;
  targetUpn: string;
  targetDisplayName?: string;
  items: { ritmNumber: string; skuId: string; quantity?: number }[];
}

/**
 * GET /fulfilment/requests → the service returns the full Request plus `opco`
 * and `lineItems` (richer than RequestDto). Fields beyond the DTO are real.
 */
export interface OnboardingRequest {
  id: string;
  serviceNowSysId: string | null;
  serviceNowNumber: string | null;
  serviceNowStatus: string | null;
  // 'onboarding-intake' (n8n mirror) | 'platform-created' (outbound). Decides
  // whether lines can be added: platform-created is already fully in SN (CH-007 D6).
  origin: string;
  rawRequestText: string | null;
  requesterEmail: string | null;
  targetUpn: string;
  targetDisplayName: string | null;
  opcoId: string;
  status: RequestStatus;
  handledById: string | null;
  accountCreatedAt: string | null;
  azureSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  opco?: OpcoRef;
  lineItems?: RequestLineItem[];
}

/** GET /fulfilment/requests/:id → adds line-item `sku` + the event timeline. */
export interface RequestDetail extends OnboardingRequest {
  lineItems: RequestLineItem[];
  events: RequestEvent[];
}

/**
 * POST /fulfilment/requests/:id/sync-check → CH-015. Three states rather than
 * three HTTP statuses, because "Graph has not got the account yet" and "you just
 * asked, so we did not ask again" are different facts and only one of them is
 * about the account. Mirrors apps/api dto/sync-check.dto.ts.
 */
export type SyncCheckStatus = 'FOUND' | 'NOT_FOUND' | 'THROTTLED';

export interface SyncCheckResult {
  status: SyncCheckStatus;
  /** Seconds before another check is worth making; 0 once the gate is open. */
  retryAfterSeconds: number;
  request: RequestDetail;
}

/** GET /opcos → active OpCos for picker selectors (same shape as AdminOpco). */
export type OpcoOption = AdminOpco;

/**
 * POST /requests body (Phase 乙 outbound — ADR-0008 D1). IT opens a standalone
 * (non-onboarding) M365/D365 license request; the platform creates the
 * ServiceNow ticket then a local mirror. Mirrors apps/api create-request.dto.ts.
 */
export interface CreateRequestLine {
  skuId: string; // SkuCatalog.skuId GUID
  quantity: number;
}
export interface CreateRequestBody {
  targetUpn: string;
  targetDisplayName?: string;
  opcoCode: string;
  requesterEmail?: string;
  remark?: string;
  lineItems: CreateRequestLine[];
}

/**
 * PATCH /fulfilment/requests/:id body (CH-007). Only header fields; sync keys /
 * opcoId / origin are not accepted (the backend DTO omits them and the whitelist
 * pipe strips them). targetUpn is accepted but sync-gated backend (D2).
 */
export interface UpdateRequestBody {
  targetUpn?: string;
  targetDisplayName?: string;
  requesterEmail?: string;
  rawRequestText?: string;
}

/** POST /fulfilment/requests/:id/line-items body (CH-007 — mirrors AddLineItemDto). */
export interface AddLineItemBody {
  skuCatalogId: string;
  quantity?: number;
  procurementRequired?: boolean;
  note?: string;
}
