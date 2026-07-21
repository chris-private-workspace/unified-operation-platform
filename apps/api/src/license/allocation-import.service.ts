import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { parseCsv } from './csv';
import {
  LedgerImportChangeDto,
  LedgerImportRequestDto,
  LedgerImportResultDto,
} from './dto/ledger-import.dto';

/** A parsed OpCo header column: which CSV index it sits at and the Opco it maps to. */
interface OpcoColumn {
  index: number;
  opcoId: string;
  opcoCode: string;
}

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
    const rows = parseCsv(dto.csv);

    const header = rows[0] ?? [];
    const dataRows = rows.slice(1);

    // ── Map OpCo header columns to Opco.code (exact; DESIGN — seed built from
    // this Excel, so header === code). "Grand Total" and unmatched → reported. ──
    const opcos = await this.prisma.opco.findMany({ where: { active: true } });
    const opcoByCode = new Map(opcos.map((o) => [o.code, o]));
    const opcoColumns: OpcoColumn[] = [];
    const unknownOpcoHeaders: string[] = [];
    for (let i = 1; i < header.length; i++) {
      const label = (header[i] ?? '').trim();
      if (label === '' || label.toLowerCase() === 'grand total') continue;
      const opco = opcoByCode.get(label);
      if (opco)
        opcoColumns.push({ index: i, opcoId: opco.id, opcoCode: label });
      else unknownOpcoHeaders.push(label);
    }

    // ── SKU rows map to skuId via businessAlias (curation-as-scope). ──
    const catalog = await this.prisma.skuCatalog.findMany({
      where: { active: true, businessAlias: { not: null } },
    });
    const skuByAlias = new Map(
      catalog.map((s) => [(s.businessAlias as string).trim(), s]),
    );

    // Current allocatedQuantity for every ledger row → before/delta baseline.
    const ledger = await this.prisma.opcoSkuLedger.findMany();
    const currentAlloc = new Map(
      ledger.map((l) => [`${l.opcoId}:${l.skuCatalogId}`, l.allocatedQuantity]),
    );

    const changes: LedgerImportChangeDto[] = [];
    const skippedSkuLabels: string[] = [];
    let mappedSkuRows = 0;

    for (const row of dataRows) {
      const label = (row[0] ?? '').trim();
      if (label === '') continue; // blank spacer row
      const sku = skuByAlias.get(label);
      if (!sku) {
        skippedSkuLabels.push(label);
        continue;
      }
      mappedSkuRows++;
      for (const col of opcoColumns) {
        const target = toQuantity(row[col.index]);
        const before = currentAlloc.get(`${col.opcoId}:${sku.id}`) ?? 0;
        if (target === before) continue; // no-op (incl. 0 === 0)
        changes.push({
          opcoCode: col.opcoCode,
          skuBusinessAlias: label,
          skuPartNumber: sku.skuPartNumber,
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
              skuRows: dataRows.filter((r) => (r[0] ?? '').trim() !== '')
                .length,
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
        skuRows: dataRows.filter((r) => (r[0] ?? '').trim() !== '').length,
        mappedSkuRows,
        changes: changes.length,
      },
      changes,
      skippedSkuLabels,
      unknownOpcoHeaders,
    };
  }
}

/** Parse a matrix cell → a non-negative integer seat count (blank / junk → 0). */
function toQuantity(raw: string | undefined): number {
  const t = (raw ?? '').trim();
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}
