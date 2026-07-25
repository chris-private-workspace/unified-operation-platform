import { parseCsv } from './csv';

/**
 * Shared O365 matrix mapping (ADR-0004 Decision #2, extracted in W35 F3).
 *
 * The matrix shape is one contract with two consumers that write DIFFERENT
 * columns: allocation import writes `allocatedQuantity` (ADR-0004) and the
 * go-live baseline script writes `assignedQuantity` (ADR-0014). Parsing and
 * mapping live here so the two can never drift apart — ADR-0014 explicitly
 * requires reusing this logic rather than restating it.
 *
 * What stays OUT of here: anything about which column is written, what a change
 * looks like, or how it is audited. That is each consumer's own semantics.
 */

/** A parsed OpCo header column: which CSV index it sits at and the Opco it maps to. */
export interface OpcoColumn {
  index: number;
  opcoId: string;
  opcoCode: string;
}

/** Minimum shape the mapper needs from an Opco row. */
export interface MatrixOpco {
  id: string;
  code: string;
}

/** Minimum shape the mapper needs from a SkuCatalog row. */
export interface MatrixSku {
  id: string;
  skuPartNumber: string;
  businessAlias: string | null;
}

/** One mapped SKU row: its label, the catalog entry it resolved to, and its cells. */
export interface MatrixRow<S extends MatrixSku> {
  label: string;
  sku: S;
  cells: { column: OpcoColumn; value: number }[];
}

export interface ParsedMatrix<S extends MatrixSku> {
  opcoColumns: OpcoColumn[];
  /** Header columns matching no Opco.code (excl. blanks / "Grand Total"). */
  unknownOpcoHeaders: string[];
  /** Only rows whose col-A label matched a curated businessAlias. */
  rows: MatrixRow<S>[];
  /** Labels with no businessAlias match — the curation-as-scope gate. */
  skippedSkuLabels: string[];
  /** Non-blank col-A rows seen (mapped + skipped). */
  skuRowCount: number;
  /** businessAlias → catalog entry, exposed so callers can resolve ids later. */
  skuByAlias: Map<string, S>;
}

/**
 * Parse the wide matrix: row 1 = OpCo headers (exact `Opco.code`, "Grand Total"
 * ignored), column A = SKU label (exact `SkuCatalog.businessAlias`), cells =
 * non-negative integer seat counts. Exact matching only — no fuzzy fallback
 * (DESIGN §5: never trust the Excel names, trust the curated alias).
 */
export function parseAllocationMatrix<S extends MatrixSku>(
  csv: string,
  opcos: MatrixOpco[],
  skus: S[],
): ParsedMatrix<S> {
  const rows = parseCsv(csv);
  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);

  // ── OpCo header columns → Opco.code (exact; DESIGN — seed built from this
  // Excel, so header === code). "Grand Total" and unmatched → reported. ──
  const opcoByCode = new Map(opcos.map((o) => [o.code, o]));
  const opcoColumns: OpcoColumn[] = [];
  const unknownOpcoHeaders: string[] = [];
  for (let i = 1; i < header.length; i++) {
    const label = (header[i] ?? '').trim();
    if (label === '' || label.toLowerCase() === 'grand total') continue;
    const opco = opcoByCode.get(label);
    if (opco) opcoColumns.push({ index: i, opcoId: opco.id, opcoCode: label });
    else unknownOpcoHeaders.push(label);
  }

  // ── SKU rows map to a catalog entry via businessAlias (curation-as-scope). ──
  const skuByAlias = new Map<string, S>();
  for (const sku of skus) {
    const alias = (sku.businessAlias ?? '').trim();
    if (alias) skuByAlias.set(alias, sku);
  }

  const mapped: MatrixRow<S>[] = [];
  const skippedSkuLabels: string[] = [];
  let skuRowCount = 0;

  for (const row of dataRows) {
    const label = (row[0] ?? '').trim();
    if (label === '') continue; // blank spacer row
    skuRowCount++;
    const sku = skuByAlias.get(label);
    if (!sku) {
      skippedSkuLabels.push(label);
      continue;
    }
    mapped.push({
      label,
      sku,
      cells: opcoColumns.map((column) => ({
        column,
        value: toQuantity(row[column.index]),
      })),
    });
  }

  return {
    opcoColumns,
    unknownOpcoHeaders,
    rows: mapped,
    skippedSkuLabels,
    skuRowCount,
    skuByAlias,
  };
}

/** Parse a matrix cell → a non-negative integer seat count (blank / junk → 0). */
export function toQuantity(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}
