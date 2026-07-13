import type { BadgeTone } from '@/components/ui/badge';
import type { TenantSkuRow } from './api-types';

// Pure display-layer derivations for the Assets Platform table. Out of the
// component so they are unit-testable (W17 D3).

export interface PlatformStatus {
  label: string;
  tone: BadgeTone;
}

/**
 * Row health for the Platform status column. over-allocated (allocated to OpCos
 * exceeds tenant-owned) → danger; owned unknown (never synced) → neutral; owned
 * fully committed to OpCos → warn; otherwise headroom available → ok.
 */
export function platformStatus(row: TenantSkuRow): PlatformStatus {
  if (row.overAllocated) return { label: 'Over-allocated', tone: 'danger' };
  if (row.owned === null) return { label: 'Not synced', tone: 'neutral' };
  if (row.owned > 0 && row.unallocated === 0)
    return { label: 'Fully allocated', tone: 'warn' };
  return { label: 'Available', tone: 'ok' };
}

export interface CategoryGroup {
  category: string;
  rows: TenantSkuRow[];
  subtotal: {
    owned: number;
    allocated: number;
    assigned: number;
    unallocated: number;
  };
}

/**
 * Group rows by SKU category (null → "Uncategorized"), preserving first-seen
 * order (the backend already sorts by category → partNumber). Each group carries
 * a subtotal; owned nulls count as 0 so a partly-synced group still totals.
 */
export function groupByCategory(rows: TenantSkuRow[]): CategoryGroup[] {
  const groups = new Map<string, TenantSkuRow[]>();
  for (const r of rows) {
    const key = r.sku.category ?? 'Uncategorized';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return [...groups.entries()].map(([category, rs]) => {
    const owned = rs.reduce((s, r) => s + (r.owned ?? 0), 0);
    const allocated = rs.reduce((s, r) => s + r.allocatedToOpcos, 0);
    const assigned = rs.reduce((s, r) => s + r.assignedToUsers, 0);
    return {
      category,
      rows: rs,
      subtotal: { owned, allocated, assigned, unallocated: owned - allocated },
    };
  });
}
