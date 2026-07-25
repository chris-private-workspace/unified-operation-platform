import { Prisma } from '@prisma/client';
import { MatrixOpco, MatrixSku, parseAllocationMatrix } from './matrix-csv';

/**
 * `assignedQuantity` go-live baseline (ADR-0014 / W35 F3).
 *
 * WHY this exists at all: `assignedQuantity` is the ONLY number that reconciles
 * (DESIGN §5), and nothing could set it in bulk — allocation import refuses to
 * touch it by hard invariant (ADR-0004 #5), `assign` only ever +1s, and
 * `PATCH /license/ledger/:id` is one HTTP call per cell. Without a baseline the
 * first `reconcile` drifts on EVERY SKU (tenant consumedUnits vs 0).
 *
 * WHAT it deliberately is NOT: a repeatable self-service path. ADR-0014 chose a
 * one-shot ops script precisely so no permanent API surface is added. If bulk
 * assigned updates are ever needed repeatedly (e.g. batch drift correction),
 * that is a NEW ADR promoting this to a bulk endpoint — **do not grow this file
 * into that**.
 *
 * Mirror invariant: this writes ONLY `assignedQuantity`. `allocatedQuantity` is
 * allocation import's column and is never set here (the reverse of ADR-0004 #5).
 * Locked by test.
 */

/** One planned assignedQuantity change; ids resolved so the writer needs no lookups. */
export interface BaselineChange {
  opcoId: string;
  opcoCode: string;
  skuCatalogId: string;
  skuBusinessAlias: string;
  skuPartNumber: string;
  before: number;
  target: number;
  delta: number;
}

export interface BaselinePlan {
  opcoColumns: number;
  skuRows: number;
  mappedSkuRows: number;
  changes: BaselineChange[];
  skippedSkuLabels: string[];
  unknownOpcoHeaders: string[];
}

/** Existing ledger state the plan diffs against (assigned only — see mirror invariant). */
export interface BaselineLedgerRow {
  opcoId: string;
  skuCatalogId: string;
  assignedQuantity: number;
}

/**
 * Diff a matrix CSV against the current assigned baseline. Pure — no DB, no I/O,
 * so a dry run is exactly the same computation as a commit.
 */
export function planAssignedBaseline(
  csv: string,
  opcos: MatrixOpco[],
  skus: MatrixSku[],
  ledger: BaselineLedgerRow[],
): BaselinePlan {
  const parsed = parseAllocationMatrix(csv, opcos, skus);
  const current = new Map(
    ledger.map((l) => [`${l.opcoId}:${l.skuCatalogId}`, l.assignedQuantity]),
  );

  const changes: BaselineChange[] = [];
  for (const row of parsed.rows) {
    for (const { column, value: target } of row.cells) {
      const before = current.get(`${column.opcoId}:${row.sku.id}`) ?? 0;
      if (target === before) continue; // no-op (incl. 0 === 0) → idempotent
      changes.push({
        opcoId: column.opcoId,
        opcoCode: column.opcoCode,
        skuCatalogId: row.sku.id,
        skuBusinessAlias: row.label,
        skuPartNumber: row.sku.skuPartNumber,
        before,
        target,
        delta: target - before,
      });
    }
  }

  return {
    opcoColumns: parsed.opcoColumns.length,
    skuRows: parsed.skuRowCount,
    mappedSkuRows: parsed.rows.length,
    changes,
    skippedSkuLabels: parsed.skippedSkuLabels,
    unknownOpcoHeaders: parsed.unknownOpcoHeaders,
  };
}

// ── Write side ───────────────────────────────────────────────────
// Structural types, not PrismaClient: they document exactly which tables and
// operations the baseline may touch, so "it cannot write allocatedQuantity" is
// visible in the signature and not just in the body.

export interface BaselineTx {
  opcoSkuLedger: {
    upsert(args: Prisma.OpcoSkuLedgerUpsertArgs): Promise<{ id: string }>;
  };
  ledgerAdjustment: {
    createMany(args: Prisma.LedgerAdjustmentCreateManyArgs): Promise<unknown>;
  };
}

export interface BaselineDb {
  $transaction<T>(fn: (tx: BaselineTx) => Promise<T>): Promise<T>;
}

export interface ApplyOptions {
  /** AppUser id, or null when the operator did not identify one (LedgerAdjustment.actorId is optional). */
  actorId: string | null;
  reason: string;
}

/**
 * Apply the plan. One transaction: every cell upserted, then one
 * `LedgerAdjustment` per changed cell (ADR-0007's audit table — a baseline is
 * semantically a batch of manual corrections). Returns cells written.
 *
 * `create` omits `allocatedQuantity` on purpose → schema default 0, left for
 * allocation import to fill (ADR-0014 Decision 4).
 */
export async function applyAssignedBaseline(
  db: BaselineDb,
  plan: BaselinePlan,
  opts: ApplyOptions,
): Promise<number> {
  if (plan.changes.length === 0) return 0;

  return db.$transaction(async (tx) => {
    const adjustments: Prisma.LedgerAdjustmentCreateManyInput[] = [];
    for (const c of plan.changes) {
      // The row may not exist yet (no import, no assign) → upsert creates it.
      const row = await tx.opcoSkuLedger.upsert({
        where: {
          opcoId_skuCatalogId: {
            opcoId: c.opcoId,
            skuCatalogId: c.skuCatalogId,
          },
        },
        create: {
          opcoId: c.opcoId,
          skuCatalogId: c.skuCatalogId,
          assignedQuantity: c.target,
        },
        update: { assignedQuantity: c.target },
      });
      adjustments.push({
        ledgerId: row.id,
        field: 'assignedQuantity',
        beforeValue: c.before,
        afterValue: c.target,
        reason: opts.reason,
        actorId: opts.actorId,
      });
    }
    await tx.ledgerAdjustment.createMany({ data: adjustments });
    return adjustments.length;
  });
}
