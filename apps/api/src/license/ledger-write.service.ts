import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOpcoScope } from '../auth/opco-scope';
import { UpdateLedgerDto } from './dto/ledger-write.dto';
import { LedgerRowDto } from './dto/ledger-read.dto';

// Same include as GET /license/ledger so the returned row matches exactly.
const ROW_INCLUDE = {
  opco: { select: { code: true, displayName: true } },
  sku: {
    select: {
      skuId: true,
      skuPartNumber: true,
      displayName: true,
      category: true,
    },
  },
} satisfies Prisma.OpcoSkuLedgerInclude;

type LedgerRowWithRefs = Prisma.OpcoSkuLedgerGetPayload<{
  include: typeof ROW_INCLUDE;
}>;

/**
 * Ledger manual write (ADR-0007 / W23-A) — the ONLY per-row hand-edit path for
 * OpcoSkuLedger (import writes allocatedQuantity in bulk; assign +1s
 * assignedQuantity). Sets absolute values, scope-gated (OPCO_IT → own OpCo only,
 * fail-closed 403 via assertOpcoScope), and records one LedgerAdjustment per
 * changed field in the same transaction. over-allocation is surfaced as a flag,
 * never blocked (ADR-0007 §6); the DTO's @Min(0) is the only write invariant.
 */
@Injectable()
export class LedgerWriteService {
  private readonly logger = new Logger(LedgerWriteService.name);

  constructor(private readonly prisma: PrismaService) {}

  async updateLedgerRow(
    actor: AppUser,
    id: string,
    dto: UpdateLedgerDto,
  ): Promise<LedgerRowDto> {
    if (
      dto.allocatedQuantity === undefined &&
      dto.assignedQuantity === undefined
    ) {
      throw new BadRequestException(
        'Provide allocatedQuantity and/or assignedQuantity',
      );
    }

    const row = await this.prisma.opcoSkuLedger.findUnique({
      where: { id },
      include: ROW_INCLUDE,
    });
    if (!row) throw new NotFoundException('Ledger row not found');

    // AUTH-3a: a scoped OPCO_IT operator may only touch its own OpCo (fail-closed).
    assertOpcoScope(actor, row.opcoId);

    // Diff only the supplied fields → one LedgerAdjustment per real change.
    const data: Prisma.OpcoSkuLedgerUpdateInput = {};
    const adjustments: Prisma.LedgerAdjustmentCreateManyInput[] = [];
    const track = (
      field: 'allocatedQuantity' | 'assignedQuantity',
      next: number | undefined,
      before: number,
    ) => {
      if (next === undefined || next === before) return;
      data[field] = next;
      adjustments.push({
        ledgerId: id,
        field,
        beforeValue: before,
        afterValue: next,
        reason: dto.reason ?? null,
        actorId: actor.id,
      });
    };
    track('allocatedQuantity', dto.allocatedQuantity, row.allocatedQuantity);
    track('assignedQuantity', dto.assignedQuantity, row.assignedQuantity);

    // No real change (supplied values equal current) → no write, no audit.
    if (adjustments.length === 0) return this.toDto(row);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.opcoSkuLedger.update({
        where: { id },
        data,
        include: ROW_INCLUDE,
      });
      await tx.ledgerAdjustment.createMany({ data: adjustments });
      return u;
    });

    // H4: log the outcome only (ids + deltas), never PII.
    this.logger.log(
      `Ledger ${id} adjusted by ${actor.id}: ` +
        adjustments
          .map((a) => `${a.field} ${a.beforeValue}→${a.afterValue}`)
          .join(', '),
    );
    return this.toDto(updated);
  }

  /** Map to the same shape as GET /license/ledger (derived headroom / overAllocated). */
  private toDto(r: LedgerRowWithRefs): LedgerRowDto {
    return {
      id: r.id,
      opcoId: r.opcoId,
      skuCatalogId: r.skuCatalogId,
      allocatedQuantity: r.allocatedQuantity,
      assignedQuantity: r.assignedQuantity,
      headroom: r.allocatedQuantity - r.assignedQuantity,
      overAllocated: r.assignedQuantity > r.allocatedQuantity,
      opco: r.opco,
      sku: r.sku,
    };
  }
}
