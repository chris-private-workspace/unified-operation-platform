/**
 * ADR-0029 — the per-step result an assign reports back.
 *
 * WHY THIS EXISTS: `POST …/assign` runs eight gates and three side-effects in
 * one atomic call, and today the caller learns only that "something" refused.
 * The operator cannot tell which gate stopped them, and — the part that costs
 * real time — cannot tell WHO fixes it. `sync-azure` is chased through Entra
 * Connect, `sync-servicenow` through the SN user import, `budget` through an
 * admin, `seats` through procurement. One message cannot carry that.
 *
 * WHAT THIS IS NOT: it is not progress. The call stays atomic (ADR-0029
 * rejects splitting it — an `execute` that succeeds while `commit` never lands
 * leaves a licence assigned with no ledger row, which is the exact drift the
 * mockup's own `ledger_conflict` scenario describes). The breakdown arrives
 * with the response, not during it. Streaming was deferred, not designed out:
 * these keys are the contract, so a later SSE transport changes delivery only.
 */

/**
 * The eight gates, in the order `assign.service.ts` actually runs them.
 *
 * 🔴 Order is part of the contract, not a formatting choice. It is what lets a
 * reader say "it got to `budget`, so directory and both syncs were fine" — the
 * steps before the failure are evidence, not decoration.
 *
 * 🔴 CH-029 / ADR-0034 D1 — `holding` sits between `budget` and `seats`, and
 * both sides of that are arguments, not taste:
 *   - AFTER `budget`, because ADR-0016 D5 put the budget gate ahead of the
 *     Graph inventory read on the principle that busting your own OpCo's
 *     allocation must not cost a vendor round-trip. `holding` IS a vendor
 *     round-trip, so putting it earlier would contradict that decision.
 *   - BEFORE `seats`, because somebody who already holds the licence consumes
 *     no seat. Behind `seats`, a tenant with none left would refuse an assign
 *     that needs none — and `seats` has no override (`budget` does), so the
 *     operator would be told to buy seats to satisfy a request already
 *     satisfied. W44 F7-7 (n8n asking to skip users who already hold E5) is
 *     exactly the scarce-seat case where that would bite.
 *
 * 🔴 `budget` and `seats` are SEPARATE and must stay separate. The mockup
 * (`IT Ops Platform.dc.html:1444-1450`) folds them into one `precheck`, and
 * that is the one place the mockup is wrong about this system: they are two
 * different limits, checked against two different sources, and 2026-08-07 DEV
 * logs show BOTH being hit on real traffic (`OpCo budget gate blocked … 0/0`
 * and `… 100/90`). Merging them would produce a screen that cannot say which
 * limit stopped you, while the remedies differ completely — raise the OpCo
 * allocation vs. buy more tenant seats.
 */
export const ASSIGN_GATE_KEYS = [
  'stage', // line item must be READY
  'sync-azure', // request.azureSyncedAt (Phase 1 gate)
  'sync-servicenow', // request.serviceNowUserSyncedAt (ADR-0025 D5, gate ②)
  'directory', // Graph findUser resolved the target
  'usage-location', // user has one, or the caller supplied an override
  'budget', // OpCo allocation (ADR-0016; admin-overridable)
  'holding', // does the user already hold this SKU (CH-029 / ADR-0034 D1)
  'seats', // tenant prepaid seats (Graph inventory)
] as const;

/**
 * The three side-effects, reported the same way so the response reads as one
 * timeline rather than "checks" plus a separate epilogue.
 *
 * `ticket` earns its place: it is `skipped` whenever the line carries no RITM,
 * and that single word answers a question W44 F7-12 needed two days and a
 * ServiceNow query to answer — did anything actually get closed on the SN side.
 */
export const ASSIGN_EFFECT_KEYS = [
  'assign', // Graph assignLicense
  'ledger', // assignedQuantity +1
  'ticket', // ServiceNow write-back (skipped when the line has no RITM)
] as const;

export const ASSIGN_STEP_KEYS = [
  ...ASSIGN_GATE_KEYS,
  ...ASSIGN_EFFECT_KEYS,
] as const;

export type AssignGateKey = (typeof ASSIGN_GATE_KEYS)[number];
export type AssignEffectKey = (typeof ASSIGN_EFFECT_KEYS)[number];
export type AssignStepKey = (typeof ASSIGN_STEP_KEYS)[number];

/**
 * `skipped` is deliberately NOT a flavour of `ok`. "We did not need to do this"
 * and "we did this and it worked" are different facts, and collapsing them is
 * how a line item with no RITM ends up looking like a ticket that was closed.
 *
 * `overridden` is the same argument on the `budget` step: the gate DID refuse,
 * and an admin took responsibility for going past it. Reporting that as `ok`
 * would erase the one fact ADR-0016 R4 depends on being honest — that "override
 * used" means the allocation was actually busted, not merely that a reason was
 * typed. It only ever appears on `budget`; nothing else here is overridable.
 */
export const ASSIGN_STEP_STATUSES = [
  'ok',
  'failed',
  'skipped',
  'overridden',
] as const;
export type AssignStepStatus = (typeof ASSIGN_STEP_STATUSES)[number];

/**
 * Who unblocks a failed step. Present so the UI never has to infer it from
 * message text — the whole point of ADR-0029 is that "what do I do now" stops
 * being tribal knowledge.
 */
export const ASSIGN_STEP_OWNERS = [
  'operator', // fixable right here (e.g. supply a usageLocation)
  'admin', // needs an override or an allocation change
  'identity', // Entra Connect / directory sync
  'servicenow', // the SN user import
  'procurement', // buy more seats
  'platform', // a bug or an outage on our side
] as const;
export type AssignStepOwner = (typeof ASSIGN_STEP_OWNERS)[number];

export interface AssignStep {
  key: AssignStepKey;
  status: AssignStepStatus;
  /**
   * 🔴 MUST be scrubbed before it leaves the service. The `directory` and
   * `sync-*` steps carry vendor errors that can embed the target UPN — the
   * same shape as BUG-004. A test has to pin this; a reviewer cannot see it.
   */
  detail?: string;
  /** Only meaningful on `failed`: is retrying the same call worth anything. */
  retryable?: boolean;
  /** Only meaningful on `failed`. */
  whoFixes?: AssignStepOwner;
}

/**
 * `blocked` vs `failed` is the distinction the operator acts on: a gate refused
 * (nothing was attempted, nothing changed) versus something broke partway. It
 * is NOT the same axis as `retryable`.
 */
export const ASSIGN_OUTCOMES = ['assigned', 'blocked', 'failed'] as const;
export type AssignOutcome = (typeof ASSIGN_OUTCOMES)[number];

export interface AssignResult {
  outcome: AssignOutcome;
  /**
   * The step that STOPPED the assign — not merely the first non-`ok` one. A
   * successful run can carry `skipped` (`ticket`) and `overridden` (`budget`)
   * steps and still leave this absent, which is the point: neither of those
   * stopped anything. Absent when `outcome === 'assigned'`.
   */
  failedAt?: AssignStepKey;
  /**
   * Every step reached, in run order — including on failure, so the reader can
   * see how far it got. Steps after the failure are simply absent rather than
   * reported as skipped: they were never evaluated, and claiming otherwise
   * would be inventing a fact.
   */
  steps: AssignStep[];
}
