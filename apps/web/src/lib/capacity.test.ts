import { describe, expect, it } from 'vitest';
import {
  buildLedgerIndex,
  buildTenantIndex,
  opcoCapacity,
  tenantCapacity,
} from './capacity';
import type { LedgerRow, TenantSkuRow } from './api-types';

const SKU_REF = {
  skuId: 'guid',
  skuPartNumber: 'PN',
  displayName: 'SKU',
  category: null,
};

/** Minimal ledger row — only the fields the lookups read need to be real. */
function row(
  opcoId: string,
  skuCatalogId: string,
  allocatedQuantity: number,
  assignedQuantity: number,
): LedgerRow {
  return {
    id: `${opcoId}-${skuCatalogId}`,
    opcoId,
    skuCatalogId,
    allocatedQuantity,
    assignedQuantity,
    headroom: allocatedQuantity - assignedQuantity,
    overAllocated: assignedQuantity > allocatedQuantity,
    opco: { code: opcoId, displayName: `${opcoId} Co` },
    sku: SKU_REF,
  };
}

function tenantRow(p: Partial<TenantSkuRow> & { skuCatalogId: string }) {
  return {
    skuCatalogId: p.skuCatalogId,
    sku: SKU_REF,
    owned: p.owned ?? null,
    tenantConsumed: p.tenantConsumed ?? null,
    allocatedToOpcos: p.allocatedToOpcos ?? 0,
    assignedToUsers: p.assignedToUsers ?? 0,
    unallocated: p.unallocated ?? null,
    overAllocated: p.overAllocated ?? false,
  } satisfies TenantSkuRow;
}

describe('opcoCapacity', () => {
  // The whole point of the composite key: a request's OpCo × the line's SKU.
  // Picking the wrong axis (or only keying on one) would still "find a row" —
  // these rows are built so a wrong key returns visibly wrong numbers.
  const index = buildLedgerIndex([
    row('rhk', 'e5', 120, 118),
    row('rhk', 'copilot', 10, 3),
    row('rcn', 'e5', 40, 40),
  ]);

  it('finds the row for this OpCo AND this SKU', () => {
    expect(opcoCapacity(index, 'rhk', 'e5')).toEqual({
      present: true,
      allocated: 120,
      assigned: 118,
      headroom: 2,
      exhausted: false,
    });
  });

  it('does not bleed across SKUs within the same OpCo', () => {
    expect(opcoCapacity(index, 'rhk', 'copilot').allocated).toBe(10);
  });

  it('does not bleed across OpCos for the same SKU', () => {
    const rcn = opcoCapacity(index, 'rcn', 'e5');
    expect(rcn.allocated).toBe(40);
    expect(rcn.exhausted).toBe(true); // 40 assigned of 40
  });

  // Spec D5 — a missing row means "no allocation set", NOT "loading" and NOT a
  // reason to hide the layer. allocated = 0 ⇒ ADR-0016 would refuse the assign.
  it('treats a missing row as allocated 0 / assigned 0, and exhausted', () => {
    expect(opcoCapacity(index, 'rhk', 'never-budgeted')).toEqual({
      present: false,
      allocated: 0,
      assigned: 0,
      headroom: 0,
      exhausted: true,
    });
  });

  it('reports negative headroom when already over budget', () => {
    const over = buildLedgerIndex([row('rhk', 'e5', 100, 105)]);
    const cap = opcoCapacity(over, 'rhk', 'e5');
    expect(cap.headroom).toBe(-5);
    expect(cap.exhausted).toBe(true);
  });

  // Guards ADR-0016's gate condition (assigned + 1 > allocated) against an
  // off-by-one: the last free seat must NOT read as exhausted.
  describe('exhausted boundary', () => {
    it('one seat left → not exhausted', () => {
      const i = buildLedgerIndex([row('rhk', 'e5', 10, 9)]);
      expect(opcoCapacity(i, 'rhk', 'e5').exhausted).toBe(false);
    });

    it('exactly at budget → exhausted', () => {
      const i = buildLedgerIndex([row('rhk', 'e5', 10, 10)]);
      expect(opcoCapacity(i, 'rhk', 'e5').exhausted).toBe(true);
    });
  });
});

describe('tenantCapacity', () => {
  it('derives available seats from the snapshot', () => {
    const index = buildTenantIndex([
      tenantRow({ skuCatalogId: 'e5', owned: 200, tenantConsumed: 187 }),
    ]);
    expect(tenantCapacity(index, 'e5')).toEqual({
      known: true,
      owned: 200,
      consumed: 187,
      available: 13,
      exhausted: false,
    });
  });

  it('is unknown when the SKU has no tenant row at all', () => {
    const index = buildTenantIndex([]);
    expect(tenantCapacity(index, 'e5').known).toBe(false);
  });

  // A ledger-only SKU: the row exists but owned / consumed are null. Reporting
  // available 0 here would read as "no seats left" — a different claim entirely.
  it('is unknown when the row exists but has no snapshot figures', () => {
    const index = buildTenantIndex([
      tenantRow({ skuCatalogId: 'e5', allocatedToOpcos: 5 }),
    ]);
    const cap = tenantCapacity(index, 'e5');
    expect(cap.known).toBe(false);
    expect(cap.exhausted).toBe(false); // unknown ≠ exhausted
  });

  it('is exhausted when consumption has caught up with owned', () => {
    const index = buildTenantIndex([
      tenantRow({ skuCatalogId: 'e5', owned: 50, tenantConsumed: 50 }),
    ]);
    expect(tenantCapacity(index, 'e5').exhausted).toBe(true);
  });

  it('floors available at 0 when consumption exceeds owned', () => {
    const index = buildTenantIndex([
      tenantRow({ skuCatalogId: 'e5', owned: 50, tenantConsumed: 56 }),
    ]);
    const cap = tenantCapacity(index, 'e5');
    expect(cap.available).toBe(0);
    expect(cap.exhausted).toBe(true);
  });
});
