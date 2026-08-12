import type { BadgeTone } from '@/components/ui/badge';
import type { LedgerOpcoRef, LedgerRow, UpdateLedgerBody } from './api-types';

// Pure display-layer derivations for the License Assets table. Kept out of the
// component so they are unit-testable (W15 D4). The backend (W14) leaves the
// utilization % and the status label to the display layer on purpose.

/**
 * Assigned-of-allocated as a whole-number percentage. allocated=0 has no
 * meaningful ratio (nothing budgeted) → 0, not a divide-by-zero. Over-allocated
 * rows (assigned > allocated) clamp at 100 for the bar; the exact overage shows
 * in the status column, not the bar width.
 */
export function utilizationPct(
  row: Pick<LedgerRow, 'allocatedQuantity' | 'assignedQuantity'>,
): number {
  if (row.allocatedQuantity <= 0) return 0;
  return Math.min(
    100,
    Math.round((row.assignedQuantity / row.allocatedQuantity) * 100),
  );
}

export interface AssetStatus {
  label: string;
  tone: BadgeTone;
}

/**
 * Row health for the status column (mirrors the prototype's tone map): over-
 * allocated (assigned > allocated) → danger; empty (nothing budgeted, nobody
 * assigned) → neutral; fully allocated (budget set, no headroom left) → warn;
 * otherwise seats are available → ok.
 *
 * CH-008: the Empty branch MUST stay below overAllocated — allocated=0 with
 * assigned>0 is a real over-allocation, not an empty cell. Before CH-008 a 0/0
 * row fell through to the green healthy label, reading as "capacity available"
 * when in fact there is nothing there.
 *
 * CH-024 E: the healthy label was "Headroom" — the same number this row already
 * shows under the "Available" column header, and the same word the KPI card
 * above uses for the tenant-wide total. Three names for one quantity, in a
 * column that is asking a yes/no question. Named after the column it restates.
 */
export function assetStatus(
  row: Pick<
    LedgerRow,
    'allocatedQuantity' | 'assignedQuantity' | 'headroom' | 'overAllocated'
  >,
): AssetStatus {
  if (row.overAllocated) return { label: 'Over-allocated', tone: 'danger' };
  if (row.allocatedQuantity === 0 && row.assignedQuantity === 0)
    return { label: 'Empty', tone: 'neutral' };
  if (row.allocatedQuantity > 0 && row.headroom === 0)
    return { label: 'Fully allocated', tone: 'warn' };
  return { label: 'Available', tone: 'ok' };
}

/** Distinct OpCos in the rows, by code, sorted — feeds the filter chips. */
export function distinctOpcos(rows: LedgerRow[]): LedgerOpcoRef[] {
  const seen = new Map<string, LedgerOpcoRef>();
  for (const r of rows) {
    if (!seen.has(r.opco.code)) seen.set(r.opco.code, r.opco);
  }
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// ── Inline edit (W23-B / ADR-0007) ───────────────────────────────
// Row edit mode: a draft holds the controlled input strings while a row is edited;
// evaluateLedgerDraft turns it into a PATCH body (changed fields only) or a reason
// why Save is blocked. Kept pure here so it is unit-testable (D3).

/** The controlled draft while a ledger row is in edit mode. */
export interface LedgerEditDraft {
  allocatedQuantity: string;
  assignedQuantity: string;
  reason: string;
}

/** Seed a draft from a row's current values (reason starts blank). */
export function initLedgerDraft(row: LedgerRow): LedgerEditDraft {
  return {
    allocatedQuantity: String(row.allocatedQuantity),
    assignedQuantity: String(row.assignedQuantity),
    reason: '',
  };
}

export type DraftEvaluation =
  | { ok: true; body: UpdateLedgerBody }
  | { ok: false; reason: 'nochange' | 'invalid' };

/**
 * Evaluate an edit draft against the current row. Non-negative integers only — a
 * blank / negative / non-integer field → 'invalid' (Save blocked). When both are
 * valid, the body carries ONLY the changed quantities (+ a non-empty reason); no
 * change → 'nochange' (Save blocked). Mirrors the backend, which also ignores
 * unchanged fields and rejects negatives.
 */
export function evaluateLedgerDraft(
  draft: LedgerEditDraft,
  row: LedgerRow,
): DraftEvaluation {
  const alloc = parseQty(draft.allocatedQuantity);
  const assigned = parseQty(draft.assignedQuantity);
  if (alloc === null || assigned === null)
    return { ok: false, reason: 'invalid' };

  const body: UpdateLedgerBody = {};
  if (alloc !== row.allocatedQuantity) body.allocatedQuantity = alloc;
  if (assigned !== row.assignedQuantity) body.assignedQuantity = assigned;
  if (
    body.allocatedQuantity === undefined &&
    body.assignedQuantity === undefined
  )
    return { ok: false, reason: 'nochange' };

  const reason = draft.reason.trim();
  if (reason) body.reason = reason;
  return { ok: true, body };
}

/** A non-negative integer string → number, else null (blank / negative / decimal). */
function parseQty(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  return parseInt(t, 10);
}
