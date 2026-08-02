import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  LedgerFullResetRequestDto,
  LedgerFullResetResultDto,
  LedgerFullResetRowDto,
} from './dto/ledger-full-reset.dto';

/**
 * Ledger full reset (CH-017 / ADR-0022) — start the ledger over.
 *
 * CH-016 exists because a bad allocation import cannot be undone by importing
 * again. This exists because CH-016 was not enough: `ledger-read.service.ts`
 * only hides a row once BOTH numbers are zero, so a ledger carrying an assigned
 * baseline still shows every row after an allocation reset. Zeroing both is what
 * "clear it and re-import the real data" actually requires.
 *
 * 🔴 Three boundaries, all covered by tests:
 *
 *  1. It never DELETES a row. Not caution — deleting buys nothing (the read
 *     model already hides 0/0 rows) and costs the LedgerAdjustment trail via
 *     `onDelete: Cascade` (ADR-0007). ADR-0022 D1.
 *  2. It is a SEPARATE service from AllocationResetService, which is not
 *     touched. That service's invariant — `assignedQuantity` must not appear in
 *     its write path, locked by test — stays true precisely because this column
 *     got its own home instead of a flag on that one. ADR-0022 D2.
 *  3. Every zeroed `assignedQuantity` gets a LedgerAdjustment row; zeroed
 *     `allocatedQuantity` does not. The asymmetry is `schema.prisma`'s existing
 *     split (import/assign keep their own audit, per-cell manual edits land in
 *     LedgerAdjustment), and ADR-0014's baseline set the precedent that a bulk
 *     assigned write is a batch of manual corrections. ADR-0022 D4.
 */
@Injectable()
export class LedgerFullResetService {
  private readonly logger = new Logger(LedgerFullResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `actorId` is nullable because ADR-0022 D5 gives this the same two callers
   * ADR-0014's baseline has: an HTTP request (always attributed) and a
   * deploy-time ops script (no logged-in user). Both audit targets —
   * LedgerAdjustment.actorId and AuditLog.actorId — are nullable already.
   */
  async reset(
    actorId: string | null,
    dto: LedgerFullResetRequestDto,
  ): Promise<LedgerFullResetResultDto> {
    const commit = dto.dryRun === false;

    // Resolve the OpCo filter before anything else: a typo'd code must be a 404,
    // never a silent "matched nothing, so reset everything".
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

    // Checked after the 404 (an unknown scope has no correct confirmation) and
    // only on commit — a preview that demanded the phrase would train people to
    // type it before they have seen what it covers.
    if (commit) {
      const expected = dto.opcoCode ?? 'ALL';
      if (dto.confirm !== expected) {
        throw new BadRequestException(
          `Confirmation required: set "confirm" to "${expected}" to reset this scope.`,
        );
      }
    }

    // A cell already at 0/0 is not a change, so it must not inflate `affected`
    // either — same no-op rule as the import and CH-016.
    const where: Prisma.OpcoSkuLedgerWhereInput = {
      OR: [{ allocatedQuantity: { not: 0 } }, { assignedQuantity: { not: 0 } }],
      ...(opcoId ? { opcoId } : {}),
    };

    if (!commit) {
      const targets = await this.prisma.opcoSkuLedger.findMany({
        where,
        select: TARGET_SELECT,
        orderBy: TARGET_ORDER,
      });
      return this.buildResult(targets, scope, true);
    }

    return this.prisma.$transaction(async (tx) => {
      // Read inside the transaction so the `beforeValue` written to
      // LedgerAdjustment is the value this statement actually overwrote, not one
      // sampled earlier. The audit trail is the whole point of D4; a stale
      // before-value would quietly make it wrong.
      const targets = await tx.opcoSkuLedger.findMany({
        where,
        select: TARGET_SELECT,
        orderBy: TARGET_ORDER,
      });

      if (targets.length > 0) {
        // The entire write. Two columns, no delete.
        await tx.opcoSkuLedger.updateMany({
          where,
          data: { allocatedQuantity: 0, assignedQuantity: 0 },
        });

        const adjustments = targets
          .filter((t) => t.assignedQuantity > 0)
          .map((t) => ({
            ledgerId: t.id,
            field: 'assignedQuantity',
            beforeValue: t.assignedQuantity,
            afterValue: 0,
            reason: `Ledger full reset (CH-017), scope ${scope}`,
            actorId,
          }));
        if (adjustments.length > 0) {
          await tx.ledgerAdjustment.createMany({ data: adjustments });
        }

        // Summary-level audit, one row — same call and same reason as the
        // import: one reset can touch hundreds of cells, and ADR-0009 D8.1 wants
        // it inside the transaction that did the work.
        await tx.auditLog.create(
          this.audit.buildLogArgs({
            action: AUDIT_ACTIONS.LEDGER_FULL_RESET,
            targetType: 'LedgerFullReset',
            targetId: 'bulk',
            actorId,
            after: {
              affected: targets.length,
              scope,
              allocatedCells: targets.filter((t) => t.allocatedQuantity > 0)
                .length,
              assignedCells: adjustments.length,
            },
          }),
        );
      }

      return this.buildResult(targets, scope, false);
    });
  }

  private buildResult(
    targets: TargetRow[],
    scope: string,
    dryRun: boolean,
  ): LedgerFullResetResultDto {
    const rows: LedgerFullResetRowDto[] = targets.map((t) => ({
      opcoCode: t.opco.code,
      skuPartNumber: t.sku.skuPartNumber,
      allocatedBefore: t.allocatedQuantity,
      assignedBefore: t.assignedQuantity,
      skuActive: t.sku.active,
    }));

    const allocatedCells = rows.filter((r) => r.allocatedBefore > 0).length;
    const assignedCells = rows.filter((r) => r.assignedBefore > 0).length;
    const irreversibleAllocated = rows.filter(
      (r) => r.allocatedBefore > 0 && !r.skuActive,
    ).length;

    this.logger.log(
      `Ledger full reset (${dryRun ? 'dry-run' : 'commit'}, scope ${scope}): ` +
        `${rows.length} cell(s), ${allocatedCells} allocated, ${assignedCells} assigned`,
    );

    return {
      dryRun,
      affected: rows.length,
      scope,
      allocatedCells,
      assignedCells,
      irreversibleAllocated,
      rows,
      warning: buildWarning(assignedCells, irreversibleAllocated),
    };
  }
}

const TARGET_SELECT = {
  id: true,
  allocatedQuantity: true,
  assignedQuantity: true,
  opco: { select: { code: true } },
  // `active` is read for reporting, never for filtering: an inactive SKU's cell
  // is still reset — clearing leftovers from a retired SKU is one of the reasons
  // this operation exists.
  sku: { select: { skuPartNumber: true, active: true } },
} satisfies Prisma.OpcoSkuLedgerSelect;

const TARGET_ORDER = [
  { opcoId: 'asc' },
  { skuCatalogId: 'asc' },
] satisfies Prisma.OpcoSkuLedgerOrderByWithRelationInput[];

type TargetRow = Prisma.OpcoSkuLedgerGetPayload<{
  select: typeof TARGET_SELECT;
}>;

/**
 * ADR-0022 D7 — the two consequences are appended separately because they are
 * not the same kind of problem, and collapsing them into one reassuring
 * sentence ("just import again") would be false about the assigned half.
 *
 * Composed here rather than in the UI so the wording and the counts can never
 * disagree.
 */
function buildWarning(
  assignedCells: number,
  irreversibleAllocated: number,
): string {
  const parts = [MID_STATE_WARNING];

  if (assignedCells > 0) {
    const cells = assignedCells === 1 ? 'cell' : 'cells';
    parts.push(
      `${assignedCells} ${cells} lose their assigned baseline, and NO import can ` +
        'put it back — the allocation import never writes assignedQuantity. ' +
        'Until it is reloaded (the assigned-baseline script, or a per-row ' +
        'correction), drift reconciliation has no baseline to compare against.',
    );
  }

  if (irreversibleAllocated > 0) {
    const cells = irreversibleAllocated === 1 ? 'cell' : 'cells';
    parts.push(
      `${irreversibleAllocated} ${cells} belong to an INACTIVE SKU, so even the ` +
        'allocation cannot be re-imported (the import only reads active catalog ' +
        'entries) — those need a per-row correction.',
    );
  }

  return parts.join(' ');
}

/**
 * Shipped in the response rather than left to the UI to remember: the mid-state
 * is real and easy to walk into. Between the reset and the next import, every
 * affected OpCo × SKU sits at allocated = 0, and ADR-0016's budget gate refuses
 * an assign with no allocation ("no unlimited by default", D1).
 */
const MID_STATE_WARNING =
  'Until you re-import, every affected OpCo × SKU sits at allocated = 0 and the OpCo budget gate will block assigns for those combinations (an admin can still override per line). No ledger rows are deleted.';
