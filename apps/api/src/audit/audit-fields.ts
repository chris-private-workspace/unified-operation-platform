/**
 * W29 / ADR-0009 Decision 5 — the PII + secret boundary of the audit trail.
 *
 * This module is the ONLY enforcement point for what may land in an AuditLog
 * row. Everything is an ALLOW-LIST: a field that nobody listed here never gets
 * written, so adding a column to a Prisma model can't silently start leaking it.
 *
 * Decision 7 chose option P-B: whitelisted before/after MAY contain email /
 * displayName, because those are precisely the values being changed and an
 * audit that omits them can't answer "changed to what?". The price is that
 * read access stays ADMIN-only and any future retention policy must cover
 * this table.
 *
 * `metadata` is key-restricted for the same reason — left free-form it would
 * become an escape hatch around the whitelist (plan §8).
 */

/** Every legal `action` value. String, not enum: adding an event shouldn't need a migration. */
export const AUDIT_ACTIONS = {
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  /** Split out of user.update on purpose: a privilege change is the event auditors care most about. */
  USER_ROLE_CHANGE: 'user.role_change',
  USER_DEACTIVATE: 'user.deactivate',
  /** An admin reset SOMEONE ELSE's password. */
  USER_PASSWORD_RESET: 'user.password_reset',
  /**
   * A user changed their OWN password (self-service). Same underlying fact as
   * password_reset — this account's credential changed — so it lives next to it
   * under `user.` rather than with the `auth.` sign-in events; an auditor asking
   * "what happened to this account's credentials" wants both. The two are told
   * apart by actorId === targetId (self) vs actorId !== targetId (admin).
   */
  USER_PASSWORD_CHANGE: 'user.password_change',
  AUTH_LOGIN_SUCCESS: 'auth.login_success',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOCKED: 'auth.locked',
  /**
   * AUTH-4c-C / ADR-0019 D8 #8 — somebody asked for a password-reset mail.
   *
   * Recorded on EVERY request, including the ones that send nothing (unknown
   * address, SSO account, deactivated account, cooldown). That is not
   * over-logging: D8 #4 makes the HTTP response uniform on purpose, so this row
   * is the ONLY place the outcome is visible — both abuse detection and "why did
   * my user never get a mail" run on it. The outcome travels in
   * `metadata.reason`, the address in `metadata.emailAttempted`.
   */
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  OPCO_CREATE: 'opco.create',
  OPCO_UPDATE: 'opco.update',
  CATALOG_UPDATE: 'catalog.update',
  ALLOCATION_IMPORT: 'allocation.import',
  /**
   * CH-016 — zeroing allocatedQuantity is the only ledger operation that
   * REMOVES budget across many OpCos at once, and it leaves the platform in a
   * state where assigns are blocked until someone re-imports. That combination
   * is worth attributing.
   */
  ALLOCATION_RESET: 'allocation.reset',
  /**
   * CH-017 / ADR-0022 — the same operation as allocation.reset plus the one
   * column the platform cannot rebuild: `assignedQuantity`.
   *
   * Its own action rather than a flag on allocation.reset, for the reason
   * ASSIGN_BUDGET_OVERRIDE is its own action too — "show me every time somebody
   * wiped the reconciliation baseline" has to be one query, not a scan for a
   * boolean inside a busier event. The per-cell trail lives in LedgerAdjustment
   * (ADR-0022 D4); this row is the batch attribution.
   */
  LEDGER_FULL_RESET: 'ledger.full_reset',
  DRIFT_RESOLVE: 'drift.resolve',
  /**
   * W31 / ADR-0011 Decision 8 — repairing an outbound failure is a human action
   * with a real side-effect (it can create a ticket or write to ServiceNow), so
   * it is audited like any other operator write.
   */
  OUTBOUND_RETRY: 'outbound.retry',
  /**
   * "Decided not to repair" is a decision too, and the one most worth being able
   * to attribute later — an abandoned orphan ticket is a silent divergence
   * between ServiceNow and the platform.
   */
  OUTBOUND_ABANDON: 'outbound.abandon',
  /**
   * W34 / ADR-0013 — an admin changed a connector's non-secret config. Secret
   * fields never reach here: they are not columns on ConnectorConfig, and the
   * whitelist below lists only non-secret keys.
   */
  CONNECTOR_CONFIG_UPDATE: 'connector.config_update',
  /**
   * W36 / ADR-0016 — an admin assigned a licence THROUGH the OpCo budget gate.
   * Its own action, not a flag on a generic assign event, for one reason: R4
   * (override degenerating into routine) can only be watched if `/admin/audit`
   * can filter "every override" in one query. A boolean buried in the metadata
   * of a busy action is not a monitoring surface.
   *
   * Only the override is audited here. An ordinary assign is not an audit event
   * (it has its own RequestEvent timeline); breaking the budget is.
   */
  ASSIGN_BUDGET_OVERRIDE: 'assign.budget_override',
  /**
   * W37 / ADR-0015 — one row per sweep ROUND that changed something, not per
   * request opened: a round can open many gates and the per-request trail
   * already exists as RequestEvent(SYNC). Same shape as allocation.import.
   *
   * A round that opened nothing writes nothing — an audit row that only says
   * "the cron ran" is noise, and the sweep runs every 10 minutes forever.
   */
  SYNC_SWEEP: 'sync.sweep',
  /**
   * W42 / ADR-0020 D7 — the platform created a licence line that ServiceNow
   * never asked for.
   *
   * This is the first line item the platform has ever authored: every other one
   * mirrors an `sc_req_item` (ADR-0008 D6). Without this row, nobody looking at
   * a request later can tell which lines came from ServiceNow and which the
   * platform added — and one of them is about to put a product on a real
   * person's account.
   *
   * Only the injection is audited. A request that arrived WITH licence lines is
   * ordinary intake and writes nothing here, and a MISSING/invalid default is
   * only logged — a configuration mistake is an ops event, not a business one
   * (same split as W41's unset APP_BASE_URL).
   */
  INTAKE_DEFAULT_SKU: 'intake.default_sku_injected',
  /**
   * CH-013 / ADR-0021 D7 — an ADMIN turned a ServiceNow REQ number into a real
   * platform request through the UI.
   *
   * Its own action rather than a flavour of intake, because this is the one
   * path where a *named person* conjured a request from a number. The m2m
   * routes have no actor to attribute (`actorId: null` above); this one always
   * does, and "where did this request come from" is precisely the question it
   * exists to answer.
   */
  INTAKE_FROM_SERVICENOW: 'request.imported_from_servicenow',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditTargetType =
  | 'AppUser'
  | 'Opco'
  | 'SkuCatalog'
  | 'DriftAlert'
  | 'AllocationImport'
  | 'AllocationReset'
  | 'LedgerFullReset'
  | 'OutboundFailure'
  | 'ConnectorConfig'
  | 'RequestLineItem'
  | 'Request'
  | 'SyncSweep';

/**
 * Per-target allow-list. Only these keys can reach `before` / `after`.
 * Adding a line here is a privacy decision — it widens what gets stored.
 */
export const AUDIT_FIELD_WHITELIST: Record<AuditTargetType, readonly string[]> =
  {
    // P-B: email / displayName included — they are the audited change itself.
    AppUser: [
      'email',
      'displayName',
      'role',
      'opcoScopeId',
      'active',
      'mustChangePassword',
      'authProvider',
    ],
    Opco: ['code', 'displayName', 'company', 'costCenter', 'active'],
    // CH-003 curation columns only; skuId / partNumber are system-owned.
    SkuCatalog: ['businessAlias', 'category', 'isBaseLicense'],
    DriftAlert: ['status', 'note', 'delta'],
    // Summary-level only — a per-row audit would drown the table (plan F2c).
    AllocationImport: [
      'opcoColumns',
      'skuRows',
      'mappedSkuRows',
      'changes',
      'committed',
    ],
    /**
     * CH-016 — batch summary, same shape as AllocationImport above. `scope` is
     * an Opco.code (or the literal 'all'), which is already an allowed field on
     * the Opco target and carries no PII. Deliberately no room for WHICH cells
     * were zeroed: that is a per-row trail this operation does not keep, by the
     * same reasoning the import does not (one reset can touch hundreds).
     */
    AllocationReset: ['affected', 'scope'],
    /**
     * CH-017 / ADR-0022 — same batch-summary shape as AllocationReset, with the
     * two counts split apart. `assignedCells` is the number worth reading on its
     * own: those are the cells no re-import can rebuild (ADR-0004 #5), so "how
     * much of the reconciliation baseline did this wipe" must be answerable from
     * the audit row without a join to LedgerAdjustment.
     *
     * Same deliberate omission as AllocationReset: no room for WHICH cells. That
     * trail exists per-cell in LedgerAdjustment (D4), under narrower reads.
     */
    LedgerFullReset: ['affected', 'scope', 'allocatedCells', 'assignedCells'],
    /**
     * Event-only, like user.password_change. The row's own payload already
     * lives in OutboundFailure and carries a UPN — copying it into the audit
     * trail would duplicate PII into a table with DIFFERENT read permissions
     * (audit is ADMIN-only, the failure queue is ADMIN + REGIONAL). The `reason`
     * metadata carries the kind + attempt, which is what an auditor needs.
     */
    OutboundFailure: [],
    // W34 / ADR-0013 — NON-SECRET columns only. Secrets are not columns on
    // ConnectorConfig at all, so there is nothing secret to leak here.
    ConnectorConfig: [
      'graphTenantId',
      'graphClientId',
      'serviceNowInstanceUrl',
      'serviceNowDefaultTable',
      'requestSubmissionProvider',
      'n8nOutboundWebhookUrl',
      // W42 / ADR-0020 — a skuId GUID, non-secret and system-owned.
      'defaultOnboardingSkuId',
    ],
    /**
     * W36 / ADR-0016 — event-only, following the OutboundFailure precedent.
     * The line item hangs off a Request that carries the target UPN; copying
     * any of it here would duplicate PII into a table with a DIFFERENT read
     * permission (audit is ADMIN-only). The numbers an auditor needs — how far
     * over budget the override went — travel in `metadata`, which is itself
     * key-restricted, and the UPN is reachable via targetId for anyone who
     * already has access to the request.
     */
    RequestLineItem: [],
    /**
     * CH-013 / ADR-0021 D7 — event-only, same reasoning as RequestLineItem
     * directly above: a Request carries `targetUpn` / `requesterEmail`, and
     * copying either here would duplicate PII into a table with a DIFFERENT
     * read permission (audit is ADMIN-only). What an auditor needs — which REQ
     * number, how many lines — travels in the key-restricted `metadata.reason`,
     * and the UPN stays reachable via targetId for anyone who can already read
     * the request itself.
     */
    Request: [],
    /**
     * W37 / ADR-0015 — batch summary, exactly like AllocationImport: counts
     * only, and they live in `after` rather than `metadata` because that is
     * where the import precedent already puts batch totals.
     *
     * Both are integers. There is deliberately no room here for WHICH requests
     * were opened — that would put target UPNs one join away from an
     * ADMIN-only table, and RequestEvent(SYNC) already records it per request
     * under the request's own (narrower) read permission.
     */
    SyncSweep: ['scanned', 'opened'],
  };

/** Restricted `metadata` keys — everything else is dropped. */
export const AUDIT_METADATA_KEYS = [
  'reason',
  'correlationId',
  'source',
  /**
   * Q1 (Chris, 2026-07-20): the one deliberate PII exception in metadata.
   * Without it a failed login is just "someone failed" — you cannot tell which
   * account is being probed, which makes credential-stuffing detection and
   * lockout triage impossible.
   *
   * W41 — now written by TWO events, and the second one needs it for the same
   * reason: `auth.password_reset_requested` returns a uniform 204 whatever
   * happens (ADR-0019 D8 #4), so without the address a burst of reset requests
   * is likewise just "someone asked". Noted here rather than left implicit,
   * because a whitelisted PII key with an out-of-date justification is exactly
   * how the next reader talks themselves into a third use.
   */
  'emailAttempted',
  /**
   * W36 / ADR-0016 — the shape of a budget override. All three are non-PII
   * (a boolean and two seat counts); they exist so the audit row answers "how
   * far over?" without a join back to a ledger that will have moved on by the
   * time anyone reads it. `reason` above carries the operator's justification.
   */
  'budgetOverride',
  'allocated',
  'assignedBefore',
] as const;

/**
 * Second line of defence. Even if someone adds a secret to a whitelist above,
 * these never serialise. Deliberately NOT a substring match on "password":
 * `mustChangePassword` is a legitimate audited field, so the rule is exact
 * names plus a `*Hash` / `*Secret` suffix test.
 */
const NEVER_AUDIT_EXACT = new Set([
  'passwordHash',
  'tokenHash',
  'password',
  'newPassword',
  'currentPassword',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
]);

export function isNeverAudited(key: string): boolean {
  return (
    NEVER_AUDIT_EXACT.has(key) || /hash$/i.test(key) || /secret$/i.test(key)
  );
}

type Bag = Record<string, unknown>;

/**
 * Project an entity down to its auditable fields.
 * Returns undefined (not `{}`) when nothing survives, so the column stays NULL
 * rather than storing an empty object.
 */
export function pickAuditFields(
  targetType: AuditTargetType,
  source: unknown,
): Bag | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const bag = source as Bag;
  const allowed = AUDIT_FIELD_WHITELIST[targetType] ?? [];
  const out: Bag = {};

  for (const key of allowed) {
    // Blacklist wins over whitelist — order matters, do not reverse.
    if (isNeverAudited(key)) continue;
    if (key in bag) out[key] = bag[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Same treatment for metadata: restricted keys, blacklist still applies. */
export function pickAuditMetadata(source: unknown): Bag | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const bag = source as Bag;
  const out: Bag = {};

  for (const key of AUDIT_METADATA_KEYS) {
    if (isNeverAudited(key)) continue;
    if (key in bag && bag[key] !== undefined) out[key] = bag[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Which whitelisted fields actually changed. Used so `user.update` stores a
 * diff rather than the whole record, and so a no-op update writes nothing.
 */
export function auditDiff(
  targetType: AuditTargetType,
  before: unknown,
  after: unknown,
): { before?: Bag; after?: Bag } | null {
  const b = pickAuditFields(targetType, before);
  const a = pickAuditFields(targetType, after);
  if (!b && !a) return null;

  const changedKeys = new Set<string>();
  for (const key of AUDIT_FIELD_WHITELIST[targetType] ?? []) {
    if (b?.[key] !== a?.[key]) changedKeys.add(key);
  }
  if (changedKeys.size === 0) return null;

  const pick = (bag?: Bag) => {
    if (!bag) return undefined;
    const out: Bag = {};
    for (const key of changedKeys) if (key in bag) out[key] = bag[key];
    return Object.keys(out).length > 0 ? out : undefined;
  };
  return { before: pick(b), after: pick(a) };
}
