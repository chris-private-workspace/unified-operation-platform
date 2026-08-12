import { describe, expect, it } from 'vitest';
import {
  assetStatus,
  distinctOpcos,
  evaluateLedgerDraft,
  initLedgerDraft,
  utilizationPct,
} from './ledger';
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
      assignedQuantity: 14,
      headroom: -4,
      overAllocated: true,
    });
    expect(s).toEqual({ label: 'Over-allocated', tone: 'danger' });
  });

  it('budget set with no headroom left → warn (fully allocated)', () => {
    const s = assetStatus({
      allocatedQuantity: 10,
      assignedQuantity: 10,
      headroom: 0,
      overAllocated: false,
    });
    expect(s).toEqual({ label: 'Fully allocated', tone: 'warn' });
  });

  // CH-024 E — the healthy label restates the "Available" column, so it is
  // named after it. Asserted literally (not derived from the source) so a
  // rename cannot pass silently: this is the string an operator reads.
  it('headroom available → Available / ok', () => {
    const s = assetStatus({
      allocatedQuantity: 10,
      assignedQuantity: 4,
      headroom: 6,
      overAllocated: false,
    });
    expect(s).toEqual({ label: 'Available', tone: 'ok' });
  });

  // ── CH-008 ────────────────────────────────────────────────────────
  it('0 / 0 → Empty / neutral (before CH-008 this fell through to the green healthy label)', () => {
    const s = assetStatus({
      allocatedQuantity: 0,
      assignedQuantity: 0,
      headroom: 0,
      overAllocated: false,
    });
    expect(s).toEqual({ label: 'Empty', tone: 'neutral' });
  });

  it('allocated=0 with assigned>0 stays Over-allocated — Empty must not out-rank it (A5)', () => {
    const s = assetStatus({
      allocatedQuantity: 0,
      assignedQuantity: 5,
      headroom: -5,
      overAllocated: true,
    });
    expect(s).toEqual({ label: 'Over-allocated', tone: 'danger' });
  });

  it('budget set with nobody assigned is NOT empty — still Available (A4)', () => {
    const s = assetStatus({
      allocatedQuantity: 80,
      assignedQuantity: 0,
      headroom: 80,
      overAllocated: false,
    });
    expect(s).toEqual({ label: 'Available', tone: 'ok' });
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

describe('initLedgerDraft', () => {
  it('seeds the inputs from the row, reason blank', () => {
    const r = row({ code: 'RHK', allocatedQuantity: 80, assignedQuantity: 6 });
    expect(initLedgerDraft(r)).toEqual({
      allocatedQuantity: '80',
      assignedQuantity: '6',
      reason: '',
    });
  });
});

describe('evaluateLedgerDraft (W23-B inline edit)', () => {
  const r = row({ code: 'RHK', allocatedQuantity: 80, assignedQuantity: 6 });

  it('changing allocated only → body carries just allocatedQuantity', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '100', assignedQuantity: '6', reason: '' },
        r,
      ),
    ).toEqual({ ok: true, body: { allocatedQuantity: 100 } });
  });

  it('changing assigned only (對回) → body carries just assignedQuantity', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '80', assignedQuantity: '9', reason: '' },
        r,
      ),
    ).toEqual({ ok: true, body: { assignedQuantity: 9 } });
  });

  it('changing both → body carries both', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '90', assignedQuantity: '9', reason: '' },
        r,
      ),
    ).toEqual({
      ok: true,
      body: { allocatedQuantity: 90, assignedQuantity: 9 },
    });
  });

  it('non-empty reason is trimmed into the body', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '100', assignedQuantity: '6', reason: '  fix  ' },
        r,
      ),
    ).toEqual({ ok: true, body: { allocatedQuantity: 100, reason: 'fix' } });
  });

  it('blank reason is omitted from the body', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '100', assignedQuantity: '6', reason: '   ' },
        r,
      ),
    ).toEqual({ ok: true, body: { allocatedQuantity: 100 } });
  });

  it('zero is valid (allocated → 0)', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '0', assignedQuantity: '6', reason: '' },
        r,
      ),
    ).toEqual({ ok: true, body: { allocatedQuantity: 0 } });
  });

  it('no change → nochange (Save blocked)', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '80', assignedQuantity: '6', reason: '' },
        r,
      ),
    ).toEqual({ ok: false, reason: 'nochange' });
  });

  it('reason-only edit with no number change → nochange', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '80', assignedQuantity: '6', reason: 'note' },
        r,
      ),
    ).toEqual({ ok: false, reason: 'nochange' });
  });

  it('negative → invalid', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '-1', assignedQuantity: '6', reason: '' },
        r,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('empty field → invalid', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '', assignedQuantity: '6', reason: '' },
        r,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('non-integer (decimal) → invalid', () => {
    expect(
      evaluateLedgerDraft(
        { allocatedQuantity: '3.5', assignedQuantity: '6', reason: '' },
        r,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });
});
