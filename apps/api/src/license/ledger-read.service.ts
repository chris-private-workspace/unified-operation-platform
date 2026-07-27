import { Injectable } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopeWhere } from '../auth/opco-scope';
import { LedgerRowDto, LedgerStatsDto } from './dto/ledger-read.dto';

/**
 * BE-ledger-read (W14) — read-model over OpcoSkuLedger for the License Assets
 * view + Overview seat KPIs. Read-only; opco-scoped via AUTH-3a scopeWhere
 * (OPCO_IT sees only its OpCo; ADMIN / REGIONAL see all). Only active SKUs /
 * OpCos are surfaced (OD2). headroom / overAllocated are derived here; the
 * ledger's two numbers themselves are never written by this service.
 */
@Injectable()
export class LedgerReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scope + active-only filter shared by both reads. CH-008: a 0/0 row carries
   * no information — the row itself is kept (never hard-deleted; LedgerAdjustment
   * cascades) but is excluded by default. The exclusion lives INSIDE this shared
   * where() on purpose: an extra query would be a second place scopeWhere could
   * be forgotten (CH-008 R4). `allocated > 0, assigned = 0` is NOT empty — that
   * means "budget set, nobody assigned yet", which is real information (D1).
   */
  private where(actor: AppUser, includeEmpty: boolean) {
    return {
      ...scopeWhere(actor),
      sku: { active: true },
      opco: { active: true },
      ...(includeEmpty
        ? {}
        : { NOT: { allocatedQuantity: 0, assignedQuantity: 0 } }),
    };
  }

  async listLedger(
    actor: AppUser,
    includeEmpty = false,
  ): Promise<LedgerRowDto[]> {
    const rows = await this.prisma.opcoSkuLedger.findMany({
      where: this.where(actor, includeEmpty),
      include: {
        opco: { select: { code: true, displayName: true } },
        sku: {
          select: {
            skuId: true,
            skuPartNumber: true,
            displayName: true,
            category: true,
          },
        },
      },
      orderBy: [{ opco: { code: 'asc' } }, { sku: { skuPartNumber: 'asc' } }],
    });

    return rows.map((r) => ({
      id: r.id,
      opcoId: r.opcoId,
      skuCatalogId: r.skuCatalogId,
      allocatedQuantity: r.allocatedQuantity,
      assignedQuantity: r.assignedQuantity,
      headroom: r.allocatedQuantity - r.assignedQuantity,
      overAllocated: r.assignedQuantity > r.allocatedQuantity,
      opco: r.opco,
      sku: r.sku,
    }));
  }

  async ledgerStats(
    actor: AppUser,
    includeEmpty = false,
  ): Promise<LedgerStatsDto> {
    const rows = await this.prisma.opcoSkuLedger.findMany({
      where: this.where(actor, includeEmpty),
      select: {
        opcoId: true,
        skuCatalogId: true,
        allocatedQuantity: true,
        assignedQuantity: true,
      },
    });

    const totalAllocated = rows.reduce((s, r) => s + r.allocatedQuantity, 0);
    const totalAssigned = rows.reduce((s, r) => s + r.assignedQuantity, 0);
    return {
      totalAllocated,
      totalAssigned,
      totalHeadroom: totalAllocated - totalAssigned,
      skusTracked: new Set(rows.map((r) => r.skuCatalogId)).size,
      opcosTracked: new Set(rows.map((r) => r.opcoId)).size,
      overAllocatedCount: rows.filter(
        (r) => r.assignedQuantity > r.allocatedQuantity,
      ).length,
    };
  }
}
