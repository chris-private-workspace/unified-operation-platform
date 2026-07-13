import { describe, expect, it } from 'vitest';
import { assetStatus, distinctOpcos, utilizationPct } from './ledger';
import type { LedgerRow } from './api-types';

// Minimal row factory — only the fields the derivations read need to be real.
function row(p: Partial<LedgerRow> & { code: string }): LedgerRow {
  const allocatedQuantity = p.allocatedQuantity ?? 0;
  const assignedQuantity = p.assignedQuantity ?? 0;
  return {
    id: `${p.code}-${p.skuCatalogId ?? 'x'}`,
    opcoId: p.code,
    skuCatalogId: p.skuCatalogId ?? 'sku',
    allocatedQuantity,
    assignedQuantity,
    headroom: p.headroom ?? allocatedQuantity - assignedQuantity,
    overAllocated: p.overAllocated ?? assignedQuantity > allocatedQuantity,
    opco: { code: p.code, displayName: `${p.code} Co` },
    sku: {
      skuId: 'g',
      skuPartNumber: 'PN',
      displayName: 'SKU',
      category: null,
    },
  };
}

describe('utilizationPct', () => {
  it('assigned-of-allocated as a whole percent', () => {
    expect(
      utilizationPct({ allocatedQuantity: 100, assignedQuantity: 50 }),
    ).toBe(50);
  });

  it('rounds to the nearest whole percent', () => {
    expect(utilizationPct({ allocatedQuantity: 3, assignedQuantity: 1 })).toBe(
      33,
    );
  });

  it('allocated=0 has no ratio → 0 (no divide-by-zero / Infinity)', () => {
    expect(utilizationPct({ allocatedQuantity: 0, assignedQuantity: 0 })).toBe(
      0,
    );
    expect(utilizationPct({ allocatedQuantity: 0, assignedQuantity: 5 })).toBe(
      0,
    );
  });

  it('over-allocated clamps at 100 for the bar', () => {
    expect(
      utilizationPct({ allocatedQuantity: 10, assignedQuantity: 14 }),
    ).toBe(100);
  });
});

describe('assetStatus', () => {
  it('over-allocated → danger', () => {
    const s = assetStatus({
      allocatedQuantity: 10,
      headroom: -4,
      overAllocated: true,
    });
    expect(s).toEqual({ label: 'Over-allocated', tone: 'danger' });
  });

  it('budget set with no headroom left → warn (fully allocated)', () => {
    const s = assetStatus({
      allocatedQuantity: 10,
      headroom: 0,
      overAllocated: false,
    });
    expect(s).toEqual({ label: 'Fully allocated', tone: 'warn' });
  });

  it('headroom available → ok', () => {
    const s = assetStatus({
      allocatedQuantity: 10,
      headroom: 6,
      overAllocated: false,
    });
    expect(s).toEqual({ label: 'Headroom', tone: 'ok' });
  });
});

describe('distinctOpcos', () => {
  it('dedupes by code and sorts', () => {
    const rows = [
      row({ code: 'RTH', skuCatalogId: 'a' }),
      row({ code: 'RHK', skuCatalogId: 'b' }),
      row({ code: 'RTH', skuCatalogId: 'c' }),
    ];
    expect(distinctOpcos(rows).map((o) => o.code)).toEqual(['RHK', 'RTH']);
  });

  it('empty rows → empty list', () => {
    expect(distinctOpcos([])).toEqual([]);
  });
});
