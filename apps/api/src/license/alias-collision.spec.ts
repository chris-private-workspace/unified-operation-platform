import { findAliasCollisions } from './alias-collision';

const entry = (id: string, part: string, alias: string | null) => ({
  id,
  skuPartNumber: part,
  businessAlias: alias,
});

describe('findAliasCollisions (CH-019 / ADR-0023 D5)', () => {
  it('returns nothing when every alias is unique', () => {
    expect(
      findAliasCollisions([
        entry('a', 'SPE_E3', 'E3 Bundle'),
        entry('b', 'SPE_E5', 'E5 Bundle'),
      ]),
    ).toEqual([]);
  });

  it('reports the alias and every SKU that would carry it', () => {
    const collisions = findAliasCollisions([
      entry('a', 'SPE_E3', 'E3 Bundle'),
      entry('b', 'ENTERPRISEPACK', 'E3 Bundle'),
    ]);

    expect(collisions).toEqual([
      { alias: 'E3 Bundle', skuPartNumbers: ['SPE_E3', 'ENTERPRISEPACK'] },
    ]);
  });

  it('lists all holders when three SKUs share one alias', () => {
    const [collision] = findAliasCollisions([
      entry('a', 'A', 'Shared'),
      entry('b', 'B', 'Shared'),
      entry('c', 'C', 'Shared'),
    ]);

    expect(collision.skuPartNumbers).toEqual(['A', 'B', 'C']);
  });

  // "not curated" is the normal state of most of the catalog — if null counted
  // as a collision the guard would block every upload on day one.
  it('never treats null / blank / whitespace-only aliases as a collision', () => {
    expect(
      findAliasCollisions([
        entry('a', 'A', null),
        entry('b', 'B', null),
        entry('c', 'C', ''),
        entry('d', 'D', '   '),
      ]),
    ).toEqual([]);
  });

  it('collides on trimmed value — surrounding whitespace is not a difference', () => {
    expect(
      findAliasCollisions([
        entry('a', 'A', 'E3 Bundle'),
        entry('b', 'B', '  E3 Bundle  '),
      ]),
    ).toHaveLength(1);
  });

  // Exact match, mirroring the import mapper (ADR-0004 #2). Case-folding here
  // would block edits that the mapper treats as two distinct aliases.
  it('treats different casing as different aliases', () => {
    expect(
      findAliasCollisions([entry('a', 'A', 'E3'), entry('b', 'B', 'e3')]),
    ).toEqual([]);
  });

  it('reports each colliding alias separately', () => {
    const collisions = findAliasCollisions([
      entry('a', 'A', 'One'),
      entry('b', 'B', 'One'),
      entry('c', 'C', 'Two'),
      entry('d', 'D', 'Two'),
      entry('e', 'E', 'Unique'),
    ]);

    expect(collisions.map((c) => c.alias).sort()).toEqual(['One', 'Two']);
  });
});
