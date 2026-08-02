import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  AllocationResetRequestDto,
  AllocationResetResultDto,
  AllocationResetRowDto,
} from './dto/allocation-reset.dto';

/**
 * Allocation reset (CH-016) — the way back out of a bad allocation import.
 *
 * The import (ADR-0004) is upsert-only: it writes the cells the CSV mentions and
 * leaves every other cell alone. So re-uploading a corrected CSV fixes the cells
 * it covers, and a cell that was in the BAD csv but not the good one keeps its
 * wrong number forever. This service is the only thing that can clear it.
 *
 * 🔴 Two boundaries, both load-bearing, both covered by tests:
 *
 *  1. It writes `allocatedQuantity` and NOTHING else. `assignedQuantity` is the
 *     drift reconciliation baseline (DESIGN §5) AND the running total that
 *     assign increments (assign.service.ts) — it is operational truth, not
 *     import output. ADR-0004's alloc-only invariant is not being changed here;
 *     it is being obeyed.
 *  2. It never DELETES a row. Deleting would take `assignedQuantity` with it —
 *     collapsing the drift baseline to zero while the tenant's consumedUnits
 *     stays put — and would cascade away the LedgerAdjustment audit trail
 *     (ADR-0007, schema `onDelete: Cascade`). Zeroing achieves the same "start
 *     over" without any of that.
 */
@Injectable()
export class AllocationResetService {
  private readonly logger = new Logger(AllocationResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async reset(
    actorId: string,
    dto: AllocationResetRequestDto,
  ): Promise<AllocationResetResultDto> {
    const commit = dto.dryRun === false;

    // Resolve the OpCo filter first: a typo'd code must be a 404, not a silent
    // "matched nothing, reset everything" — that is the worst possible failure
    // mode for this particular endpoint.
    let opcoId: string | undefined;
    let scope = 'all';
    if (dto.opcoCode) {
      const opco = await this.prisma.opco.findUnique({
        where: { code: dto.opcoCode },
        select: { id: true, code: true },
      });
      if (!opco) throw new NotFoundException(`OpCo ${dto.opcoCode} not found`);
      opcoId = opco.id;
      scope = opco.code;
    }

    // `not: 0` mirrors the import's no-op rule: a cell already at zero is not a
    // change, so it must not inflate `affected` either.
    const where = {
      allocatedQuantity: { not: 0 },
      ...(opcoId ? { opcoId } : {}),
    };

    const targets = await this.prisma.opcoSkuLedger.findMany({
      where,
      select: {
        allocatedQuantity: true,
        opco: { select: { code: true } },
        // `active` is here for §2.5, not for filtering: an inactive SKU's cell
        // is still reset, it just cannot be restored by re-importing.
        sku: { select: { skuPartNumber: true, active: true } },
      },
      orderBy: [{ opcoId: 'asc' }, { skuCatalogId: 'asc' }],
    });

    const rows: AllocationResetRowDto[] = targets.map((t) => ({
      opcoCode: t.opco.code,
      skuPartNumber: t.sku.skuPartNumber,
      before: t.allocatedQuantity,
      skuActive: t.sku.active,
    }));
    const irreversible = rows.filter((r) => !r.skuActive).length;

    if (commit && rows.length > 0) {
      await this.prisma.$transaction([
        // The entire write. No delete, and `assignedQuantity` is not even named.
        this.prisma.opcoSkuLedger.updateMany({
          where,
          data: { allocatedQuantity: 0 },
        }),
        // Summary-level audit, one row — same call as the import makes, for the
        // same reason: one reset can touch hundreds of cells (ADR-0009 D8.1
        // keeps it inside the transaction that did the work).
        this.prisma.auditLog.create(
          this.audit.buildLogArgs({
            action: AUDIT_ACTIONS.ALLOCATION_RESET,
            targetType: 'AllocationReset',
            targetId: 'bulk',
            actorId,
            after: { affected: rows.length, scope },
          }),
        ),
      ]);
    }

    this.logger.log(
      `Allocation reset (${commit ? 'commit' : 'dry-run'}, scope ${scope}): ` +
        `${rows.length} cell(s)`,
    );

    return {
      dryRun: !commit,
      affected: rows.length,
      scope,
      rows,
      irreversible,
      warning: buildWarning(irreversible),
    };
  }
}

/**
 * §2.5 — the irreversible sentence is appended, not substituted: the mid-state
 * applies to every reset, while the inactive-SKU caveat applies only sometimes.
 * Composing them here (rather than in the UI) keeps the wording and the
 * `irreversible` count from ever disagreeing.
 */
function buildWarning(irreversible: number): string {
  if (irreversible === 0) return RESET_WARNING;
  const cells = irreversible === 1 ? 'cell' : 'cells';
  return (
    `${RESET_WARNING} ${irreversible} ${cells} belong to an INACTIVE SKU: ` +
    'importing cannot restore those (the import only reads active catalog ' +
    'entries), so their only way back is a per-row correction.'
  );
}

/**
 * Shipped in the response body rather than left to the UI to remember, because
 * the mid-state is real and easy to walk into: between the reset and the next
 * import, every affected OpCo × SKU sits at allocated = 0, and ADR-0016's budget
 * gate refuses an assign with no allocation ("no unlimited by default", D1).
 *
 * The second sentence is here because it is the question everyone asks on seeing
 * a button called Reset next to a ledger.
 */
const RESET_WARNING =
  'Until you re-import, every affected OpCo × SKU sits at allocated = 0 and the OpCo budget gate will block assigns for those combinations (an admin can still override per line). assignedQuantity is not touched, and no ledger rows are deleted.';
