import type { BadgeTone } from '@/components/ui/badge';
import type { TenantSkuRow } from './api-types';

// Pure display-layer derivations for the Assets Platform table. Out of the
// component so they are unit-testable (W17 D3).

export interface PlatformStatus {
  label: string;
  tone: BadgeTone;
}

/**
 * Row health for the Platform status column. unlimited (no seat concept at all)
 * → neutral; over-allocated (allocated to OpCos exceeds tenant-owned) → danger;
 * no prepaid seats but in use → warn; owned unknown (never synced) → neutral;
 * owned fully committed to OpCos → warn; otherwise headroom available → ok.
 *
 * 🔴 `unlimited` is first because every check under it reads `owned`, and on an
 * unlimited SKU `owned` is a Graph sentinel rather than a seat count (ADR-0032).
 * `overAllocated` stays ahead of `noPrepaidSeats`: both can be true at once
 * (0 owned, seats allocated anyway) and the over-allocation is the louder fact.
 */
export function platformStatus(row: TenantSkuRow): PlatformStatus {
  if (row.seatModel === 'unlimited')
    return { label: 'Unlimited', tone: 'neutral' };
  if (row.overAllocated) return { label: 'Over-allocated', tone: 'danger' };
  /**
   * ADR-0033 D5 — the label reads Microsoft's own capabilityStatus rather than
   * inferring "cancelled" from suspended > 0. Deriving it here would re-create a
   * verdict the vendor already published, and the two would drift.
   *
   * CH-026 called this "No seats enabled", which was accurate about what we had
   * measured (`enabled` was 0) and wrong about what it meant: 11 of those 15
   * SKUs had usable seats in the grace period. Those now pass this branch
   * entirely — `owned` includes them.
   */
  if (row.noPrepaidSeats)
    return {
      label:
        row.ownedBreakdown?.capabilityStatus === 'Suspended'
          ? 'Subscription suspended'
          : 'No seats available',
      tone: 'warn',
    };
  if (row.owned === null) return { label: 'Not synced', tone: 'neutral' };
  if (row.owned > 0 && row.unallocated === 0)
    return { label: 'Fully allocated', tone: 'warn' };
  return { label: 'Available', tone: 'ok' };
}

/**
 * Is this row's `owned` propped up by an expired subscription (ADR-0033 D7)?
 *
 * Not the same question as "warning > 0": a SKU with 4502 enabled and 242 in
 * grace is not the story. What matters on screen is that the number the reader
 * sees is not all clean `enabled` seats, so the threshold is simply "any grace
 * seats at all" — but the display treats it as an annotation on `owned`, never
 * as a status of its own (there is already a status column, and DS-8 keeps
 * state in one place).
 */
export function hasGraceSeats(row: TenantSkuRow): boolean {
  return (row.ownedBreakdown?.warning ?? 0) > 0;
}

/**
 * The full breakdown as one line, for the Owned cell's title (ADR-0033 D2 —
 * `owned` is a sum now, and an unexplainable sum is how SPE_E3 going 21 → 4498
 * turns into a support ticket).
 *
 * The excluded buckets are named as excluded rather than hidden: "suspended 50"
 * with no qualifier reads as part of the total.
 */
export function ownedBreakdownText(row: TenantSkuRow): string | undefined {
  const b = row.ownedBreakdown;
  if (!b) return undefined;
  const parts = [`enabled ${b.enabled}`, `expiry grace period ${b.warning}`];
  if (b.suspended > 0) parts.push(`suspended ${b.suspended} (not counted)`);
  if (b.lockedOut > 0) parts.push(`locked out ${b.lockedOut} (not counted)`);
  parts.push(`M365 status ${b.capabilityStatus}`);
  return parts.join(' · ');
}

export interface CategoryGroup {
  category: string;
  rows: TenantSkuRow[];
  subtotal: {
    owned: number;
    allocated: number;
    assigned: number;
    unallocated: number;
    /** Rows left out of `owned` / `unallocated` — otherwise the scope is silent. */
    unlimited: number;
  };
}

/**
 * Group rows by SKU category (null → "Uncategorized"), preserving first-seen
 * order (the backend already sorts by category → partNumber). Each group carries
 * a subtotal; owned nulls count as 0 so a partly-synced group still totals.
 *
 * 🔴 The subtotal draws the same line as `/license/tenant-skus/stats`
 * (ADR-0032 D3): `owned` and `unallocated` count PREPAID rows only — adding a
 * sentinel makes the number meaningless — while `allocated` / `assigned` count
 * every row, because those are real seats on an unlimited SKU too. Two
 * different scopes in one row is only safe because `unlimited` says so.
 */
export function groupByCategory(rows: TenantSkuRow[]): CategoryGroup[] {
  const groups = new Map<string, TenantSkuRow[]>();
  for (const r of rows) {
    const key = r.sku.category ?? 'Uncategorized';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return [...groups.entries()].map(([category, rs]) => {
    const prepaid = rs.filter((r) => r.seatModel !== 'unlimited');
    const owned = prepaid.reduce((s, r) => s + (r.owned ?? 0), 0);
    const prepaidAllocated = prepaid.reduce(
      (s, r) => s + r.allocatedToOpcos,
      0,
    );
    return {
      category,
      rows: rs,
      subtotal: {
        owned,
        allocated: rs.reduce((s, r) => s + r.allocatedToOpcos, 0),
        assigned: rs.reduce((s, r) => s + r.assignedToUsers, 0),
        unallocated: owned - prepaidAllocated,
        unlimited: rs.length - prepaid.length,
      },
    };
  });
}
