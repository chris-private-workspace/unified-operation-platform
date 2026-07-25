import { parseAllocationMatrix, toQuantity } from './matrix-csv';

// The mapper itself is exercised end-to-end by both consumers
// (allocation-import.service.spec + assigned-baseline.spec). What those two do
// NOT cover is cell sanitising — a negative or decimal cell reaching the ledger
// would violate the non-negative-integer contract both writers assume.
describe('toQuantity', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    [undefined, 0],
    ['0', 0],
    ['42', 42],
    ['  7 ', 7],
    ['-5', 0], // never a negative seat count
    ['12.9', 12], // truncate, don't round
    ['abc', 0], // junk reads as 0, not NaN
    ['1e3', 1000], // Number() accepts it; still an integer
  ])('%p → %p', (raw, expected) => {
    expect(toQuantity(raw as string | undefined)).toBe(expected);
  });
});

describe('parseAllocationMatrix', () => {
  const OPCOS = [{ id: 'o1', code: 'RHK' }];
  const SKUS = [
    { id: 's1', skuPartNumber: 'SPE_E3', businessAlias: 'M365 E3' },
    { id: 's2', skuPartNumber: 'FLOW_FREE', businessAlias: null },
  ];

  it('a SKU with no businessAlias can never be matched (curation-as-scope)', () => {
    const parsed = parseAllocationMatrix(
      [',RHK', 'M365 E3,5', 'FLOW_FREE,9'].join('\n'),
      OPCOS,
      SKUS,
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skippedSkuLabels).toEqual(['FLOW_FREE']);
    expect(parsed.skuByAlias.has('M365 E3')).toBe(true);
  });

  it('blank spacer rows are ignored and not counted as SKU rows', () => {
    const parsed = parseAllocationMatrix(
      [',RHK', 'M365 E3,5', ',', ''].join('\n'),
      OPCOS,
      SKUS,
    );
    expect(parsed.skuRowCount).toBe(1);
    expect(parsed.skippedSkuLabels).toEqual([]);
  });

  it('alias matching trims but is otherwise exact — no case folding', () => {
    const parsed = parseAllocationMatrix(
      [',RHK', '  M365 E3  ,5', 'm365 e3,7'].join('\n'),
      OPCOS,
      SKUS,
    );
    expect(parsed.rows).toHaveLength(1); // the trimmed one matched
    expect(parsed.rows[0].cells[0].value).toBe(5);
    expect(parsed.skippedSkuLabels).toEqual(['m365 e3']); // lower-case did not
  });
});
