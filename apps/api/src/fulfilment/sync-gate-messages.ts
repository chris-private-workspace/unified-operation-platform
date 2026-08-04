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

  /**
   * ADR-0025 D4 — gate ②. Named for the QUESTION it answers, not the field it
   * writes: "does ServiceNow know this person yet", which is what decides
   * whether the licence request can name them as its target instead of the
   * requester placeholder (D3).
   *
   * No MANUAL counterpart, and that is deliberate: unlike gate ①, opening this
   * one requires a `sys_user` sys_id to back-fill. There is nothing for a human
   * to assert — either ServiceNow has the record or it does not.
   */
  SN_VERIFIED:
    'ServiceNow sync verified — the target user exists in ServiceNow (scheduled sweep)',
  SN_VERIFIED_ON_DEMAND:
    'ServiceNow sync verified — the target user exists in ServiceNow (on-demand check)',
} as const;
