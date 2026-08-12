import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { graphUnavailable } from '../integration/graph/graph-unavailable';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { findAliasCollisions } from './alias-collision';
// One implementation of the curation-value semantics, shared with the bulk
// import (CH-019): PATCH's "" and a blank CSV cell must clear a field the same
// way, or the two write paths would drift apart on the field that decides scope.
import { normalizeOptional } from './catalog-csv';

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
 * (businessAlias / category / displayName / isBaseLicense / seatModel) are
 * never overwritten on update — the tenant can't supply them.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
    private readonly audit: AuditService,
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

  /**
   * Human curation of one SKU entry (CH-003). Only the curated columns are
   * writable — skuId / skuPartNumber / displayName / active stay system-owned
   * (set by sync). Fields left undefined are untouched; "" clears alias/category
   * to null. businessAlias feeds allocation-import matching (ADR-0004); the edit
   * is the intended manual curation path, not a new mechanism.
   */
  async updateEntry(
    actorId: string,
    id: string,
    dto: {
      businessAlias?: string | null;
      category?: string | null;
      isBaseLicense?: boolean;
      seatModel?: string;
    },
  ) {
    const existing = await this.prisma.skuCatalog.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`SKU catalog entry ${id} not found`);
    }

    const data: Prisma.SkuCatalogUpdateInput = {};
    if (dto.businessAlias !== undefined) {
      data.businessAlias = normalizeOptional(dto.businessAlias);
    }
    if (dto.category !== undefined) {
      data.category = normalizeOptional(dto.category);
    }
    if (dto.isBaseLicense !== undefined) {
      data.isBaseLicense = dto.isBaseLicense;
    }
    // ADR-0032 D1 — curated like the fields above; tenant sync never writes it.
    // The DTO already rejected anything outside SEAT_MODELS, so no re-check here
    // (the import path validates at its own parser, for the same reason).
    if (dto.seatModel !== undefined) {
      data.seatModel = dto.seatModel;
    }

    // ADR-0023 D5 / OQ-1 — the same collision guard the bulk import runs.
    // Only the bulk path would leave a back door: one single edit could create
    // the collision that then blocks every later import, with nothing telling
    // the operator which edit did it. Skipped when the entry is inactive (its
    // alias takes no part in import matching) or when the alias is being
    // cleared (null is never a collision).
    if (existing.active && typeof data.businessAlias === 'string') {
      const others = await this.prisma.skuCatalog.findMany({
        where: { active: true, id: { not: id } },
        select: { id: true, skuPartNumber: true, businessAlias: true },
      });
      const collisions = findAliasCollisions([
        ...others,
        {
          id,
          skuPartNumber: existing.skuPartNumber,
          businessAlias: data.businessAlias,
        },
      ]);
      if (collisions.length > 0) {
        throw new BadRequestException({
          code: 'alias-collision',
          message: `Business alias "${data.businessAlias}" is already used by ${collisions[0].skuPartNumbers
            .filter((p) => p !== existing.skuPartNumber)
            .join(
              ', ',
            )}. Allocation rows match on the alias, so a duplicate would silently send seats to the wrong SKU.`,
          collisions,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.skuCatalog.update({ where: { id }, data });
      // businessAlias drives allocation-import matching (ADR-0004), so an alias
      // edit can silently change how a future import maps rows — worth a trail.
      await this.audit.logChange(tx, {
        action: AUDIT_ACTIONS.CATALOG_UPDATE,
        targetType: 'SkuCatalog',
        targetId: id,
        actorId,
        before: existing,
        after: updated,
      });
      return updated;
    });
  }
}
