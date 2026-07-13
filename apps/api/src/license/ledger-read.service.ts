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

  /** Scope + active-only filter shared by both reads. */
  private where(actor: AppUser) {
    return {
      ...scopeWhere(actor),
      sku: { active: true },
      opco: { active: true },
    };
  }

  async listLedger(actor: AppUser): Promise<LedgerRowDto[]> {
    const rows = await this.prisma.opcoSkuLedger.findMany({
      where: this.where(actor),
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

  async ledgerStats(actor: AppUser): Promise<LedgerStatsDto> {
    const rows = await this.prisma.opcoSkuLedger.findMany({
      where: this.where(actor),
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
