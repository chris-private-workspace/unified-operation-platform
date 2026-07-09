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
  if (!req.azureSyncedAt) return { label: 'Blocked · sync', tone: 'danger' };
  if (active.some((i) => i.stage === 'READY'))
    return { label: 'Ready to assign', tone: 'info' };
  return { label: 'Triage', tone: 'info' };
}

// List filter tabs. "My queue" is intentionally omitted — it needs the current
// user's identity, which arrives with AUTH (handler name is likewise unexposed).
export type RequestFilter = 'all' | 'attention' | 'procurement' | 'blocked';

export function matchesFilter(
  req: OnboardingRequest,
  filter: RequestFilter,
): boolean {
  const status = deriveStatus(req).label;
  switch (filter) {
    case 'all':
      return true;
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
