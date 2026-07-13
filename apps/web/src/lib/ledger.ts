import type { BadgeTone } from '@/components/ui/badge';
import type { LedgerOpcoRef, LedgerRow } from './api-types';

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
 * allocated (assigned > allocated) → danger; fully allocated (budget set, no
 * headroom left) → warn; otherwise headroom available → ok.
 */
export function assetStatus(
  row: Pick<LedgerRow, 'allocatedQuantity' | 'headroom' | 'overAllocated'>,
): AssetStatus {
  if (row.overAllocated) return { label: 'Over-allocated', tone: 'danger' };
  if (row.allocatedQuantity > 0 && row.headroom === 0)
    return { label: 'Fully allocated', tone: 'warn' };
  return { label: 'Headroom', tone: 'ok' };
}

/** Distinct OpCos in the rows, by code, sorted — feeds the filter chips. */
export function distinctOpcos(rows: LedgerRow[]): LedgerOpcoRef[] {
  const seen = new Map<string, LedgerOpcoRef>();
  for (const r of rows) {
    if (!seen.has(r.opco.code)) seen.set(r.opco.code, r.opco);
  }
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}
