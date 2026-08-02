import { describe, expect, it } from 'vitest';
import { buildCatalogCsv } from './catalog-export';
import type { SkuCatalog } from './api-types';

/**
 * CH-018. The file is opened in Excel by a human who then types aliases into an
 * allocation template, so what is guarded here is everything that would silently
 * produce a WRONG-LOOKING file rather than an error: column order, escaping, and
 * the placeholder characters that belong on screen but not in a spreadsheet.
 */

const BOM_CODE = 0xfeff;

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
    lastSyncedAt: p.lastSyncedAt ?? null,
    createdAt: '2026-07-25T00:00:00Z',
  };
}

/** Strip the Excel BOM so assertions read the plain CSV. */
function body(csv: string): string[] {
  const withoutBom = csv.charCodeAt(0) === BOM_CODE ? csv.slice(1) : csv;
  return withoutBom.trimEnd().split('\r\n');
}

describe('buildCatalogCsv', () => {
  it('writes the header in the same column order as the table', () => {
    const { csv } = buildCatalogCsv([]);

    expect(body(csv)[0]).toBe(
      'Display name,Part number,SkuId,Business alias,Category,Base licence,Active,Last synced',
    );
  });

  it('emits one row per SKU plus the header', () => {
    const { csv, skuCount } = buildCatalogCsv([
      sku({ skuPartNumber: 'SPE_E3' }),
      sku({ skuPartNumber: 'SPE_E5' }),
    ]);

    expect(body(csv)).toHaveLength(3);
    expect(skuCount).toBe(2);
  });

  it('carries every field through in order', () => {
    const { csv } = buildCatalogCsv([
      sku({
        skuPartNumber: 'SPE_E5',
        displayName: 'Microsoft 365 E5',
        skuId: '06ebc4ee-1bb5-47dd-8120-11324bc54e06',
        businessAlias: 'E5',
        category: 'Base',
        isBaseLicense: true,
      }),
    ]);

    expect(body(csv)[1]).toBe(
      'Microsoft 365 E5,SPE_E5,06ebc4ee-1bb5-47dd-8120-11324bc54e06,E5,Base,Yes,Yes,',
    );
  });

  /**
   * The real-world case: an alias copied out of the old Excel sheet
   * ("O365 E1 Existing Customer Sub Per User" is a live one) can contain a
   * comma. Unescaped, it shifts every later column by one — a file that opens
   * fine and is quietly wrong.
   */
  describe('RFC 4180 escaping', () => {
    it('quotes a value containing a comma', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', businessAlias: 'E1, legacy' }),
      ]);

      expect(body(csv)[1]).toContain('"E1, legacy"');
    });

    it('doubles embedded quotes', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', businessAlias: 'the "old" label' }),
      ]);

      expect(body(csv)[1]).toContain('"the ""old"" label"');
    });

    it('quotes a value containing a newline instead of breaking the row', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', displayName: 'line1\nline2' }),
      ]);

      // Still exactly two logical lines when split on the CRLF record separator.
      expect(body(csv)).toHaveLength(2);
      expect(body(csv)[1]).toContain('"line1\nline2"');
    });

    it('leaves an ordinary value unquoted', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'SPE_E3', businessAlias: 'E3' }),
      ]);

      expect(body(csv)[1]).not.toContain('"');
    });
  });

  /**
   * The em-dash is the TABLE's placeholder for "not set". Exporting it would
   * hand the operator a column full of characters they have to clear before the
   * file is usable.
   */
  describe('empty values are empty, not the UI placeholder', () => {
    it('writes nothing for a missing alias / category', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', businessAlias: null, category: null }),
      ]);

      const cells = body(csv)[1].split(',');
      expect(cells[3]).toBe(''); // Business alias
      expect(cells[4]).toBe(''); // Category
      expect(body(csv)[1]).not.toContain('—');
    });

    it('writes nothing for a never-synced SKU', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', lastSyncedAt: null }),
      ]);

      expect(body(csv)[1].split(',').at(-1)).toBe('');
    });

    it('writes nothing rather than a placeholder for an unparseable timestamp', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', lastSyncedAt: 'not-a-date' }),
      ]);

      expect(body(csv)[1].split(',').at(-1)).toBe('');
    });

    it('formats a real timestamp the same way the table does', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'X', lastSyncedAt: '2026-07-08T06:00:00Z' }),
      ]);

      // Quoted because the locale format contains a comma — which is exactly
      // why it goes through csvField rather than straight into the row.
      expect(body(csv)[1].split(',').at(-1)).not.toBe('');
      expect(body(csv)[1]).toContain('"');
    });
  });

  describe('booleans read as words, because a human opens this', () => {
    it('maps base / active flags to Yes and No', () => {
      const { csv } = buildCatalogCsv([
        sku({ skuPartNumber: 'A', isBaseLicense: true, active: true }),
        sku({ skuPartNumber: 'B', isBaseLicense: false, active: false }),
      ]);

      const [, first, second] = body(csv);
      expect(first.split(',').slice(5, 7)).toEqual(['Yes', 'Yes']);
      expect(second.split(',').slice(5, 7)).toEqual(['No', 'No']);
    });
  });

  it('keeps the order it was given — the API already sorts, re-sorting would desync from the screen', () => {
    const { csv } = buildCatalogCsv([
      sku({ skuPartNumber: 'ZULU' }),
      sku({ skuPartNumber: 'ALPHA' }),
    ]);

    expect(body(csv)[1]).toContain('ZULU');
    expect(body(csv)[2]).toContain('ALPHA');
  });

  it('prefixes the BOM so Excel reads it as UTF-8', () => {
    const { csv } = buildCatalogCsv([
      sku({ skuPartNumber: 'X', businessAlias: 'Visio・P2' }),
    ]);

    expect(csv.charCodeAt(0)).toBe(BOM_CODE);
    expect(csv).toContain('Visio・P2');
  });

  it('uses a fixed file name so repeat exports overwrite instead of piling up', () => {
    expect(buildCatalogCsv([]).fileName).toBe('sku-catalog.csv');
  });

  it('still produces a valid header-only file when the catalog is empty', () => {
    const { csv, skuCount } = buildCatalogCsv([]);

    expect(skuCount).toBe(0);
    expect(body(csv)).toHaveLength(1);
  });
});
