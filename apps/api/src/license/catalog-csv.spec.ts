import { BadRequestException } from '@nestjs/common';
import { parseCatalogCsv } from './catalog-csv';

/** The CH-018 export header, byte-for-byte (catalog-export.ts:20-29). */
const EXPORT_HEADER =
  'Display name,Part number,SkuId,Business alias,Category,Base licence,Seat model,Active,Last synced';

const exportRow = (
  name: string,
  part: string,
  guid: string,
  alias: string,
  category: string,
  base: string,
  seatModel = 'prepaid',
) =>
  `${name},${part},${guid},${alias},${category},${base},${seatModel},Yes,2 Aug 2026 10:00`;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    const response = (err as BadRequestException).getResponse();
    return (response as { code: string }).code;
  }
  throw new Error('expected parseCatalogCsv to throw');
}

describe('parseCatalogCsv (CH-019)', () => {
  it('round-trips the CH-018 export: system-owned columns are accepted and reported, never written', () => {
    const csv = [
      EXPORT_HEADER,
      exportRow(
        'Microsoft 365 E3',
        'SPE_E3',
        'guid-1',
        'E3 Bundle',
        'Base',
        'Yes',
      ),
    ].join('\r\n');

    const parsed = parseCatalogCsv(csv);

    expect(parsed.rows).toEqual([
      {
        skuId: 'guid-1',
        businessAlias: 'E3 Bundle',
        category: 'Base',
        isBaseLicense: true,
        // CH-026 — the export now carries it, so a round-trip reads it back.
        seatModel: 'prepaid',
      },
    ]);
    expect(parsed.unknownColumns).toEqual([
      'Display name',
      'Part number',
      'Active',
      'Last synced',
    ]);
  });

  it('strips the BOM the export prepends for Excel', () => {
    // Written as an escape, not a literal: an invisible U+FEFF in source is
    // exactly the kind of character an editor silently drops.
    const BOM = String.fromCharCode(0xfeff);
    const csv = `${BOM}SkuId,Business alias\r\nguid-1,E3\r\n`;
    expect(parseCatalogCsv(csv).rows[0].skuId).toBe('guid-1');
  });

  // Spreadsheet users reorder and delete columns; a positional read would write
  // Category into the alias field without a word of warning.
  it('matches columns by name, not position', () => {
    const csv = ['Category,Base licence,SkuId', 'Add-on,No,guid-9'].join('\n');

    expect(parseCatalogCsv(csv).rows).toEqual([
      { skuId: 'guid-9', category: 'Add-on', isBaseLicense: false },
    ]);
  });

  it('omits a field entirely when its column is absent (leave unchanged)', () => {
    const parsed = parseCatalogCsv('SkuId,Category\nguid-1,Base');

    expect(parsed.rows[0]).not.toHaveProperty('businessAlias');
    expect(parsed.rows[0]).not.toHaveProperty('isBaseLicense');
  });

  it('reads a blank alias / category cell as a clear (null), trimming first', () => {
    const parsed = parseCatalogCsv(
      'SkuId,Business alias,Category\nguid-1,,   \nguid-2,  E3  ,Base',
    );

    expect(parsed.rows[0]).toEqual({
      skuId: 'guid-1',
      businessAlias: null,
      category: null,
    });
    expect(parsed.rows[1].businessAlias).toBe('E3');
  });

  // isBaseLicense is not nullable — reading a blank cell as `false` would invent
  // an edit for every row whose Base column the operator simply left alone.
  it('leaves Base licence unchanged when the cell is blank', () => {
    const parsed = parseCatalogCsv('SkuId,Base licence\nguid-1,');
    expect(parsed.rows[0]).not.toHaveProperty('isBaseLicense');
  });

  it.each([
    ['Yes', true],
    ['yes', true],
    ['TRUE', true],
    ['1', true],
    ['No', false],
    ['false', false],
    ['0', false],
  ])('parses Base licence %s as %s', (raw, expected) => {
    const parsed = parseCatalogCsv(`SkuId,Base licence\nguid-1,${raw}`);
    expect(parsed.rows[0].isBaseLicense).toBe(expected);
  });

  it('rejects an unrecognised Base licence value with its line number', () => {
    let thrown: BadRequestException | undefined;
    try {
      parseCatalogCsv('SkuId,Base licence\nguid-1,Yes\nguid-2,maybe');
    } catch (err) {
      thrown = err as BadRequestException;
    }
    const body = thrown!.getResponse() as {
      code: string;
      invalidBaseValues: { line: number; value: string }[];
    };
    expect(body.code).toBe('invalid-base-value');
    expect(body.invalidBaseValues).toEqual([{ line: 3, value: 'maybe' }]);
  });

  // ── CH-026 / ADR-0032 — Seat model column ────────────────────────────────

  it.each([
    ['prepaid', 'prepaid'],
    ['Prepaid', 'prepaid'],
    ['UNLIMITED', 'unlimited'],
  ])('parses Seat model %s as %s', (raw, expected) => {
    const parsed = parseCatalogCsv(`SkuId,Seat model\nguid-1,${raw}`);
    expect(parsed.rows[0].seatModel).toBe(expected);
  });

  /**
   * A blank cell must not be read as 'prepaid'. It is the same rule as Base
   * licence above, but the cost is higher: writing 'prepaid' over a SKU someone
   * marked unlimited turns the tenant seat gate back on for it (ADR-0032 D4).
   */
  it('leaves Seat model unchanged when the cell is blank', () => {
    const parsed = parseCatalogCsv('SkuId,Seat model\nguid-1, ');
    expect(parsed.rows[0]).not.toHaveProperty('seatModel');
  });

  it('rejects an unrecognised Seat model value with its line number', () => {
    let thrown: BadRequestException | undefined;
    try {
      parseCatalogCsv('SkuId,Seat model\nguid-1,unlimited\nguid-2,infinite');
    } catch (err) {
      thrown = err as BadRequestException;
    }
    const body = thrown!.getResponse() as {
      code: string;
      message: string;
      invalidSeatModelValues: { line: number; value: string }[];
    };
    expect(body.code).toBe('invalid-seat-model-value');
    expect(body.invalidSeatModelValues).toEqual([
      { line: 3, value: 'infinite' },
    ]);
    // The message has to name the accepted values — "invalid" alone leaves an
    // operator guessing at a vocabulary that exists in exactly one file.
    expect(body.message).toBe(
      '"Seat model" must be prepaid or unlimited (blank leaves it unchanged).',
    );
  });

  it('treats Seat model as writable, not as an ignored system column', () => {
    const parsed = parseCatalogCsv('SkuId,Seat model\nguid-1,unlimited');
    expect(parsed.unknownColumns).toEqual([]);
  });

  // A file with ONLY Seat model edited must still import — before CH-026 the
  // "at least one editable column" guard would have called it nothing to do.
  it('accepts a file whose only editable column is Seat model', () => {
    expect(() =>
      parseCatalogCsv('SkuId,Display name,Seat model\nguid-1,E3,unlimited'),
    ).not.toThrow();
  });

  it('skips blank spacer rows without counting them', () => {
    const parsed = parseCatalogCsv(
      'SkuId,Category\nguid-1,Base\n,\nguid-2,Add-on\n',
    );
    expect(parsed.rows.map((r) => r.skuId)).toEqual(['guid-1', 'guid-2']);
  });

  it('handles quoted fields containing commas (RFC 4180)', () => {
    const parsed = parseCatalogCsv(
      'SkuId,Business alias\nguid-1,"E3, old label"',
    );
    expect(parsed.rows[0].businessAlias).toBe('E3, old label');
  });

  it('rejects a file with no SkuId column and reports what it did find', () => {
    let thrown: BadRequestException | undefined;
    try {
      parseCatalogCsv('Part number,Business alias\nSPE_E3,E3');
    } catch (err) {
      thrown = err as BadRequestException;
    }
    const body = thrown!.getResponse() as {
      code: string;
      foundColumns: string[];
    };
    expect(body.code).toBe('missing-sku-id-column');
    expect(body.foundColumns).toEqual(['Part number', 'Business alias']);
  });

  it('rejects a file with a SkuId column but nothing editable', () => {
    expect(
      code(() => parseCatalogCsv('SkuId,Part number\nguid-1,SPE_E3')),
    ).toBe('no-editable-column');
  });

  // Same reasoning as a repeated SkuId: contradictory intent on a field that
  // decides import scope must not be resolved by silently taking one of them.
  it('rejects a repeated writable column', () => {
    expect(
      code(() =>
        parseCatalogCsv('SkuId,Category,Category\nguid-1,Base,Add-on'),
      ),
    ).toBe('duplicate-column');
  });

  it('rejects the same SkuId twice, case-insensitively', () => {
    let thrown: BadRequestException | undefined;
    try {
      parseCatalogCsv('SkuId,Category\nGUID-1,Base\nguid-1,Add-on');
    } catch (err) {
      thrown = err as BadRequestException;
    }
    const body = thrown!.getResponse() as {
      code: string;
      duplicateSkuIds: string[];
    };
    expect(body.code).toBe('duplicate-sku-id');
    expect(body.duplicateSkuIds).toEqual(['guid-1']);
  });

  it('rejects an empty file', () => {
    expect(code(() => parseCatalogCsv(''))).toBe('empty-csv');
  });
});
