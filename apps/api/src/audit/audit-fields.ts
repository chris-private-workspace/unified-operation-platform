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
  OPCO_CREATE: 'opco.create',
  OPCO_UPDATE: 'opco.update',
  CATALOG_UPDATE: 'catalog.update',
  ALLOCATION_IMPORT: 'allocation.import',
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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditTargetType =
  | 'AppUser'
  | 'Opco'
  | 'SkuCatalog'
  | 'DriftAlert'
  | 'AllocationImport'
  | 'OutboundFailure'
  | 'ConnectorConfig';

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
    ],
  };

/** Restricted `metadata` keys — everything else is dropped. */
export const AUDIT_METADATA_KEYS = [
  'reason',
  'correlationId',
  'source',
  /**
   * Q1 (Chris, 2026-07-20): the one place we deliberately store PII in metadata.
   * Without it a failed login is just "someone failed" — you cannot tell which
   * account is being probed, which makes credential-stuffing detection and
   * lockout triage impossible.
   */
  'emailAttempted',
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
