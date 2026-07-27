import { Test } from '@nestjs/testing';
import type { AppUser } from '@prisma/client';
import { LedgerReadService } from './ledger-read.service';
import { PrismaService } from '../prisma/prisma.service';

// Only opcoScopeId matters to scopeWhere; the rest of AppUser is irrelevant here.
const ADMIN = { opcoScopeId: null } as unknown as AppUser;
const OPCO_IT = { opcoScopeId: 'opco-rhk' } as unknown as AppUser;

const opcoRef = (code: string) => ({ code, displayName: code });
const skuRef = (part: string) => ({
  skuId: `guid-${part}`,
  skuPartNumber: part,
  displayName: part,
  category: 'Base',
});

describe('LedgerReadService', () => {
  let service: LedgerReadService;
  let prisma: { opcoSkuLedger: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { opcoSkuLedger: { findMany: jest.fn().mockResolvedValue([]) } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LedgerReadService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(LedgerReadService);
  });

  it('lists rows with derived headroom + overAllocated, active-only, scoped to all for ADMIN', async () => {
    prisma.opcoSkuLedger.findMany.mockResolvedValue([
      {
        id: 'l1',
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e3',
        allocatedQuantity: 661,
        assignedQuantity: 600,
        opco: opcoRef('RHK'),
        sku: skuRef('SPE_E3'),
      },
      {
        id: 'l2',
        opcoId: 'opco-rth',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 6,
        assignedQuantity: 10, // over-allocated
        opco: opcoRef('RTH'),
        sku: skuRef('STANDARDPACK'),
      },
    ]);

    const rows = await service.listLedger(ADMIN);

    // ADMIN → no opcoId restriction; active-only + non-empty filter applied.
    const where = prisma.opcoSkuLedger.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      sku: { active: true },
      opco: { active: true },
      NOT: { allocatedQuantity: 0, assignedQuantity: 0 },
    });

    expect(rows[0]).toMatchObject({
      opcoId: 'opco-rhk',
      allocatedQuantity: 661,
      assignedQuantity: 600,
      headroom: 61,
      overAllocated: false,
    });
    expect(rows[1]).toMatchObject({
      headroom: -4,
      overAllocated: true,
    });
  });

  it('restricts the ledger query to the caller OpCo for OPCO_IT (AUTH-3a scope)', async () => {
    await service.listLedger(OPCO_IT);
    const where = prisma.opcoSkuLedger.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      opcoId: 'opco-rhk',
      sku: { active: true },
      opco: { active: true },
      NOT: { allocatedQuantity: 0, assignedQuantity: 0 },
    });
  });

  // ── CH-008: 0/0 rows hidden by default ────────────────────────────
  describe('empty-row filter (CH-008)', () => {
    it('includeEmpty=true drops the NOT clause on both reads', async () => {
      await service.listLedger(ADMIN, true);
      await service.ledgerStats(ADMIN, true);

      for (const call of prisma.opcoSkuLedger.findMany.mock.calls) {
        expect(call[0].where).toEqual({
          sku: { active: true },
          opco: { active: true },
        });
      }
    });

    it('keeps the OPCO_IT scope while including empties (R4 — filter never replaces scope)', async () => {
      await service.listLedger(OPCO_IT, true);
      const where = prisma.opcoSkuLedger.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ opcoId: 'opco-rhk' });
    });

    it('stats: an empty row would inflate skusTracked / opcosTracked but not the totals (why D2 filters at the query)', async () => {
      const real = {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e3',
        allocatedQuantity: 100,
        assignedQuantity: 40,
      };
      const empty = {
        opcoId: 'opco-rth',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 0,
        assignedQuantity: 0,
      };

      prisma.opcoSkuLedger.findMany.mockResolvedValue([real]);
      const withoutEmpty = await service.ledgerStats(ADMIN);
      prisma.opcoSkuLedger.findMany.mockResolvedValue([real, empty]);
      const withEmpty = await service.ledgerStats(ADMIN, true);

      // The three totals are identical — 0 contributes 0 (spec §2.3: Overview
      // does not move). Only the two "tracked" counts change, which is exactly
      // the misreporting CH-008 fixes.
      expect(withEmpty.totalAllocated).toBe(withoutEmpty.totalAllocated);
      expect(withEmpty.totalAssigned).toBe(withoutEmpty.totalAssigned);
      expect(withEmpty.totalHeadroom).toBe(withoutEmpty.totalHeadroom);
      expect(withoutEmpty.skusTracked).toBe(1);
      expect(withoutEmpty.opcosTracked).toBe(1);
      expect(withEmpty.skusTracked).toBe(2);
      expect(withEmpty.opcosTracked).toBe(2);
    });

    it('"budget set, nobody assigned" (allocated>0, assigned=0) is NOT empty (D1 / A4)', async () => {
      // Guarded at the predicate level: the NOT requires BOTH to be 0, so a row
      // with a budget survives it. Asserting the shape is what protects the 21
      // real rows in dev from being swept away by a widened definition.
      await service.listLedger(ADMIN);
      const where = prisma.opcoSkuLedger.findMany.mock.calls[0][0].where;
      expect(where.NOT).toEqual({
        allocatedQuantity: 0,
        assignedQuantity: 0,
      });
      expect(Object.keys(where.NOT)).toHaveLength(2);
    });
  });

  it('aggregates scoped stats (totals, distinct counts, over-allocated)', async () => {
    prisma.opcoSkuLedger.findMany.mockResolvedValue([
      {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e3',
        allocatedQuantity: 661,
        assignedQuantity: 600,
      },
      {
        opcoId: 'opco-rth',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 6,
        assignedQuantity: 10,
      },
      {
        opcoId: 'opco-rhk',
        skuCatalogId: 'sku-e1',
        allocatedQuantity: 80,
        assignedQuantity: 0,
      },
    ]);

    const stats = await service.ledgerStats(ADMIN);

    expect(stats).toEqual({
      totalAllocated: 747,
      totalAssigned: 610,
      totalHeadroom: 137,
      skusTracked: 2, // sku-e3, sku-e1
      opcosTracked: 2, // rhk, rth
      overAllocatedCount: 1, // rth×e1 (10 > 6)
    });
  });

  it('handles an empty ledger', async () => {
    const rows = await service.listLedger(ADMIN);
    const stats = await service.ledgerStats(ADMIN);
    expect(rows).toEqual([]);
    expect(stats).toEqual({
      totalAllocated: 0,
      totalAssigned: 0,
      totalHeadroom: 0,
      skusTracked: 0,
      opcosTracked: 0,
      overAllocatedCount: 0,
    });
  });
});
