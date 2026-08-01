/**
 * W37 / ADR-0015 D3 — the ways `azureSyncedAt` can get set, kept side by side so
 * the difference between them is impossible to miss when editing any of them.
 *
 * D1 upgraded the field's meaning to "the platform has actually seen this UPN in
 * Graph". A human break-glass confirm cannot make that claim — it only records
 * that someone asserted it. If both paths wrote the same timeline message the
 * upgrade would be invisible to the person reading the request, which is the
 * one place it matters: an operator looking at a stalled onboarding needs to
 * know whether the gate was opened by evidence or by assertion.
 *
 * CH-015 added a third. The evidence/assertion split above is the important one
 * — the two VERIFIED_* messages are equally evidence-backed and go through the
 * identical write (openSyncGate). They stay separate because WHICH trigger fired
 * is operational data in its own right: it answers "how many onboardings did
 * someone have to chase by hand rather than the sweep catching them", and the
 * sweep's 30-day cutoff means that number is not expected to be zero.
 */
export const SYNC_GATE_MESSAGE = {
  /** The scheduled sweep found the user in Graph. Evidence-backed. */
  VERIFIED: 'Phase 1 sync verified against Microsoft Graph (scheduled sweep)',
  /** CH-015 — an operator pressed Check now and Graph answered. Evidence-backed. */
  VERIFIED_ON_DEMAND:
    'Phase 1 sync verified against Microsoft Graph (on-demand check)',
  /**
   * A human pressed confirm. Deliberately says what it is NOT — the wording is
   * the whole point, so it does not read as equivalent to VERIFIED.
   */
  MANUAL: 'Phase 1 sync manually confirmed (not verified against Graph)',
} as const;
