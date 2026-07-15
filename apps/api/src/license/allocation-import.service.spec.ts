import { Test } from '@nestjs/testing';
import { AllocationImportService } from './allocation-import.service';
import { PrismaService } from '../prisma/prisma.service';

// Two OpCos + two curated M365 SKUs; the D365 row is deliberately uncurated
// (no businessAlias match) to exercise curation-as-scope (ADR-0004).
const OPCOS = [
  { id: 'opco-rhk', code: 'RHK', active: true },
  { id: 'opco-rth', code: 'RTH', active: true },
];
const CATALOG = [
  {
    id: 'sku-e3',
    skuPartNumber: 'SPE_E3',
    businessAlias: 'M365 E3 Unified Existing Customer Sub Per User',
    active: true,
  },
  {
    id: 'sku-e1',
    skuPartNumber: 'STANDARDPACK',
    businessAlias: 'O365 E1 Existing Customer Sub Per User',
    active: true,
  },
];

const CSV = [
  ',RHK,RTH,Grand Total',
  'M365 E3 Unified Existing Customer Sub Per User,661,1624,2285',
  'O365 E1 Existing Customer Sub Per User,80,6,86',
  'D365 Sales Sub Per User,,175,175', // uncurated → skipped
].join('\n');

describe('AllocationImportService', () => {
  let service: AllocationImportService;
  let prisma: {
    opco: { findMany: jest.Mock };
    skuCatalog: { findMany: jest.Mock };
    opcoSkuLedger: { findMany: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      opco: { findMany: jest.fn().mockResolvedValue(OPCOS) },
      skuCatalog: { findMany: jest.fn().mockResolvedValue(CATALOG) },
      opcoSkuLedger: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      // array-form $transaction — resolve the batched upserts.
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AllocationImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AllocationImportService);
  });

  it('dry-run: maps OpCo + SKU, classifies, writes nothing', async () => {
    const res = await service.import({ csv: CSV, dryRun: true });

    expect(res.dryRun).toBe(true);
    expect(res.committed).toBe(0);
    expect(res.summary).toEqual({
      opcoColumns: 2,
      skuRows: 3,
      mappedSkuRows: 2,
      changes: 4,
    });
    // four allocations (2 curated SKUs × 2 OpCos, all non-zero from a clean ledger)
    expect(res.changes).toContainEqual({
      opcoCode: 'RHK',
      skuBusinessAlias: 'M365 E3 Unified Existing Customer Sub Per User',
      skuPartNumber: 'SPE_E3',
      before: 0,
      target: 661,
      delta: 661,
    });
    // curation-as-scope: the D365 row is skipped, never a change.
    expect(res.skippedSkuLabels).toEqual(['D365 Sales Sub Per User']);
    // "Grand Total" is a known non-OpCo column, not an unknown header.
    expect(res.unknownOpcoHeaders).toEqual([]);
    // nothing written on a dry-run.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.opcoSkuLedger.upsert).not.toHaveBeenCalled();
  });

  it('commit: writes ONLY allocatedQuantity — never touches assignedQuantity (invariant)', async () => {
    // Existing row carries an assigned baseline that MUST survive the import.
    prisma.opcoSkuLedger.findMany.mockResolvedValue([
      {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e3',
        allocatedQuantity: 600,
        assignedQuantity: 5,
      },
    ]);

    const res = await service.import({ csv: CSV, dryRun: false });

    expect(res.dryRun).toBe(false);
    expect(res.committed).toBe(4);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.opcoSkuLedger.upsert).toHaveBeenCalledTimes(4);

    // INVARIANT: no upsert — create or update — ever mentions assignedQuantity.
    for (const call of prisma.opcoSkuLedger.upsert.mock.calls) {
      const arg = call[0];
      expect(arg.update).not.toHaveProperty('assignedQuantity');
      expect(arg.create).not.toHaveProperty('assignedQuantity');
      expect(Object.keys(arg.update)).toEqual(['allocatedQuantity']);
    }

    // The existing RHK×E3 row is updated to the new allocation (600 → 661),
    // and delta reflects the real before value.
    const e3rhk = prisma.opcoSkuLedger.upsert.mock.calls.find(
      (c) =>
        c[0].where.opcoId_skuCatalogId.opcoId === 'opco-rhk' &&
        c[0].where.opcoId_skuCatalogId.skuCatalogId === 'sku-e3',
    );
    expect(e3rhk[0].update).toEqual({ allocatedQuantity: 661 });
    expect(res.changes).toContainEqual({
      opcoCode: 'RHK',
      skuBusinessAlias: 'M365 E3 Unified Existing Customer Sub Per User',
      skuPartNumber: 'SPE_E3',
      before: 600,
      target: 661,
      delta: 61,
    });
  });

  it('idempotent: re-importing values already in the ledger yields zero changes', async () => {
    prisma.opcoSkuLedger.findMany.mockResolvedValue([
      {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e3',
        allocatedQuantity: 661,
        assignedQuantity: 0,
      },
      {
        opcoId: 'opco-rth',
        skuCatalogId: 'sku-e3',
        allocatedQuantity: 1624,
        assignedQuantity: 0,
      },
      {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 80,
        assignedQuantity: 0,
      },
      {
        opcoId: 'opco-rth',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 6,
        assignedQuantity: 0,
      },
    ]);

    const res = await service.import({ csv: CSV, dryRun: false });

    expect(res.summary.changes).toBe(0);
    expect(res.committed).toBe(0);
    expect(prisma.opcoSkuLedger.upsert).not.toHaveBeenCalled();
  });

  it('downgrades a previously-set cell to 0 when the CSV cell is now blank', async () => {
    // CSV blanks RHK × E1 (was 80 in the ledger) → target 0, before 80.
    const csv = [
      ',RHK,RTH,Grand Total',
      'O365 E1 Existing Customer Sub Per User,,6,6', // RHK blank
    ].join('\n');
    prisma.opcoSkuLedger.findMany.mockResolvedValue([
      {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 80,
        assignedQuantity: 2, // must survive the downgrade
      },
    ]);

    const res = await service.import({ csv, dryRun: false });

    expect(res.changes).toContainEqual({
      opcoCode: 'RHK',
      skuBusinessAlias: 'O365 E1 Existing Customer Sub Per User',
      skuPartNumber: 'STANDARDPACK',
      before: 80,
      target: 0,
      delta: -80,
    });
    // the downgrade writes allocatedQuantity 0 and leaves assignedQuantity alone.
    const rhkE1 = prisma.opcoSkuLedger.upsert.mock.calls.find(
      (c) =>
        c[0].where.opcoId_skuCatalogId.opcoId === 'opco-rhk' &&
        c[0].where.opcoId_skuCatalogId.skuCatalogId === 'sku-e1',
    );
    expect(rhkE1[0].update).toEqual({ allocatedQuantity: 0 });
  });

  it('reports header columns that match no Opco.code (Grand Total is not "unknown")', async () => {
    const csv =
      ',RHK,BOGUS,Grand Total\nM365 E3 Unified Existing Customer Sub Per User,10,20,30';
    const res = await service.import({ csv, dryRun: true });

    expect(res.unknownOpcoHeaders).toEqual(['BOGUS']);
    expect(res.summary.opcoColumns).toBe(1); // only RHK mapped
  });

  // ADR-0008 D5 (Phase 丁): D365 licence is in scope. The ONLY thing that kept
  // the D365 row out was a missing businessAlias (curation-as-scope) — give it
  // one and the same code path imports it like any M365 SKU. Counterpart to the
  // uncurated-D365 skip above; proves widening scope to D365 is pure curation.
  it('imports a curated D365 SKU (businessAlias set) — no code change, curation only', async () => {
    prisma.skuCatalog.findMany.mockResolvedValue([
      ...CATALOG,
      {
        id: 'sku-d365',
        skuPartNumber: 'DYN365_ENTERPRISE_SALES',
        businessAlias: 'D365 Sales Sub Per User', // now curated → in scope
        active: true,
      },
    ]);

    const res = await service.import({ csv: CSV, dryRun: false });

    // D365 row is no longer skipped; RTH=175 (RHK blank → no-op) becomes a change.
    expect(res.skippedSkuLabels).toEqual([]);
    expect(res.changes).toContainEqual({
      opcoCode: 'RTH',
      skuBusinessAlias: 'D365 Sales Sub Per User',
      skuPartNumber: 'DYN365_ENTERPRISE_SALES',
      before: 0,
      target: 175,
      delta: 175,
    });
    // and it is written to the ledger exactly like a curated M365 SKU.
    const d365 = prisma.opcoSkuLedger.upsert.mock.calls.find(
      (c) => c[0].where.opcoId_skuCatalogId.skuCatalogId === 'sku-d365',
    );
    expect(d365[0].create).toMatchObject({
      skuCatalogId: 'sku-d365',
      allocatedQuantity: 175,
    });
  });
});
