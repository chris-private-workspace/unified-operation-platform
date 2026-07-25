import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { parseAllocationMatrix } from './matrix-csv';
import {
  LedgerImportChangeDto,
  LedgerImportRequestDto,
  LedgerImportResultDto,
} from './dto/ledger-import.dto';

/**
 * Allocation import (ADR-0004, W13). Loads the manual O365 matrix (CSV) into
 * OpcoSkuLedger.allocatedQuantity.
 *
 * Invariants:
 *  - writes ONLY allocatedQuantity; assignedQuantity (the drift baseline,
 *    DESIGN §5) is never touched — create omits it (schema default 0), update
 *    sets only allocatedQuantity.
 *  - curation-as-scope: a SKU row enters the ledger only if its label matches a
 *    SkuCatalog.businessAlias. Uncurated rows (D365 / Dataverse / …) are reported
 *    and skipped, never imported.
 *  - dry-run by default: nothing is written unless dto.dryRun === false.
 *  - idempotent: re-importing the same CSV yields zero changes.
 */
@Injectable()
export class AllocationImportService {
  private readonly logger = new Logger(AllocationImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async import(
    actorId: string,
    dto: LedgerImportRequestDto,
  ): Promise<LedgerImportResultDto> {
    const commit = dto.dryRun === false;

    const opcos = await this.prisma.opco.findMany({ where: { active: true } });
    const catalog = await this.prisma.skuCatalog.findMany({
      where: { active: true, businessAlias: { not: null } },
    });

    // Header → Opco.code, col-A → businessAlias (shared mapper, W35 F3 —
    // the baseline script parses the same matrix, so the rules live in one place).
    const parsed = parseAllocationMatrix(dto.csv, opcos, catalog);
    const { opcoColumns, unknownOpcoHeaders, skippedSkuLabels, skuByAlias } =
      parsed;

    // Current allocatedQuantity for every ledger row → before/delta baseline.
    const ledger = await this.prisma.opcoSkuLedger.findMany();
    const currentAlloc = new Map(
      ledger.map((l) => [`${l.opcoId}:${l.skuCatalogId}`, l.allocatedQuantity]),
    );

    const changes: LedgerImportChangeDto[] = [];
    const mappedSkuRows = parsed.rows.length;

    for (const row of parsed.rows) {
      for (const { column, value: target } of row.cells) {
        const before = currentAlloc.get(`${column.opcoId}:${row.sku.id}`) ?? 0;
        if (target === before) continue; // no-op (incl. 0 === 0)
        changes.push({
          opcoCode: column.opcoCode,
          skuBusinessAlias: row.label,
          skuPartNumber: row.sku.skuPartNumber,
          before,
          target,
          delta: target - before,
        });
      }
    }

    let committed = 0;
    if (commit && changes.length > 0) {
      // Look up skuCatalogId per change (by partNumber is ambiguous — resolve via
      // the alias map we already built, keyed by businessAlias label).
      const upserts = changes.map((c) => {
        const sku = skuByAlias.get(c.skuBusinessAlias)!;
        const opcoId = opcoColumns.find(
          (o) => o.opcoCode === c.opcoCode,
        )!.opcoId;
        return this.prisma.opcoSkuLedger.upsert({
          where: { opcoId_skuCatalogId: { opcoId, skuCatalogId: sku.id } },
          // create omits assignedQuantity → schema default 0 (never derived
          // from import); update touches ONLY allocatedQuantity.
          create: {
            opcoId,
            skuCatalogId: sku.id,
            allocatedQuantity: c.target,
          },
          update: { allocatedQuantity: c.target },
        });
      });

      // Summary-level audit, one row (Chris 2026-07-21). A per-change row would
      // drown the table — a single import can touch hundreds of ledger cells —
      // and the per-cell trail already exists for manual edits (LedgerAdjustment,
      // ADR-0007). Same $transaction as the upserts (Decision 8.1).
      await this.prisma.$transaction([
        ...upserts,
        this.prisma.auditLog.create(
          this.audit.buildLogArgs({
            action: AUDIT_ACTIONS.ALLOCATION_IMPORT,
            targetType: 'AllocationImport',
            targetId: 'bulk', // no single entity — this is a batch operation
            actorId,
            after: {
              opcoColumns: opcoColumns.length,
              skuRows: parsed.skuRowCount,
              mappedSkuRows,
              changes: changes.length,
              committed: changes.length,
            },
          }),
        ),
      ]);
      committed = changes.length;
    }

    this.logger.log(
      `Allocation import (${commit ? 'commit' : 'dry-run'}): ` +
        `${mappedSkuRows} SKU rows, ${changes.length} changes, ` +
        `${skippedSkuLabels.length} skipped, committed ${committed}`,
    );

    return {
      dryRun: !commit,
      committed,
      summary: {
        opcoColumns: opcoColumns.length,
        skuRows: parsed.skuRowCount,
        mappedSkuRows,
        changes: changes.length,
      },
      changes,
      skippedSkuLabels,
      unknownOpcoHeaders,
    };
  }
}
