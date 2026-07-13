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

    // ADMIN → no opcoId restriction; active-only filter applied.
    const where = prisma.opcoSkuLedger.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ sku: { active: true }, opco: { active: true } });

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
