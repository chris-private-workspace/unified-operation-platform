/**
 * W37 / ADR-0015 D3 — the two ways `azureSyncedAt` can get set, kept side by
 * side so the difference between them is impossible to miss when editing either.
 *
 * D1 upgraded the field's meaning to "the platform has actually seen this UPN in
 * Graph". A human break-glass confirm cannot make that claim — it only records
 * that someone asserted it. If both paths wrote the same timeline message the
 * upgrade would be invisible to the person reading the request, which is the
 * one place it matters: an operator looking at a stalled onboarding needs to
 * know whether the gate was opened by evidence or by assertion.
 */
export const SYNC_GATE_MESSAGE = {
  /** The scheduled sweep found the user in Graph. Evidence-backed. */
  VERIFIED: 'Phase 1 sync verified against Microsoft Graph (scheduled sweep)',
  /**
   * A human pressed confirm. Deliberately says what it is NOT — the wording is
   * the whole point, so it does not read as equivalent to VERIFIED.
   */
  MANUAL: 'Phase 1 sync manually confirmed (not verified against Graph)',
} as const;
