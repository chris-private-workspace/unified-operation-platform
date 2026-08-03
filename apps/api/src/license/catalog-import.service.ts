import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, SkuCatalog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { findAliasCollisions } from './alias-collision';
import { parseCatalogCsv } from './catalog-csv';
import {
  CatalogImportChangeDto,
  CatalogImportRequestDto,
  CatalogImportResultDto,
} from './dto/catalog-import.dto';

/**
 * Bulk SKU curation (CH-019 / ADR-0023). Loads an edited SKU Catalog export
 * back in — the same three columns `PATCH /license/catalog/:id` writes, for
 * many SKUs at once.
 *
 * Invariants:
 *  - matches on skuId (GUID) only, never on a name (DESIGN §5 — businessAlias
 *    exists precisely because the names cannot be trusted).
 *  - never creates a catalog row: identity is owned by tenant sync, and a
 *    mistyped GUID would mint a phantom SKU reconcile can never match.
 *  - dry-run by default; nothing is written unless dto.dryRun === false.
 *  - fails closed on an alias collision, for the WHOLE batch (ADR-0023 D5).
 *  - clearing an alias needs explicit confirmation (ADR-0023 D6).
 *  - idempotent: re-uploading an unedited export yields zero changes.
 */
@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async import(
    actorId: string,
    dto: CatalogImportRequestDto,
  ): Promise<CatalogImportResultDto> {
    const commit = dto.dryRun === false;
    const parsed = parseCatalogCsv(dto.csv);

    // Active only, matching what the allocation import itself reads
    // (allocation-import.service.ts:42-44) — an inactive SKU is out of scope
    // for the mapping this curation feeds.
    const catalog = await this.prisma.skuCatalog.findMany({
      where: { active: true },
    });
    const byGuid = new Map(catalog.map((c) => [c.skuId.toLowerCase(), c]));

    // Seeded with today's aliases, then mutated as the file is applied — the
    // collision check needs the RESULTING state of the whole catalog, because a
    // new alias can collide with a SKU this file never mentions.
    const resultingAlias = new Map(
      catalog.map((c) => [c.id, c.businessAlias] as const),
    );

    const changes: CatalogImportChangeDto[] = [];
    const skippedSkuIds: string[] = [];
    let matched = 0;

    for (const row of parsed.rows) {
      const sku = byGuid.get(row.skuId.toLowerCase());
      if (!sku) {
        skippedSkuIds.push(row.skuId);
        continue;
      }
      matched++;

      const change = this.diff(sku, row);
      if (!change) continue;
      if (change.alias) resultingAlias.set(sku.id, change.alias.after);
      changes.push(change);
    }

    const collisions = findAliasCollisions(
      catalog.map((c) => ({
        id: c.id,
        skuPartNumber: c.skuPartNumber,
        businessAlias: resultingAlias.get(c.id) ?? null,
      })),
    );
    // Checked on dry runs too: the preview is where an operator is supposed to
    // find out, not the commit.
    if (collisions.length > 0) {
      throw new BadRequestException({
        code: 'alias-collision',
        message:
          'Two or more SKUs would share a business alias. Allocation rows match on that alias, so a duplicate silently sends seats to the wrong SKU — nothing was written.',
        collisions,
      });
    }

    const aliasClears = changes.filter((c) => c.clearsAlias).length;
    if (commit && aliasClears > 0 && dto.confirmClears !== true) {
      throw new BadRequestException({
        code: 'clears-not-confirmed',
        message: `This file clears ${aliasClears} business ${aliasClears === 1 ? 'alias' : 'aliases'}. Confirm before committing — those SKUs leave import scope while their existing allocation stays in the ledger at its old value.`,
        aliasClears,
      });
    }

    let committed = 0;
    if (commit && changes.length > 0) {
      const byId = new Map(catalog.map((c) => [c.skuId, c]));
      // Interactive transaction: each audit row needs the entity as it was
      // immediately before its own update (same reason as ledger-full-reset).
      await this.prisma.$transaction(async (tx) => {
        for (const change of changes) {
          const existing = byId.get(change.skuId)!;
          const updated = await tx.skuCatalog.update({
            where: { id: existing.id },
            data: toUpdateInput(change),
          });
          // Reuses the single-edit action: the alias history of one SKU has to
          // stay answerable in one query no matter which path wrote it, and
          // /admin/audit already renders this shape.
          await this.audit.logChange(tx, {
            action: AUDIT_ACTIONS.CATALOG_UPDATE,
            targetType: 'SkuCatalog',
            targetId: existing.id,
            actorId,
            before: existing,
            after: updated,
          });
        }
        // Batch attribution, same split as ADR-0022 D4: the per-SKU trail is
        // above, this row answers "was that one upload".
        await this.audit.log(tx, {
          action: AUDIT_ACTIONS.CATALOG_BULK_CURATE,
          targetType: 'CatalogImport',
          targetId: 'bulk',
          actorId,
          after: {
            rows: parsed.rows.length,
            matched,
            changes: changes.length,
            aliasClears,
            skipped: skippedSkuIds.length,
          },
        });
      });
      committed = changes.length;
    }

    this.logger.log(
      `Catalog import (${commit ? 'commit' : 'dry-run'}): ` +
        `${parsed.rows.length} rows, ${matched} matched, ${changes.length} changes ` +
        `(${aliasClears} alias clears), ${skippedSkuIds.length} skipped, committed ${committed}`,
    );

    return {
      dryRun: !commit,
      committed,
      summary: {
        rows: parsed.rows.length,
        matched,
        changes: changes.length,
        aliasClears,
      },
      changes,
      skippedSkuIds,
      unknownColumns: parsed.unknownColumns,
    };
  }

  /** Per-SKU diff; null when the row asks for nothing the catalog doesn't have. */
  private diff(
    sku: SkuCatalog,
    row: {
      businessAlias?: string | null;
      category?: string | null;
      isBaseLicense?: boolean;
    },
  ): CatalogImportChangeDto | null {
    const change: CatalogImportChangeDto = {
      skuId: sku.skuId,
      skuPartNumber: sku.skuPartNumber,
      displayName: sku.displayName,
      clearsAlias: false,
    };
    let touched = false;

    if (
      row.businessAlias !== undefined &&
      row.businessAlias !== sku.businessAlias
    ) {
      change.alias = { before: sku.businessAlias, after: row.businessAlias };
      change.clearsAlias =
        sku.businessAlias !== null && row.businessAlias === null;
      touched = true;
    }
    if (row.category !== undefined && row.category !== sku.category) {
      change.category = { before: sku.category, after: row.category };
      touched = true;
    }
    if (
      row.isBaseLicense !== undefined &&
      row.isBaseLicense !== sku.isBaseLicense
    ) {
      change.isBaseLicense = {
        before: sku.isBaseLicense,
        after: row.isBaseLicense,
      };
      touched = true;
    }
    return touched ? change : null;
  }
}

function toUpdateInput(
  change: CatalogImportChangeDto,
): Prisma.SkuCatalogUpdateInput {
  const data: Prisma.SkuCatalogUpdateInput = {};
  if (change.alias) data.businessAlias = change.alias.after;
  if (change.category) data.category = change.category.after;
  if (change.isBaseLicense) data.isBaseLicense = change.isBaseLicense.after;
  return data;
}
