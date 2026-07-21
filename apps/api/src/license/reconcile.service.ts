import { Injectable, Logger } from '@nestjs/common';
import { DriftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { graphUnavailable } from '../integration/graph/graph-unavailable';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

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
    private readonly audit: AuditService,
  ) {}

  /**
   * @param actorId  the operator who triggered this run, or null for the
   *   scheduled sweep. Resolving a drift alert is decided by the code (delta
   *   reached 0), but WHO set that run going is a different question — and one
   *   an auditor will ask (Chris, 2026-07-21). null ⇒ actorType 'system'.
   */
  async reconcile(actorId: string | null = null): Promise<ReconcileResult> {
    // OD2: reconcile against fresh tenant totals, not a stored snapshot.
    // BE-graph-harden: a raw Graph error must not crash the process (BUG-002);
    // fail closed with a clean 503 before any drift alert is written.
    let live;
    try {
      live = await this.graph.getSubscribedSkus();
    } catch (err) {
      throw graphUnavailable(
        this.logger,
        'read the tenant license inventory',
        err,
      );
    }
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
        await this.prisma.$transaction(async (tx) => {
          const resolvedAlert = await tx.driftAlert.update({
            where: { id: openAlert.id },
            data: { status: DriftStatus.RESOLVED, resolvedAt: new Date() },
          });
          await this.audit.log(tx, {
            action: AUDIT_ACTIONS.DRIFT_RESOLVE,
            targetType: 'DriftAlert',
            targetId: openAlert.id,
            actorId,
            // A scheduled sweep has no person behind it.
            actorType: actorId ? 'user' : 'system',
            before: openAlert,
            after: resolvedAlert,
            metadata: { source: actorId ? 'manual-reconcile' : 'scheduled' },
          });
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
