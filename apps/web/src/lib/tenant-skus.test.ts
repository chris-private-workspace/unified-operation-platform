import { describe, expect, it } from 'vitest';
import { groupByCategory, platformStatus } from './tenant-skus';
import type { SeatModel, TenantSkuRow } from './api-types';

function row(p: {
  id: string;
  owned?: number | null;
  allocatedToOpcos?: number;
  assignedToUsers?: number;
  category?: string | null;
  seatModel?: SeatModel;
  tenantConsumed?: number | null;
}): TenantSkuRow {
  const owned = p.owned ?? null;
  const allocatedToOpcos = p.allocatedToOpcos ?? 0;
  const seatModel = p.seatModel ?? 'prepaid';
  const unlimited = seatModel === 'unlimited';
  // Mirrors tenant-owned.service.ts so a fixture cannot describe a row the API
  // would never emit (e.g. unlimited WITH an unallocated figure).
  const noPrepaidSeats =
    !unlimited && owned === 0 && (p.tenantConsumed ?? 0) > 0;
  return {
    skuCatalogId: p.id,
    sku: {
      skuId: `g-${p.id}`,
      skuPartNumber: p.id.toUpperCase(),
      displayName: p.id,
      category: p.category ?? null,
    },
    seatModel,
    owned,
    tenantConsumed: p.tenantConsumed ?? null,
    allocatedToOpcos,
    assignedToUsers: p.assignedToUsers ?? 0,
    unallocated:
      unlimited || noPrepaidSeats || owned === null
        ? null
        : owned - allocatedToOpcos,
    overAllocated: !unlimited && owned !== null && allocatedToOpcos > owned,
    noPrepaidSeats,
  };
}

describe('platformStatus', () => {
  it('over-allocated (allocated > owned) → danger', () => {
    expect(
      platformStatus(row({ id: 'a', owned: 10, allocatedToOpcos: 14 })),
    ).toEqual({
      label: 'Over-allocated',
      tone: 'danger',
    });
  });

  it('owned unknown (never synced) → Not synced neutral', () => {
    expect(
      platformStatus(row({ id: 'b', owned: null, allocatedToOpcos: 5 })),
    ).toEqual({
      label: 'Not synced',
      tone: 'neutral',
    });
  });

  it('owned fully committed to OpCos → Fully allocated warn', () => {
    expect(
      platformStatus(row({ id: 'c', owned: 10, allocatedToOpcos: 10 })),
    ).toEqual({
      label: 'Fully allocated',
      tone: 'warn',
    });
  });

  it('headroom available → Available ok', () => {
    expect(
      platformStatus(row({ id: 'd', owned: 10, allocatedToOpcos: 4 })),
    ).toEqual({
      label: 'Available',
      tone: 'ok',
    });
  });

  // ── CH-026 / ADR-0032 ──────────────────────────────────────────────────
  it('unlimited wins over every owned-derived verdict', () => {
    // The sentinel is bigger than any allocation, so the ordinary rules would
    // land on "Available" — right by accident. It has to be right on purpose.
    expect(
      platformStatus(
        row({
          id: 'pbi',
          seatModel: 'unlimited',
          owned: 1000000,
          allocatedToOpcos: 40,
          tenantConsumed: 3064,
        }),
      ),
    ).toEqual({ label: 'Unlimited', tone: 'neutral' });
  });

  it('prepaid with 0 owned but in use → No prepaid seats warn', () => {
    expect(
      platformStatus(row({ id: 'pbipro', owned: 0, tenantConsumed: 91 })),
    ).toEqual({ label: 'No prepaid seats', tone: 'warn' });
  });

  it('keeps Over-allocated ahead of No prepaid seats when both are true', () => {
    expect(
      platformStatus(
        row({
          id: 'both',
          owned: 0,
          tenantConsumed: 91,
          allocatedToOpcos: 5,
        }),
      ),
    ).toEqual({ label: 'Over-allocated', tone: 'danger' });
  });
});

describe('groupByCategory', () => {
  it('groups by category (null → Uncategorized), preserves order, sums subtotals', () => {
    const groups = groupByCategory([
      {
        ...row({
          id: 'e3',
          category: 'Base',
          owned: 2000,
          allocatedToOpcos: 2285,
        }),
      },
      {
        ...row({
          id: 'e1',
          category: 'Base',
          owned: 100,
          allocatedToOpcos: 86,
        }),
      },
      {
        ...row({
          id: 'ad',
          category: 'Add-on',
          owned: 50,
          allocatedToOpcos: 20,
        }),
      },
      { ...row({ id: 'x', category: null, owned: 10, allocatedToOpcos: 5 }) },
    ]);

    expect(groups.map((g) => g.category)).toEqual([
      'Base',
      'Add-on',
      'Uncategorized',
    ]);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].subtotal).toEqual({
      owned: 2100,
      allocated: 2371,
      assigned: 0,
      unallocated: -271, // 2100 - 2371
      unlimited: 0,
    });
    expect(groups[1].subtotal).toEqual({
      owned: 50,
      allocated: 20,
      assigned: 0,
      unallocated: 30,
      unlimited: 0,
    });
    expect(groups[2].category).toBe('Uncategorized');
  });

  it('counts owned=null as 0 in a subtotal', () => {
    const [g] = groupByCategory([
      {
        ...row({
          id: 'synced',
          category: 'Base',
          owned: 100,
          allocatedToOpcos: 40,
        }),
      },
      {
        ...row({
          id: 'unsynced',
          category: 'Base',
          owned: null,
          allocatedToOpcos: 30,
        }),
      },
    ]);
    expect(g.subtotal).toEqual({
      owned: 100, // null → 0
      allocated: 70,
      assigned: 0,
      unlimited: 0,
      unallocated: 30,
    });
  });

  it('empty rows → empty groups', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  // Same line the stats endpoint draws (ADR-0032 D3): a subtotal that added the
  // sentinel would put 1,000,000 on a category row and make the column useless.
  it('leaves unlimited SKUs out of owned / unallocated but keeps their seats', () => {
    const [g] = groupByCategory([
      row({ id: 'e3', category: 'Base', owned: 2000, allocatedToOpcos: 1800 }),
      row({
        id: 'pbi',
        category: 'Base',
        seatModel: 'unlimited',
        owned: 1000000,
        allocatedToOpcos: 40,
        assignedToUsers: 12,
      }),
    ]);

    expect(g.subtotal).toEqual({
      owned: 2000, // hard-coded: the sentinel must not appear at any scale
      allocated: 1840, // 1800 + 40 — real seats on both
      assigned: 12,
      unallocated: 200, // 2000 - 1800, prepaid only
      unlimited: 1,
    });
  });
});
