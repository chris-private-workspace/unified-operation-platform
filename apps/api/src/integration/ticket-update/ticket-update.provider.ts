/**
 * Seam ④ of ADR-0017 — the ticket STATE boundary.
 *
 * Same shape and same rule as seam ② (license-ops): the platform decides that a
 * request is fulfilled, or that it is stuck waiting on procurement. This
 * provider only carries the decision over to ServiceNow. D0 — only the executor
 * is switchable, never the decision-maker.
 *
 * Two implementations:
 *   - DirectTicketProvider (default)   — ServiceNow Table API directly
 *   - N8nTicketProvider    (W40 F2)    — n8n workflow 2004
 *
 * ── Why there is no addWorkNote here (W40 OQ-A, Chris 2026-07-28) ────────────
 * The platform's existing write-back after a successful assign is a plain work
 * note that does NOT touch state. Workflow 2004 has no such mode: reading its
 * JSON node by node, mode 1 is `{state:'2', work_notes}` and mode 0 is
 * `{state:'3', close_notes}` — every mode moves the ticket. Its own sticky note
 * says "RITM ONLY. 3 fields: state, work_notes, close_notes ... deliberate".
 *
 * ADR-0017 D3 maps addWorkNote onto mode 1 anyway. Following that literally
 * would mean flipping the connector silently changes what the platform does to
 * a customer's ticket — assign succeeds, and the ticket gets marked Work in
 * Progress. That is the exact class of drift D0 exists to prevent, and the
 * semantics are backwards on top of it.
 *
 * So the note path stays on ServiceNowService directly and this seam covers
 * state transitions only. Narrower than the ADR table, for the same reason W38
 * took 3 of the 5 methods D2 listed: a seam must not pretend a vendor can do
 * something it cannot. ticket-update.boundary.spec.ts locks this in.
 *
 * ── Error contract (inherited from W38, with one deliberate difference) ──────
 * TRANSPORT failure ("ServiceNow / n8n is unreachable") THROWS, exactly as in
 * seam ②. It is NOT folded into the outcome vocabulary — the vendor being down
 * is the absence of a result, not a result.
 *
 * The difference: seam ② wraps its transport failure into a 503, because
 * assign.service propagates that 503 to the caller. Here it must NOT be wrapped.
 * Every caller of this seam swallows the failure and queues it (ADR-0011 OD4 — a
 * missing mirror must never turn a completed assign into a failure), so an HTTP
 * status would be a shape that can never reach an HTTP response. Throwing the
 * plain error keeps today's behaviour byte for byte.
 */

/**
 * The normalised result vocabulary.
 *
 * The two implementations disagree on what "it failed" looks like, and the
 * asymmetry is real rather than a missing mapping:
 *
 *   snow.updateRecord()  throws on any non-2xx — so Direct essentially never
 *                        returns `error`; it throws instead.
 *   n8n 2004             answers HTTP 200 with `{status:'error', httpStatus}`
 *                        when its own PATCH to ServiceNow failed. The webhook
 *                        succeeded; the ticket did not move.
 *
 * That second case is precisely what `error` is for (W38: "the provider
 * answered, but the answer means failure"). It is not theoretical — 2004 runs
 * under a credential with row-level ACL, so a PATCH it cannot see fails while
 * the webhook still returns 200.
 */
export type TicketUpdateOutcome =
  /** The ticket moved. `newState` is what ServiceNow reports it is now. */
  | { status: 'updated'; newState: string | null }
  /**
   * The provider answered, and the answer means the ticket did not move.
   *
   * H4: `details` is operator-facing and may be logged — never a UPN, an email
   * or a credential. n8n's own `details` field is a raw stringified vendor error
   * body (same pattern as BUG-004), so implementations must not pass it through.
   */
  | { status: 'error'; details: string };

/**
 * Abstract class rather than interface + string token, so Nest uses the class
 * itself as the DI token (same reasoning as LicenseOperationsProvider).
 *
 * Both methods take the RITM sys_id. Never the parent REQ: 2004 is RITM-only by
 * design, so accepting a REQ here would be an interface the n8n implementation
 * could not honour.
 *
 * 🔴 RITM division of labour (ADR-0017 D3, hard rule — both sides must hold it):
 *   n8n 1007  closes AD-type RITMs only.
 *   platform  closes LICENSE-type RITMs only.
 * Neither side ever touches the other's RITM, or the two systems fight over
 * ticket state.
 *
 * W40 verified this structurally rather than taking the ADR's word for it —
 * 1007 already PATCHes state=3 itself, so "they do not overlap" had to be a
 * fact, not an assumption. Reading 1001's `Prepare Approval Data` node:
 *
 *   actionItems  ← phase1_items only. All three (create_user /
 *                  add_user_to_group / setup_abw_folder) are built from
 *                  phase1Items, and those carry the ritmSysIds 1007 later
 *                  closes. other_items never enters actionItems at all.
 *   licenseItems ← `other.filter(status === 'pending_license' || /O365/i)`,
 *                  i.e. other_items only. That is what intake turns into
 *                  RequestLineItem.serviceNowSysId — the sys_ids this seam
 *                  is ever handed.
 *
 * So the two sets come from two disjoint branches of the same AI Brain output.
 * If that ever changes on the n8n side, this comment is the thing that stops
 * being true first — and the platform has no way to detect it, because a RITM
 * sys_id looks the same either way.
 */
export abstract class TicketUpdateProvider {
  /**
   * "License unavailable — procurement in progress." Ticket goes to Work in
   * Progress with a work note.
   */
  abstract markInProgress(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome>;

  /** "Fulfilled." Ticket goes to Closed Complete with a close note. */
  abstract closeComplete(
    sysId: string,
    note: string,
  ): Promise<TicketUpdateOutcome>;
}

/**
 * ServiceNow state values, read from workflow 2004's `Validate & Build Patch`
 * node rather than from the ADR prose (W39's lesson: where the platform sends
 * or parses something, the workflow JSON is the source of truth).
 *
 *   mode 1 → { state: '2', work_notes }
 *   mode 0 → { state: '3', close_notes }
 */
export const RITM_STATE = {
  workInProgress: '2',
  closedComplete: '3',
} as const;

/**
 * Both implementations write to sc_req_item and nothing else. Hard-coded rather
 * than taken from SERVICENOW_DEFAULT_TABLE: 2004 has the table baked into its
 * patch URL, so letting the direct side follow a config value would make the
 * two paths diverge the moment someone changes that setting.
 */
export const RITM_TABLE = 'sc_req_item';
