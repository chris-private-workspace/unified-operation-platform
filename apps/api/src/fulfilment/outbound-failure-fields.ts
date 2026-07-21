import { isNeverAudited } from '../audit/audit-fields';

/**
 * W31 / ADR-0011 Decision 5 — the secret + PII boundary of the outbound failure
 * queue.
 *
 * Same shape as audit-fields.ts and for the same reason: this module is the ONLY
 * place that decides what may be persisted, everything is an ALLOW-LIST, and the
 * blacklist (`isNeverAudited`, reused rather than copied — a second copy would
 * let the two drift) wins over it.
 *
 * What makes this file different from the audit one: the allow-list is keyed by
 * `kind`, because the three failure kinds do not store the same thing. A
 * work-note failure has no requester or line items; a mirror failure carries SN
 * sysIds that a submit failure cannot have (there is no ticket yet).
 */

/** Every legal `kind`. String, not enum: adding one shouldn't need a migration. */
export const OUTBOUND_FAILURE_KINDS = {
  /** SN/n8n ticket creation failed. Nothing written locally → repair = submit again. */
  REQUEST_SUBMIT: 'request.submit',
  /**
   * The ticket EXISTS in ServiceNow but the local mirror write failed.
   * 🔴 Repair must NEVER re-submit (Decision 3) — that opens a second real
   * ticket. `externalRef` carries the sysIds the repair writes locally.
   */
  REQUEST_MIRROR: 'request.mirror',
  /** Assign succeeded, the SN write-back note did not. Swallowed by design (OD4). */
  SERVICENOW_WORKNOTE: 'servicenow.worknote',
} as const;

export type OutboundFailureKind =
  (typeof OUTBOUND_FAILURE_KINDS)[keyof typeof OUTBOUND_FAILURE_KINDS];

export const OUTBOUND_FAILURE_STATUS = {
  OPEN: 'open',
  RESOLVED: 'resolved',
  /** An operator decided no repair is needed. Still audited (Decision 8). */
  ABANDONED: 'abandoned',
} as const;

export type OutboundFailureStatus =
  (typeof OUTBOUND_FAILURE_STATUS)[keyof typeof OUTBOUND_FAILURE_STATUS];

type Bag = Record<string, unknown>;

/**
 * Per-kind allow-list for `payload` — the inputs needed to redo the thing.
 * Adding a line here widens what gets stored; treat it as a privacy decision.
 */
const PAYLOAD_WHITELIST: Record<OutboundFailureKind, readonly string[]> = {
  // PII note: targetUpn is stored deliberately — without it the request cannot
  // be resubmitted at all. Read access is ADMIN + REGIONAL (Decision 4), the
  // same people who already see this UPN on the request itself.
  'request.submit': [
    'targetUpn',
    'targetDisplayName',
    'opcoCode',
    'requesterEmail',
    'remark',
  ],
  'request.mirror': [
    'targetUpn',
    'targetDisplayName',
    'opcoCode',
    'requesterEmail',
    'remark',
  ],
  // No requester / UPN: a work note is addressed to a ticket, not a person.
  'servicenow.worknote': ['snTarget', 'note', 'table'],
};

/** Line items travel inside payload for the two request kinds. */
const PAYLOAD_LINE_FIELDS = ['skuId', 'skuPartNumber', 'quantity'] as const;

/**
 * Per-kind allow-list for `externalRef` — side-effects that ALREADY happened.
 * Only `request.mirror` has any: that is precisely what makes it unsafe to
 * re-submit and safe to replay locally.
 */
const EXTERNAL_REF_WHITELIST: Record<OutboundFailureKind, readonly string[]> = {
  'request.submit': [],
  'request.mirror': ['serviceNowSysId', 'serviceNowNumber'],
  'servicenow.worknote': [],
};

const EXTERNAL_LINE_FIELDS = ['serviceNowSysId', 'serviceNowNumber'] as const;

/**
 * A vendor error message can be arbitrarily long (some drivers stringify a whole
 * response). Decision 5 allows the message TEXT but not raw bodies, so cap it —
 * an unbounded column here would quietly become the raw-body escape hatch.
 */
const MAX_ERROR_LENGTH = 500;

function pickKeys(source: unknown, allowed: readonly string[]): Bag {
  if (!source || typeof source !== 'object') return {};
  const bag = source as Bag;
  const out: Bag = {};
  for (const key of allowed) {
    // Blacklist wins over whitelist — order matters, do not reverse.
    if (isNeverAudited(key)) continue;
    if (key in bag && bag[key] !== undefined) out[key] = bag[key];
  }
  return out;
}

/** Project the retry inputs down to what this kind is allowed to store. */
export function pickFailurePayload(
  kind: OutboundFailureKind,
  source: unknown,
): Bag {
  const out = pickKeys(source, PAYLOAD_WHITELIST[kind] ?? []);

  const bag = (source ?? {}) as Bag;
  if (kind !== 'servicenow.worknote' && Array.isArray(bag.lineItems)) {
    out.lineItems = bag.lineItems.map((li) =>
      pickKeys(li, PAYLOAD_LINE_FIELDS),
    );
  }
  return out;
}

/** Same treatment for the already-happened side-effects. */
export function pickFailureExternalRef(
  kind: OutboundFailureKind,
  source: unknown,
): Bag | undefined {
  const allowed = EXTERNAL_REF_WHITELIST[kind] ?? [];
  if (allowed.length === 0) return undefined;

  const out = pickKeys(source, allowed);
  const bag = (source ?? {}) as Bag;
  if (Array.isArray(bag.lineItems)) {
    out.lineItems = bag.lineItems.map((li) =>
      pickKeys(li, EXTERNAL_LINE_FIELDS),
    );
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Message text only, capped. Raw vendor bodies stay in the log (Decision 5). */
export function failureErrorText(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const text = raw.trim() || 'Unknown error';
  return text.length > MAX_ERROR_LENGTH
    ? `${text.slice(0, MAX_ERROR_LENGTH)}…`
    : text;
}
