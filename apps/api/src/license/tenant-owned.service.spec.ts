import { Test } from '@nestjs/testing';
import { TenantOwnedService } from './tenant-owned.service';
import { PrismaService } from '../prisma/prisma.service';

const cat = (id: string, part: string, category: string | null = 'Base') => ({
  id,
  skuId: `guid-${part}`,
  skuPartNumber: part,
  displayName: part,
  category,
});

describe('TenantOwnedService', () => {
  let service: TenantOwnedService;
  let prisma: {
    tenantSkuSnapshot: { findMany: jest.Mock };
    opcoSkuLedger: { groupBy: jest.Mock };
    skuCatalog: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenantSkuSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      opcoSkuLedger: { groupBy: jest.fn().mockResolvedValue([]) },
      skuCatalog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantOwnedService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(TenantOwnedService);
  });

  it('picks the latest snapshot per SKU and derives unallocated / overAllocated', async () => {
    // Two snapshots for sku-e3, newest first (findMany orderBy capturedAt desc).
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      { skuCatalogId: 'sku-e3', prepaidEnabled: 2000, consumedUnits: 1500 },
      { skuCatalogId: 'sku-e3', prepaidEnabled: 999, consumedUnits: 1 }, // older → ignored
      { skuCatalogId: 'sku-e1', prepaidEnabled: 100, consumedUnits: 90 },
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-e3',
        _sum: { allocatedQuantity: 2285, assignedQuantity: 0 },
      },
      {
        skuCatalogId: 'sku-e1',
        _sum: { allocatedQuantity: 86, assignedQuantity: 0 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-e3', 'SPE_E3'),
      cat('sku-e1', 'STANDARDPACK'),
      cat('sku-empty', 'EMPTYSKU'), // no snapshot + no ledger → skipped
    ]);

    const rows = await service.listTenantSkus();
    const byId = Object.fromEntries(rows.map((r) => [r.skuCatalogId, r]));

    expect(rows).toHaveLength(2); // sku-empty skipped
    expect(byId['sku-e3']).toMatchObject({
      owned: 2000, // latest, not 999
      tenantConsumed: 1500,
      allocatedToOpcos: 2285,
      assignedToUsers: 0,
      unallocated: -285,
      overAllocated: true, // 2285 > 2000
    });
    expect(byId['sku-e1']).toMatchObject({
      owned: 100,
      allocatedToOpcos: 86,
      unallocated: 14,
      overAllocated: false,
    });
  });

  it('leaves owned/tenantConsumed/unallocated null for a SKU with ledger but no snapshot', async () => {
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-x',
        _sum: { allocatedQuantity: 50, assignedQuantity: 10 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([cat('sku-x', 'ADDON')]);

    const [row] = await service.listTenantSkus();
    expect(row).toMatchObject({
      owned: null,
      tenantConsumed: null,
      allocatedToOpcos: 50,
      assignedToUsers: 10,
      unallocated: null,
      overAllocated: false, // can't be over-allocated without a known owned
    });
  });

  it('aggregates tenant stats (owned null counts as 0)', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      { skuCatalogId: 'sku-e3', prepaidEnabled: 2000, consumedUnits: 1500 },
      { skuCatalogId: 'sku-e1', prepaidEnabled: 100, consumedUnits: 90 },
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-e3',
        _sum: { allocatedQuantity: 2285, assignedQuantity: 0 },
      },
      {
        skuCatalogId: 'sku-e1',
        _sum: { allocatedQuantity: 86, assignedQuantity: 0 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-e3', 'SPE_E3'),
      cat('sku-e1', 'STANDARDPACK'),
    ]);

    const stats = await service.tenantSkuStats();
    expect(stats).toEqual({
      totalOwned: 2100,
      totalAllocated: 2371,
      totalAssigned: 0,
      totalUnallocated: -271, // 2100 - 2371
      skusOverAllocated: 1, // sku-e3
    });
  });

  it('handles an empty tenant (no SKUs)', async () => {
    const rows = await service.listTenantSkus();
    const stats = await service.tenantSkuStats();
    expect(rows).toEqual([]);
    expect(stats).toEqual({
      totalOwned: 0,
      totalAllocated: 0,
      totalAssigned: 0,
      totalUnallocated: 0,
      skusOverAllocated: 0,
    });
  });
});
