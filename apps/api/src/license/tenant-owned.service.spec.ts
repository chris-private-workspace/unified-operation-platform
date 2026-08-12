import { Test } from '@nestjs/testing';
import { TenantOwnedService } from './tenant-owned.service';
import { PrismaService } from '../prisma/prisma.service';

// seatModel defaults to 'prepaid' exactly as the column does — every existing
// expectation below therefore still describes the ordinary SKU, which is what
// makes them the guard that CH-026 changed nothing for it.
const cat = (
  id: string,
  part: string,
  category: string | null = 'Base',
  seatModel = 'prepaid',
) => ({
  id,
  skuId: `guid-${part}`,
  skuPartNumber: part,
  displayName: part,
  category,
  seatModel,
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
      unlimitedSkus: 0,
    });
  });

  // ADR-0008 D5 (Phase 丁): D365 licence is in scope. tenant-owned filters SKUs
  // only on active + data-presence (category is display-only, never a gate), so a
  // Dynamics 365 SKU flows through owned / allocated / total exactly like M365.
  it('includes a D365 SKU in owned/total identically (category is not a gate)', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      { skuCatalogId: 'sku-d365', prepaidEnabled: 500, consumedUnits: 300 },
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-d365',
        _sum: { allocatedQuantity: 400, assignedQuantity: 0 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-d365', 'DYN365_ENTERPRISE_SALES', 'Dynamics 365'),
    ]);

    const [row] = await service.listTenantSkus();
    expect(row).toMatchObject({
      skuCatalogId: 'sku-d365',
      owned: 500,
      allocatedToOpcos: 400,
      unallocated: 100,
    });
    const stats = await service.tenantSkuStats();
    expect(stats.totalOwned).toBe(500);
    expect(stats.totalAllocated).toBe(400);
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
      unlimitedSkus: 0,
    });
  });

  // ── CH-026 / ADR-0032 ────────────────────────────────────────────────────
  // Numbers taken from the live tenant snapshot recorded in the ADR: the
  // sentinel is 1000000 (NOT the 10000000 first assumed), and POWER_BI_STANDARD
  // really is at 3064 in use against it.

  it('reports an unlimited SKU without deriving anything from the sentinel', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      { skuCatalogId: 'sku-pbi', prepaidEnabled: 1000000, consumedUnits: 3064 },
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-pbi',
        _sum: { allocatedQuantity: 40, assignedQuantity: 12 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-pbi', 'POWER_BI_STANDARD', 'Power Platform', 'unlimited'),
    ]);

    const [row] = await service.listTenantSkus();
    expect(row).toMatchObject({
      seatModel: 'unlimited',
      // The raw snapshot value is still reported — the read-model interprets,
      // it does not rewrite what the tenant said.
      owned: 1000000,
      tenantConsumed: 3064,
      // null, not 0: there is no denominator to subtract an allocation from.
      unallocated: null,
      overAllocated: false,
      noPrepaidSeats: false,
      // Real seats on a real SKU — these are NOT excluded.
      allocatedToOpcos: 40,
      assignedToUsers: 12,
    });
  });

  it('flags a prepaid SKU that has 0 owned but is in use (derived, not curated)', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      { skuCatalogId: 'sku-pbipro', prepaidEnabled: 0, consumedUnits: 91 },
      // 0 owned AND nobody using it is an ordinary empty SKU, not this state.
      { skuCatalogId: 'sku-idle', prepaidEnabled: 0, consumedUnits: 0 },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-pbipro', 'POWER_BI_PRO'),
      cat('sku-idle', 'IDLE_SKU'),
    ]);

    const rows = await service.listTenantSkus();
    const byId = Object.fromEntries(rows.map((r) => [r.skuCatalogId, r]));
    expect(byId['sku-pbipro']).toMatchObject({
      seatModel: 'prepaid',
      owned: 0,
      noPrepaidSeats: true,
      unallocated: null,
    });
    expect(byId['sku-idle']).toMatchObject({
      noPrepaidSeats: false,
      unallocated: 0, // 0 owned, 0 allocated — a real answer
    });
  });

  it('excludes unlimited SKUs from the owned totals but not from allocated / assigned', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      { skuCatalogId: 'sku-e3', prepaidEnabled: 2000, consumedUnits: 1500 },
      { skuCatalogId: 'sku-pbi', prepaidEnabled: 1000000, consumedUnits: 3064 },
      { skuCatalogId: 'sku-flow', prepaidEnabled: 10000, consumedUnits: 4525 },
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-e3',
        _sum: { allocatedQuantity: 1800, assignedQuantity: 1500 },
      },
      {
        skuCatalogId: 'sku-pbi',
        _sum: { allocatedQuantity: 40, assignedQuantity: 12 },
      },
      {
        skuCatalogId: 'sku-flow',
        _sum: { allocatedQuantity: 7, assignedQuantity: 3 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-e3', 'SPE_E3'),
      cat('sku-pbi', 'POWER_BI_STANDARD', 'Power Platform', 'unlimited'),
      cat('sku-flow', 'FLOW_FREE', 'Power Platform', 'unlimited'),
    ]);

    const stats = await service.tenantSkuStats();
    // Hard-coded, not derived from the fixture: 1,010,000 of sentinel would
    // otherwise be invisible in an expression that recomputes the same sum.
    expect(stats.totalOwned).toBe(2000);
    expect(stats.totalUnallocated).toBe(200); // 2000 - 1800, prepaid only
    expect(stats.totalAllocated).toBe(1847); // 1800 + 40 + 7 — every SKU
    expect(stats.totalAssigned).toBe(1515); // 1500 + 12 + 3 — every SKU
    expect(stats.unlimitedSkus).toBe(2);
    expect(stats.skusOverAllocated).toBe(0);
  });
});
