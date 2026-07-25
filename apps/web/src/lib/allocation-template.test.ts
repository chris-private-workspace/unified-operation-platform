import { describe, expect, it } from 'vitest';
import { buildAllocationTemplate } from './allocation-template';
import type { AdminOpco, LedgerRow, SkuCatalog } from './api-types';

const BOM_CODE = 0xfeff;

function opco(code: string, id = code.toLowerCase()): AdminOpco {
  return { id, code, displayName: `${code} Co` };
}

function sku(p: Partial<SkuCatalog> & { skuPartNumber: string }): SkuCatalog {
  return {
    id: p.id ?? `id-${p.skuPartNumber}`,
    skuId: p.skuId ?? `guid-${p.skuPartNumber}`,
    skuPartNumber: p.skuPartNumber,
    displayName: p.displayName ?? p.skuPartNumber,
    businessAlias: p.businessAlias ?? null,
    category: p.category ?? null,
    isBaseLicense: p.isBaseLicense ?? false,
    active: p.active ?? true,
    lastSyncedAt: null,
    createdAt: '2026-07-25T00:00:00Z',
  };
}

function ledger(
  skuCatalogId: string,
  opcoId: string,
  allocatedQuantity: number,
): LedgerRow {
  return {
    id: `${opcoId}-${skuCatalogId}`,
    opcoId,
    skuCatalogId,
    allocatedQuantity,
    assignedQuantity: 0,
    headroom: allocatedQuantity,
    overAllocated: false,
    opco: { code: opcoId.toUpperCase(), displayName: 'x' },
    sku: {
      skuId: 'g',
      skuPartNumber: 'PN',
      displayName: 'SKU',
      category: null,
    },
  };
}

/** Strip the Excel BOM so assertions read the plain CSV. */
function body(csv: string): string[] {
  const withoutBom = csv.charCodeAt(0) === BOM_CODE ? csv.slice(1) : csv;
  return withoutBom.trimEnd().split('\r\n');
}

describe('buildAllocationTemplate', () => {
  it('header 用真 Opco.code、col-A 用 curated businessAlias(sorted)', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RTH'), opco('RHK')],
      catalog: [
        sku({ skuPartNumber: 'POWER_BI_PRO', businessAlias: 'PBI Pro' }),
        sku({ skuPartNumber: 'DESKLESSPACK', businessAlias: 'F3 Frontline' }),
      ],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lines = body(res.csv);
    expect(lines[0]).toBe('SKU,RHK,RTH'); // OpCo 依 code 排序
    expect(lines[1]).toBe('F3 Frontline,0,0'); // alias 依字母排序
    expect(lines[2]).toBe('PBI Pro,0,0');
    expect(res.opcoCount).toBe(2);
    expect(res.skuCount).toBe(2);
  });

  it('格填當前 allocatedQuantity —— 原封上傳應該零改動(G2 idempotent 前提)', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK'), opco('RTH')],
      catalog: [
        sku({
          id: 'sku-e3',
          skuPartNumber: 'SPE_E3',
          businessAlias: 'M365 E3',
        }),
      ],
      // RHK 有 120,RTH 冇 row → 0
      ledger: [ledger('sku-e3', 'rhk', 120)],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(body(res.csv)[1]).toBe('M365 E3,120,0');
  });

  it('未 curate 嘅 active SKU 唔出 row,改為喺 uncuratedSkus 報告', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [
        sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' }),
        sku({ skuPartNumber: 'FLOW_FREE' }), // alias null
        sku({ skuPartNumber: 'WHITESPACE', businessAlias: '   ' }), // 只有空白 = 未 curate
      ],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(body(res.csv)).toHaveLength(2); // header + 1 row
    expect(res.uncuratedSkus).toEqual(['FLOW_FREE', 'WHITESPACE']);
  });

  it('inactive SKU 完全唔理(連 uncurated 都唔報)', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [
        sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' }),
        sku({ skuPartNumber: 'DEAD_SKU', active: false }),
      ],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.uncuratedSkus).toEqual([]);
  });

  it('一個 alias 都未 curate → 唔生空範本,回 no-curated-sku', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [sku({ skuPartNumber: 'SPE_E3' })],
      ledger: [],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no-curated-sku');
    expect(res.uncuratedSkus).toEqual(['SPE_E3']);
  });

  it('冇 OpCo → no-opcos', () => {
    const res = buildAllocationTemplate({
      opcos: [],
      catalog: [sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' })],
      ledger: [],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no-opcos');
  });

  it('alias 含逗號 / 引號 → RFC 4180 引號逃逸(對得住後端 parseCsv)', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [
        sku({
          skuPartNumber: 'SPE_E3',
          businessAlias: 'M365 E3, Existing "Customer" Sub',
        }),
      ],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(body(res.csv)[1]).toBe('"M365 E3, Existing ""Customer"" Sub",0');
  });

  it('同一 alias 撞兩個 SKU 只出一行(唔生重複 row)', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [
        sku({ id: 'a', skuPartNumber: 'SPE_E3', businessAlias: 'Dup' }),
        sku({ id: 'b', skuPartNumber: 'SPE_E5', businessAlias: 'Dup' }),
      ],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(body(res.csv)).toHaveLength(2);
    expect(res.skuCount).toBe(1);
  });

  it('唔生 Grand Total 欄(import 會忽略,生出嚟只會誤導)', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' })],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.csv).not.toContain('Grand Total');
  });

  it('BOM 前置(Excel UTF-8)—— 後端 parseCsv 會 strip', () => {
    const res = buildAllocationTemplate({
      opcos: [opco('RHK')],
      catalog: [sku({ skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' })],
      ledger: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.csv.charCodeAt(0)).toBe(BOM_CODE);
  });
});
