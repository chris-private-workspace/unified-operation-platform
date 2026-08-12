import type { BadgeTone } from '@/components/ui/badge';
import type {
  LineItemStage,
  OnboardingRequest,
  RequestLineItem,
} from './api-types';

// Stage ordering for the per-line-item stepper: short path (3 dots) vs
// procurement path (6 dots) — mirrors LEGAL_TRANSITIONS in stage.service.ts.
export const SHORT_STEPS: LineItemStage[] = ['REQUESTED', 'READY', 'ASSIGNED'];
export const PROC_STEPS: LineItemStage[] = [
  'REQUESTED',
  'QUOTING',
  'OPCO_APPROVED',
  'AWAITING_VENDOR',
  'READY',
  'ASSIGNED',
];

export function stepsFor(item: RequestLineItem): LineItemStage[] {
  return item.procurementRequired ? PROC_STEPS : SHORT_STEPS;
}

// ── Display-only steps (CH-025 A) ────────────────────────────────
//
// 🔴 These are deliberately SEPARATE from `stepsFor`, and the separation is the
// whole safety of this change.
//
// `stepsFor` feeds `nextStage`, which decides whether the detail screen offers
// an "Advance stage" button. Appending a fourth entry there would make
// `nextStage(ASSIGNED)` return 'Completed' — a value `LineItemStage` does not
// have — so a finished line would grow a button that 400s on click.
//
// So the timeline gets its own list. `LineItemStage`, the backend stage machine
// and `nextStage` are untouched; 'Completed' exists only as a label on screen.

/** The step label shown after the last real stage — display only, never a stage. */
export const COMPLETED_STEP = 'Completed';

/** Steps for the per-line timeline: the real path plus a terminal marker. */
export function displayStepsFor(item: RequestLineItem): string[] {
  return [...stepsFor(item), COMPLETED_STEP];
}

/**
 * Which display step the line is currently ON (0-based).
 *
 * An ASSIGNED line points at the TERMINAL marker rather than at the ASSIGNED
 * dot, so the counter reads "4/4" instead of "3/4". "3/4" is the thing being
 * fixed: it reads as one step still outstanding on a request that is finished.
 *
 * A CANCELLED line has no position on this path (the detail screen does not
 * render a stepper for one); -1 says so rather than pretending it is at step 1.
 */
export function displayStepIndex(item: RequestLineItem): number {
  const steps = displayStepsFor(item);
  if (item.stage === 'ASSIGNED') return steps.length - 1;
  return steps.indexOf(item.stage);
}

/** The next legal stage on the item's path, or null if already at the end. */
export function nextStage(item: RequestLineItem): LineItemStage | null {
  const path = stepsFor(item);
  const i = path.indexOf(item.stage);
  if (i < 0 || i >= path.length - 1) return null;
  return path[i + 1];
}

// Stage → semantic tone (design-system.md §2, DS-8) + short lowercase label.
export const STAGE_TONE: Record<LineItemStage, BadgeTone> = {
  REQUESTED: 'info',
  QUOTING: 'warn',
  OPCO_APPROVED: 'info',
  AWAITING_VENDOR: 'warn',
  READY: 'ok',
  ASSIGNED: 'neutral',
  CANCELLED: 'neutral',
};

export const STAGE_LABEL: Record<LineItemStage, string> = {
  REQUESTED: 'requested',
  QUOTING: 'quoting',
  OPCO_APPROVED: 'approved',
  AWAITING_VENDOR: 'awaiting vendor',
  READY: 'ready',
  ASSIGNED: 'assigned',
  CANCELLED: 'cancelled',
};

// Order stage-count chips most-advanced first (matches the prototype).
const COUNT_ORDER: LineItemStage[] = [
  'ASSIGNED',
  'READY',
  'AWAITING_VENDOR',
  'OPCO_APPROVED',
  'QUOTING',
  'REQUESTED',
];

export interface StageCount {
  stage: LineItemStage;
  count: number;
}

/** Non-cancelled line items grouped by stage, most-advanced first. */
export function stageCounts(req: OnboardingRequest): StageCount[] {
  const items = req.lineItems ?? [];
  return COUNT_ORDER.map((stage) => ({
    stage,
    count: items.filter((i) => i.stage === stage).length,
  })).filter((c) => c.count > 0);
}

const PROCUREMENT_STAGES: LineItemStage[] = [
  'QUOTING',
  'OPCO_APPROVED',
  'AWAITING_VENDOR',
];

export interface DerivedStatus {
  label: string;
  tone: BadgeTone;
}

/** Line items that still count — a cancelled line is not waiting for anything. */
function activeLines(
  req: Pick<OnboardingRequest, 'lineItems'>,
): RequestLineItem[] {
  return (req.lineItems ?? []).filter((i) => i.stage !== 'CANCELLED');
}

/**
 * Every line that still counts has been assigned — i.e. there is nothing left
 * to do on this request.
 *
 * CH-024 D. Exported because the request detail's check-point row needs the
 * same answer as `deriveStatus`, and asking it twice in two places is how the
 * screen ended up contradicting itself: the header badge said "Completed" while
 * the row underneath still said "Ready to assign", because the row only ever
 * looked at the two sync gates and never at the line items at all.
 *
 * A request whose lines are ALL cancelled is not "assigned" — nothing was.
 */
export function allLinesAssigned(
  req: Pick<OnboardingRequest, 'lineItems'>,
): boolean {
  const active = activeLines(req);
  return active.length > 0 && active.every((i) => i.stage === 'ASSIGNED');
}

/**
 * The ServiceNow numbers of the licence request(s) THIS PLATFORM raised —
 * i.e. the RITMs on the line items, not `req.serviceNowNumber`.
 *
 * CH-024 C. These are two different tickets and `schema.prisma` says so in as
 * many words ("mixing them up is the easiest mistake to make here"):
 *
 *   req.serviceNowNumber  → the onboarding REQ n8n raised. Also the idempotency
 *                           key, so it can never change.
 *   these                 → the `O365 User License Maintenance Request` the
 *                           platform raised for this joiner, and the one it
 *                           closes after assigning.
 *
 * Deduped because several lines are raised on ONE submission and can carry the
 * same RITM; order of first appearance, so the display order follows the line
 * items rather than an arbitrary Set iteration.
 *
 * Cancelled lines are included: a cancelled line whose ticket was already
 * raised still has a real ticket sitting in ServiceNow, and hiding it is how an
 * orphan goes unnoticed.
 */
export function licenceRequestNumbers(req: OnboardingRequest): string[] {
  const seen: string[] = [];
  for (const line of req.lineItems ?? []) {
    const n = line.serviceNowNumber;
    if (n && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

/**
 * Granular request status derived from line-item stages + the Azure sync gate
 * (not the coarse RequestStatus enum). Mirrors the prototype's status column.
 */
export function deriveStatus(req: OnboardingRequest): DerivedStatus {
  const active = activeLines(req);
  if (active.length === 0) return { label: 'Cancelled', tone: 'neutral' };
  // CH-024 D — shares `allLinesAssigned` with the detail screen's check-point
  // row on purpose. Same question, one answer.
  if (allLinesAssigned(req)) return { label: 'Completed', tone: 'ok' };
  if (active.some((i) => PROCUREMENT_STAGES.includes(i.stage)))
    return { label: 'In procurement', tone: 'warn' };
  // remaining items are REQUESTED / READY (± some ASSIGNED)
  // ADR-0025 D5 — assign now needs BOTH gates, so both must be able to produce
  // "blocked" here. One label for the two on purpose: in a list column "which
  // vendor" is not actionable, "cannot be assigned yet" is — and the request
  // detail's check-point row is where the operator sees which side is waiting.
  // Leaving gate ② out would let this column read "Ready to assign" for a
  // request the backend will refuse (W43 F4).
  if (!req.azureSyncedAt || !req.serviceNowUserSyncedAt)
    return { label: 'Blocked · sync', tone: 'danger' };
  if (active.some((i) => i.stage === 'READY'))
    return { label: 'Ready to assign', tone: 'info' };
  return { label: 'Triage', tone: 'info' };
}

// CH-007 edit-lock gating. These MIRROR the backend guards (request.service.ts)
// exactly — they decide only whether the UI shows a control. The backend is the
// real gate (409/403 on violation); these just avoid offering an action that
// would bounce. If they ever drift from the backend, the backend still wins.

/** targetUpn is editable only before the account has synced (D2). */
export function canEditUpn(
  req: Pick<OnboardingRequest, 'azureSyncedAt'>,
): boolean {
  return !req.azureSyncedAt;
}

/**
 * A line can be removed only while it has no ServiceNow RITM and is still at
 * REQUESTED (D5) — i.e. nothing real has started and nothing would drift from SN.
 */
export function canRemoveLine(
  item: Pick<RequestLineItem, 'serviceNowSysId' | 'stage'>,
): boolean {
  return item.serviceNowSysId === null && item.stage === 'REQUESTED';
}

/**
 * Lines can be added only to intake requests that are still running.
 *
 * A platform-created request already pushed every line to ServiceNow, so a new
 * local line would drift (CH-007 D6).
 *
 * CH-025 C adds the second half: a request whose every line is assigned is
 * DONE. Adding to it used to push it back to IN_PROGRESS, which is a delivered
 * onboarding quietly coming back to life. The backend refuses this too (409) —
 * this only decides whether the control is offered at all.
 */
export function canAddLine(
  req: Pick<OnboardingRequest, 'origin' | 'lineItems'>,
): boolean {
  if (req.origin === 'platform-created') return false;
  return !allLinesAssigned(req);
}

// List filter tabs (AUTH-3b). "My queue" matches requests handled by the signed-in
// operator — enabled now that GET /me gives a real AppUser id (req.handledById is
// on the list payload). meId is passed by the caller (useMe); when it's absent
// (role still loading) "My queue" matches nothing rather than guessing.
export type RequestFilter =
  'all' | 'mine' | 'attention' | 'procurement' | 'blocked';

export function matchesFilter(
  req: OnboardingRequest,
  filter: RequestFilter,
  meId?: string | null,
): boolean {
  const status = deriveStatus(req).label;
  switch (filter) {
    case 'all':
      return true;
    case 'mine':
      return Boolean(meId) && req.handledById === meId;
    case 'attention':
      return status !== 'Completed' && status !== 'Cancelled';
    case 'procurement':
      return (req.lineItems ?? []).some(
        (i) =>
          i.procurementRequired &&
          i.stage !== 'ASSIGNED' &&
          i.stage !== 'CANCELLED',
      );
    case 'blocked':
      return status === 'Blocked · sync';
  }
}
