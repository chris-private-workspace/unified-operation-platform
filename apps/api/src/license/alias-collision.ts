/**
 * businessAlias collision guard (CH-019 / ADR-0023 D5).
 *
 * `SkuCatalog.businessAlias` has no unique constraint (schema.prisma:124), and
 * the two things that read it disagree about what a duplicate means:
 *
 *   - the FE allocation template keeps the FIRST (allocation-template.ts:63-67)
 *   - the import mapper keeps the LAST — `skuByAlias.set()` over a `findMany`
 *     with no `orderBy`, so which one wins is not even deterministic
 *     (matrix-csv.ts:86-90)
 *
 * A duplicate therefore routes a row of allocation seats to an arbitrary SKU,
 * with no error and nothing in the audit trail to tell you it happened. Both
 * write paths run this before committing — the bulk import AND the single-entry
 * PATCH (ADR-0023 OQ-1). Guarding only the bulk path would leave the back door
 * open: one single edit could create the very collision that then blocks every
 * later import.
 *
 * Comparison is exact after trim, matching the import's own exact-match rule
 * (ADR-0004 #2). "E3" and "e3" are different aliases to the mapper, so they are
 * different aliases here too — pretending otherwise would block edits that work.
 */

/** The minimum shape needed to detect a collision. */
export interface AliasEntry {
  id: string;
  skuPartNumber: string;
  businessAlias: string | null;
}

export interface AliasCollision {
  alias: string;
  /** Every SKU that would end up carrying this alias (≥ 2 by definition). */
  skuPartNumbers: string[];
}

/**
 * Find aliases shared by more than one entry. Callers pass the RESULTING state
 * (current catalog with their pending edits already applied), not the edits —
 * a new alias can collide with a SKU the caller never touched.
 *
 * Null / blank aliases are never collisions: they mean "not curated", and the
 * import skips them entirely.
 */
export function findAliasCollisions(entries: AliasEntry[]): AliasCollision[] {
  const byAlias = new Map<string, string[]>();

  for (const entry of entries) {
    const alias = (entry.businessAlias ?? '').trim();
    if (!alias) continue;
    const holders = byAlias.get(alias);
    if (holders) holders.push(entry.skuPartNumber);
    else byAlias.set(alias, [entry.skuPartNumber]);
  }

  const collisions: AliasCollision[] = [];
  for (const [alias, skuPartNumbers] of byAlias) {
    if (skuPartNumbers.length > 1) collisions.push({ alias, skuPartNumbers });
  }
  return collisions;
}
