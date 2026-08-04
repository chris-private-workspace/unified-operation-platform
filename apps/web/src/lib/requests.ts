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

/**
 * Granular request status derived from line-item stages + the Azure sync gate
 * (not the coarse RequestStatus enum). Mirrors the prototype's status column.
 */
export function deriveStatus(req: OnboardingRequest): DerivedStatus {
  const active = (req.lineItems ?? []).filter((i) => i.stage !== 'CANCELLED');
  if (active.length === 0) return { label: 'Cancelled', tone: 'neutral' };
  if (active.every((i) => i.stage === 'ASSIGNED'))
    return { label: 'Completed', tone: 'ok' };
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
 * Lines can be added only to intake requests. A platform-created request already
 * pushed every line to ServiceNow, so a new local line would drift (D6).
 */
export function canAddLine(req: Pick<OnboardingRequest, 'origin'>): boolean {
  return req.origin !== 'platform-created';
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
