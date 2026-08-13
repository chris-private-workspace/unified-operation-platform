import { Injectable, Logger } from '@nestjs/common';
import { type DriftAlert, DriftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { graphUnavailable } from '../integration/graph/graph-unavailable';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { SEAT_MODEL } from './seat-model';

/** Outcome of a reconciliation run — surfaced to the trigger endpoint. */
export interface ReconcileResult {
  checked: number;
  opened: number;
  updated: number;
  resolved: number;
  /**
   * CH-029 / ADR-0034 D4 — how many active SKUs were left out because they have
   * no seat concept. Reported rather than silent: without it, "checked 101"
   * would claim a scope the run no longer has, and there would be no way to see
   * from the endpoint that D4 is in force at all. On the live tenant this is 22.
   */
  skippedUnlimited: number;
  drift: number; // OPEN drift alerts remaining after this run
}

/**
 * Module C — Option 甲 reconciliation, SKU TOTAL level only (DESIGN §5).
 *
 * For each active PREPAID SKU:
 *   delta = tenant consumedUnits (LIVE, OD2) - sum(assignedQuantity across OpCos)
 * delta != 0 opens (or refreshes) an OPEN DriftAlert; delta == 0 resolves one.
 *
 * CH-029 / ADR-0034 D4 — `seatModel = unlimited` takes no part: no seat account
 * means no seat account to disagree, and any OPEN alert one already has is
 * resolved on sight. ADR-0015's semantics are untouched; its scope narrowed.
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
    let skippedUnlimited = 0;

    for (const sku of catalog) {
      // Hoisted above the unlimited branch because BOTH paths need it: one to
      // refresh or resolve on the delta, the other to clear an alert that
      // should not exist at all.
      const openAlert = await this.prisma.driftAlert.findFirst({
        where: { skuCatalogId: sku.id, status: DriftStatus.OPEN },
      });

      /**
       * CH-029 / ADR-0034 D4 — an unlimited SKU has no seat account, so it
       * cannot have a seat account that disagrees.
       *
       * 🔴 ADR-0015's drift semantics are NOT changed here — its SCOPE is.
       * Drift asks "do the seat books balance"; ADR-0032 established that these
       * SKUs have no books. On the live tenant the difference is 16 of 72 open
       * alerts (22%), led by FLOW_FREE at 4,524 — a number that corresponds to
       * nothing anyone can act on.
       *
       * 🔴 And it RESOLVES rather than merely skipping. Skipping alone would
       * leave those 16 stuck OPEN for ever, because no code would ever look at
       * them again. A one-off cleanup script would clear today's and then leave
       * the next SKU somebody curates as unlimited in exactly the same state,
       * with nobody left to remember. Resolving here is also the more accurate
       * statement: such an alert is not "unhandled", it should not exist.
       */
      if (sku.seatModel === SEAT_MODEL.UNLIMITED) {
        skippedUnlimited++;
        if (openAlert) {
          await this.resolveAlert(openAlert, actorId, 'unlimited-sku');
          resolved++;
        }
        continue;
      }

      const tenantConsumed = consumedBySkuId.get(sku.skuId) ?? 0;
      const agg = await this.prisma.opcoSkuLedger.aggregate({
        where: { skuCatalogId: sku.id },
        _sum: { assignedQuantity: true },
      });
      const ledgerAssignedSum = agg._sum.assignedQuantity ?? 0;
      const delta = tenantConsumed - ledgerAssignedSum;

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
        await this.resolveAlert(openAlert, actorId);
        resolved++;
      }
    }

    const drift = await this.prisma.driftAlert.count({
      where: { status: DriftStatus.OPEN },
    });
    this.logger.log(
      `Reconcile: checked ${catalog.length}, opened ${opened}, updated ${updated}, resolved ${resolved}, skipped ${skippedUnlimited} unlimited, open drift ${drift}`,
    );
    return {
      checked: catalog.length,
      opened,
      updated,
      resolved,
      skippedUnlimited,
      drift,
    };
  }

  /**
   * Close one OPEN alert and attribute it, in one transaction.
   *
   * Extracted by CH-029 because there are now two reasons to resolve — the
   * totals reconciled, or the SKU turned out to have no totals — and the audit
   * row has to be able to say WHICH. Two copies of this block would be two
   * places for the audit shape to drift apart.
   *
   * @param reason  D4's case only. Absent means the ordinary delta-reached-zero
   *   resolve, whose audit row keeps exactly the shape W29 F2c pinned.
   */
  private async resolveAlert(
    openAlert: DriftAlert,
    actorId: string | null,
    reason?: 'unlimited-sku',
  ): Promise<void> {
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
        // `source` stays WHO set the run going; `reason` carries WHY this
        // particular alert closed. Both are already whitelisted metadata keys
        // (audit-fields.ts), so this needs no widening of what may be stored.
        metadata: {
          source: actorId ? 'manual-reconcile' : 'scheduled',
          ...(reason ? { reason } : {}),
        },
      });
    });
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
