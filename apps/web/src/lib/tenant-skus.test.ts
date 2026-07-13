import { describe, expect, it } from 'vitest';
import { groupByCategory, platformStatus } from './tenant-skus';
import type { TenantSkuRow } from './api-types';

function row(p: {
  id: string;
  owned?: number | null;
  allocatedToOpcos?: number;
  assignedToUsers?: number;
  category?: string | null;
}): TenantSkuRow {
  const owned = p.owned ?? null;
  const allocatedToOpcos = p.allocatedToOpcos ?? 0;
  return {
    skuCatalogId: p.id,
    sku: {
      skuId: `g-${p.id}`,
      skuPartNumber: p.id.toUpperCase(),
      displayName: p.id,
      category: p.category ?? null,
    },
    owned,
    tenantConsumed: null,
    allocatedToOpcos,
    assignedToUsers: p.assignedToUsers ?? 0,
    unallocated: owned !== null ? owned - allocatedToOpcos : null,
    overAllocated: owned !== null && allocatedToOpcos > owned,
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
    });
    expect(groups[1].subtotal).toEqual({
      owned: 50,
      allocated: 20,
      assigned: 0,
      unallocated: 30,
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
      unallocated: 30,
    });
  });

  it('empty rows → empty groups', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
