import { BadRequestException } from '@nestjs/common';
import { parseCsv } from './csv';
import { SEAT_MODELS, isSeatModel } from './seat-model';

/**
 * SKU catalog curation CSV (CH-019 / ADR-0023). Parses the CH-018 export back
 * in so "download → edit → upload" round-trips.
 *
 * Header labels match the export byte-for-byte (catalog-export.ts:20-29) —
 * that file IS the template, so anything else would break the round trip.
 *
 * Columns are matched by NAME, never by position: spreadsheet users reorder and
 * hide columns, and a positional read would silently write Category into alias.
 */
export const SKU_ID_COLUMN = 'SkuId';
export const ALIAS_COLUMN = 'Business alias';
export const CATEGORY_COLUMN = 'Category';
export const BASE_COLUMN = 'Base licence';
export const SEAT_MODEL_COLUMN = 'Seat model';

/** The only writable columns — identical to the PATCH surface (ADR-0023 D3). */
export const EDITABLE_COLUMNS = [
  ALIAS_COLUMN,
  CATEGORY_COLUMN,
  BASE_COLUMN,
  SEAT_MODEL_COLUMN,
] as const;

/**
 * One parsed row. An absent property means "column not in the file" → leave the
 * field alone; `null` means the cell was blank → clear it (same semantics as
 * PATCH's `""`, catalog.service.ts `normalizeOptional`).
 */
export interface CatalogCsvRow {
  skuId: string;
  businessAlias?: string | null;
  category?: string | null;
  isBaseLicense?: boolean;
  /** ADR-0032 D1 — never null: the column has a default and blank means "leave it". */
  seatModel?: string;
}

export interface ParsedCatalogCsv {
  rows: CatalogCsvRow[];
  /** Recognised-but-unwritable headers (Display name / Part number / …). */
  unknownColumns: string[];
}

const TRUE_VALUES = new Set(['yes', 'true', '1']);
const FALSE_VALUES = new Set(['no', 'false', '0']);

/**
 * Trim a curation string; empty / whitespace-only → null (clears the field).
 * Lives here rather than in the service so both write paths — PATCH's `""` and
 * a blank CSV cell — share ONE implementation of "this field is now cleared".
 */
export function normalizeOptional(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function parseCatalogCsv(csv: string): ParsedCatalogCsv {
  const table = parseCsv(csv);
  const header = table[0];
  if (!header) {
    throw new BadRequestException({
      code: 'empty-csv',
      message: 'That file is empty.',
    });
  }

  const columnAt = new Map<string, number>();
  const unknownColumns: string[] = [];
  const duplicateColumns: string[] = [];
  const known = new Set<string>([SKU_ID_COLUMN, ...EDITABLE_COLUMNS]);

  header.forEach((raw, i) => {
    const name = raw.trim();
    if (name === '') return;
    if (!known.has(name)) {
      unknownColumns.push(name);
      return;
    }
    // A repeated writable column carries contradictory intent — same reasoning
    // as a repeated SkuId below. Taking the first silently could write the
    // wrong cell into a field that decides import scope.
    if (columnAt.has(name)) duplicateColumns.push(name);
    else columnAt.set(name, i);
  });

  const foundColumns = header.map((h) => h.trim()).filter(Boolean);

  if (duplicateColumns.length > 0) {
    throw new BadRequestException({
      code: 'duplicate-column',
      message: `The file repeats a column: ${duplicateColumns.join(', ')}. Keep one of each.`,
      duplicateColumns,
    });
  }

  const skuIdAt = columnAt.get(SKU_ID_COLUMN);
  if (skuIdAt === undefined) {
    throw new BadRequestException({
      code: 'missing-sku-id-column',
      message: `The file needs a "${SKU_ID_COLUMN}" column — it is the only key SKUs are matched on.`,
      foundColumns,
    });
  }

  if (!EDITABLE_COLUMNS.some((c) => columnAt.has(c))) {
    throw new BadRequestException({
      code: 'no-editable-column',
      message: `Nothing to import. Include at least one of: ${EDITABLE_COLUMNS.join(', ')}.`,
      foundColumns,
    });
  }

  const aliasAt = columnAt.get(ALIAS_COLUMN);
  const categoryAt = columnAt.get(CATEGORY_COLUMN);
  const baseAt = columnAt.get(BASE_COLUMN);
  const seatModelAt = columnAt.get(SEAT_MODEL_COLUMN);

  const rows: CatalogCsvRow[] = [];
  const seenSkuIds = new Set<string>();
  const duplicateSkuIds: string[] = [];
  const invalidBaseValues: { line: number; value: string }[] = [];
  const invalidSeatModelValues: { line: number; value: string }[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const skuId = (cells[skuIdAt] ?? '').trim();
    if (skuId === '') continue; // blank spacer row (matrix-csv.ts:79 precedent)

    // GUIDs are case-insensitive identifiers; the same SKU written two ways is
    // still the same SKU, and the second row would silently win.
    const key = skuId.toLowerCase();
    if (seenSkuIds.has(key)) {
      duplicateSkuIds.push(skuId);
      continue;
    }
    seenSkuIds.add(key);

    const row: CatalogCsvRow = { skuId };
    if (aliasAt !== undefined) {
      row.businessAlias = normalizeOptional(cells[aliasAt]);
    }
    if (categoryAt !== undefined) {
      row.category = normalizeOptional(cells[categoryAt]);
    }
    if (baseAt !== undefined) {
      const raw = (cells[baseAt] ?? '').trim();
      // Blank means "leave it" — isBaseLicense is not nullable, so a blank cell
      // cannot be read as `false` without inventing an edit nobody asked for.
      if (raw !== '') {
        const value = raw.toLowerCase();
        if (TRUE_VALUES.has(value)) row.isBaseLicense = true;
        else if (FALSE_VALUES.has(value)) row.isBaseLicense = false;
        else invalidBaseValues.push({ line: r + 1, value: raw });
      }
    }
    if (seatModelAt !== undefined) {
      const raw = (cells[seatModelAt] ?? '').trim();
      // Blank leaves it, same as Base licence — seatModel is not nullable, so a
      // blank cell cannot be read as 'prepaid' without inventing an edit. That
      // matters more here than on Base: silently writing 'prepaid' would turn
      // the tenant seat gate back on for a SKU somebody had marked unlimited.
      if (raw !== '') {
        const value = raw.toLowerCase();
        if (isSeatModel(value)) row.seatModel = value;
        else invalidSeatModelValues.push({ line: r + 1, value: raw });
      }
    }
    rows.push(row);
  }

  if (duplicateSkuIds.length > 0) {
    throw new BadRequestException({
      code: 'duplicate-sku-id',
      message: `The file lists the same SKU more than once (${duplicateSkuIds.length}). Keep one row per SKU.`,
      duplicateSkuIds,
    });
  }

  if (invalidBaseValues.length > 0) {
    throw new BadRequestException({
      code: 'invalid-base-value',
      message: `"${BASE_COLUMN}" must be Yes or No (blank leaves it unchanged).`,
      invalidBaseValues,
    });
  }

  if (invalidSeatModelValues.length > 0) {
    throw new BadRequestException({
      code: 'invalid-seat-model-value',
      message: `"${SEAT_MODEL_COLUMN}" must be ${SEAT_MODELS.join(' or ')} (blank leaves it unchanged).`,
      invalidSeatModelValues,
    });
  }

  return { rows, unknownColumns };
}
