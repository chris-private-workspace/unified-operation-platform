import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { graphUnavailable } from '../integration/graph/graph-unavailable';

/** Outcome of a catalog sync run — surfaced to the trigger endpoint. */
export interface CatalogSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  snapshots: number;
}

/**
 * Module C — SKU dictionary.
 * Seeds / refreshes SkuCatalog from the tenant's live subscribedSkus and
 * records a TenantSkuSnapshot of the totals each run.
 *
 * skuId (GUID) is the only key we trust (DESIGN §5). Human-curated columns
 * (businessAlias / category / displayName / isBaseLicense) are never
 * overwritten on update — the tenant can't supply them.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
  ) {}

  async syncFromTenant(): Promise<CatalogSyncResult> {
    // BE-graph-harden: a raw Graph error must not crash the process (BUG-002);
    // fail closed with a clean 503 before any catalog write.
    let skus;
    try {
      skus = await this.graph.getSubscribedSkus();
    } catch (err) {
      throw graphUnavailable(
        this.logger,
        'read the tenant license inventory',
        err,
      );
    }
    const now = new Date();
    let created = 0;
    let updated = 0;

    for (const s of skus) {
      const existing = await this.prisma.skuCatalog.findUnique({
        where: { skuId: s.skuId },
      });

      // Upsert by skuId. On update we touch ONLY tenant-owned fields so a
      // previously curated businessAlias / displayName survives (DESIGN §5).
      const record = existing
        ? await this.prisma.skuCatalog.update({
            where: { skuId: s.skuId },
            data: {
              skuPartNumber: s.skuPartNumber,
              active: true,
              lastSyncedAt: now,
            },
          })
        : await this.prisma.skuCatalog.create({
            data: {
              skuId: s.skuId,
              skuPartNumber: s.skuPartNumber,
              displayName: s.skuPartNumber, // placeholder until a human curates it
              lastSyncedAt: now,
            },
          });
      existing ? updated++ : created++;

      await this.prisma.tenantSkuSnapshot.create({
        data: {
          skuCatalogId: record.id,
          prepaidEnabled: s.prepaidEnabled,
          consumedUnits: s.consumedUnits,
        },
      });
    }

    // SKUs no longer returned by the tenant are soft-deactivated (OD3), never
    // hard-deleted — ledger / snapshot / drift FKs must stay intact.
    const liveIds = skus.map((s) => s.skuId);
    const { count: deactivated } = await this.prisma.skuCatalog.updateMany({
      where: { active: true, skuId: { notIn: liveIds } },
      data: { active: false },
    });

    this.logger.log(
      `Catalog sync: +${created} ~${updated} -${deactivated} (${skus.length} snapshots)`,
    );
    return { created, updated, deactivated, snapshots: skus.length };
  }

  /** Active SKU dictionary for the read endpoint / asset-list view. */
  async listCatalog() {
    return this.prisma.skuCatalog.findMany({
      where: { active: true },
      orderBy: { skuPartNumber: 'asc' },
    });
  }
}
