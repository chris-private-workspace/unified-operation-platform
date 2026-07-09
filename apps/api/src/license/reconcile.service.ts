import { Injectable, Logger } from '@nestjs/common';
import { DriftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';

/** Outcome of a reconciliation run — surfaced to the trigger endpoint. */
export interface ReconcileResult {
  checked: number;
  opened: number;
  updated: number;
  resolved: number;
  drift: number; // OPEN drift alerts remaining after this run
}

/**
 * Module C — Option 甲 reconciliation, SKU TOTAL level only (DESIGN §5).
 *
 * For each active SKU:
 *   delta = tenant consumedUnits (LIVE, OD2) - sum(assignedQuantity across OpCos)
 * delta != 0 opens (or refreshes) an OPEN DriftAlert; delta == 0 resolves one.
 *
 * Only assignedQuantity reconciles — allocatedQuantity (OpCo budget) is display
 * only. WHICH OpCo the delta belongs to is deferred by design (DESIGN §10).
 */
@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
  ) {}

  async reconcile(): Promise<ReconcileResult> {
    // OD2: reconcile against fresh tenant totals, not a stored snapshot.
    const live = await this.graph.getSubscribedSkus();
    const consumedBySkuId = new Map(
      live.map((s) => [s.skuId, s.consumedUnits]),
    );

    const catalog = await this.prisma.skuCatalog.findMany({
      where: { active: true },
    });

    let opened = 0;
    let updated = 0;
    let resolved = 0;

    for (const sku of catalog) {
      const tenantConsumed = consumedBySkuId.get(sku.skuId) ?? 0;
      const agg = await this.prisma.opcoSkuLedger.aggregate({
        where: { skuCatalogId: sku.id },
        _sum: { assignedQuantity: true },
      });
      const ledgerAssignedSum = agg._sum.assignedQuantity ?? 0;
      const delta = tenantConsumed - ledgerAssignedSum;

      const openAlert = await this.prisma.driftAlert.findFirst({
        where: { skuCatalogId: sku.id, status: DriftStatus.OPEN },
      });

      if (delta !== 0) {
        if (openAlert) {
          // Refresh the numbers; keep detectedAt = first detection.
          await this.prisma.driftAlert.update({
            where: { id: openAlert.id },
            data: { ledgerAssignedSum, tenantConsumed, delta },
          });
          updated++;
        } else {
          await this.prisma.driftAlert.create({
            data: {
              skuCatalogId: sku.id,
              ledgerAssignedSum,
              tenantConsumed,
              delta,
            },
          });
          opened++;
        }
      } else if (openAlert) {
        await this.prisma.driftAlert.update({
          where: { id: openAlert.id },
          data: { status: DriftStatus.RESOLVED, resolvedAt: new Date() },
        });
        resolved++;
      }
    }

    const drift = await this.prisma.driftAlert.count({
      where: { status: DriftStatus.OPEN },
    });
    this.logger.log(
      `Reconcile: checked ${catalog.length}, opened ${opened}, updated ${updated}, resolved ${resolved}, open drift ${drift}`,
    );
    return { checked: catalog.length, opened, updated, resolved, drift };
  }

  /** OPEN drift alerts (with SKU reference) for the read endpoint. */
  async listDrift() {
    return this.prisma.driftAlert.findMany({
      where: { status: DriftStatus.OPEN },
      orderBy: { detectedAt: 'desc' },
      include: {
        sku: {
          select: { skuId: true, skuPartNumber: true, displayName: true },
        },
      },
    });
  }
}
