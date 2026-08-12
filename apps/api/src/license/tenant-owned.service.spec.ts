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

/**
 * CH-027 / ADR-0033 — a snapshot in the state the migration leaves existing
 * rows in: three new buckets at 0, capabilityStatus 'Enabled'.
 *
 * 🔴 This IS acceptance B2. Every pre-CH-027 expectation below keeps its exact
 * number through this helper, which is the proof that `owned` does not move for
 * anyone until a fresh sync writes real values (D6).
 */
const snap = (
  skuCatalogId: string,
  prepaidEnabled: number,
  consumedUnits: number,
  extra: Partial<{
    suspendedUnits: number;
    warningUnits: number;
    lockedOutUnits: number;
    capabilityStatus: string;
  }> = {},
) => ({
  skuCatalogId,
  prepaidEnabled,
  suspendedUnits: 0,
  warningUnits: 0,
  lockedOutUnits: 0,
  consumedUnits,
  capabilityStatus: 'Enabled',
  ...extra,
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
      snap('sku-e3', 2000, 1500),
      snap('sku-e3', 999, 1), // older → ignored
      snap('sku-e1', 100, 90),
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
      snap('sku-e3', 2000, 1500),
      snap('sku-e1', 100, 90),
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
      totalConsumed: 1590, // CH-028 — 1500 + 90, from the snapshots
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
      snap('sku-d365', 500, 300),
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
      totalConsumed: 0,
      totalUnallocated: 0,
      skusOverAllocated: 0,
      unlimitedSkus: 0,
    });
  });

  /**
   * CH-028 D3 — a SKU that is allocated but was never synced carries
   * tenantConsumed: null, and null is NOT a measurement of zero. A total has to
   * be a number, so it simply does not contribute — but that softness is stated
   * in the DTO rather than left for a reader to discover, and this pins it.
   */
  it('counts a never-synced SKU as nothing in totalConsumed (not as zero usage)', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      snap('sku-e3', 2000, 1500),
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-x',
        _sum: { allocatedQuantity: 50, assignedQuantity: 10 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-e3', 'SPE_E3'),
      cat('sku-x', 'ADDON'),
    ]);

    const rows = await service.listTenantSkus();
    const stats = await service.tenantSkuStats();

    // Both rows are present — sku-x qualifies on ledger alone — so the total is
    // being taken over two rows, one of which has nothing to contribute.
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.skuCatalogId === 'sku-x')!.tenantConsumed).toBe(
      null,
    );
    expect(stats.totalConsumed).toBe(1500);
  });

  // ── CH-026 / ADR-0032 ────────────────────────────────────────────────────
  // Numbers taken from the live tenant snapshot recorded in the ADR: the
  // sentinel is 1000000 (NOT the 10000000 first assumed), and POWER_BI_STANDARD
  // really is at 3064 in use against it.

  it('reports an unlimited SKU without deriving anything from the sentinel', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      snap('sku-pbi', 1000000, 3064),
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
      // VIVA's real live shape: enabled 0, seats sitting in `suspended` because
      // the subscription was CANCELLED — nothing assignable, so the flag stands.
      snap('sku-viva', 0, 30, {
        suspendedUnits: 50,
        capabilityStatus: 'Suspended',
      }),
      // 0 owned AND nobody using it is an ordinary empty SKU, not this state.
      snap('sku-idle', 0, 0),
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-viva', 'VIVA'),
      cat('sku-idle', 'IDLE_SKU'),
    ]);

    const rows = await service.listTenantSkus();
    const byId = Object.fromEntries(rows.map((r) => [r.skuCatalogId, r]));
    expect(byId['sku-viva']).toMatchObject({
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

  // ── CH-027 / ADR-0033 ────────────────────────────────────────────────────
  // Shapes taken verbatim from the 2026-08-12 read-only /subscribedSkus probe.

  /** Acceptance E1 — the headline number, on the SKU that moves the most. */
  it('counts grace-period seats in owned (SPE_E3: 21 enabled + 4477 warning)', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      snap('sku-e3', 21, 677, { warningUnits: 4477 }),
    ]);
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-e3',
        _sum: { allocatedQuantity: 700, assignedQuantity: 650 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([cat('sku-e3', 'SPE_E3')]);

    const [row] = await service.listTenantSkus();

    // 4498 spelled out, not 21 + 4477 recomputed: an expectation that redoes the
    // implementation's arithmetic passes no matter what the implementation is.
    expect(row.owned).toBe(4498);
    expect(row.unallocated).toBe(3798);
    // Before CH-027 this row read owned 21 against 700 allocated — a phantom
    // over-allocation nobody could have acted on.
    expect(row.overAllocated).toBe(false);
    expect(row.noPrepaidSeats).toBe(false);
  });

  /** Acceptance E2 — the breakdown is mandatory, not decorative (D2). */
  it('publishes the breakdown behind owned, capabilityStatus included', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      snap('sku-e3', 21, 677, {
        warningUnits: 4477,
        suspendedUnits: 3,
        lockedOutUnits: 5,
        capabilityStatus: 'Warning',
      }),
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([cat('sku-e3', 'SPE_E3')]);

    const [row] = await service.listTenantSkus();

    expect(row.ownedBreakdown).toEqual({
      enabled: 21,
      warning: 4477,
      suspended: 3,
      lockedOut: 5,
      capabilityStatus: 'Warning',
    });
    // The two excluded buckets are visible but NOT in the total.
    expect(row.owned).toBe(4498);
  });

  it('leaves ownedBreakdown null for a SKU that was never synced', async () => {
    prisma.opcoSkuLedger.groupBy.mockResolvedValue([
      {
        skuCatalogId: 'sku-x',
        _sum: { allocatedQuantity: 50, assignedQuantity: 10 },
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([cat('sku-x', 'ADDON')]);

    const [row] = await service.listTenantSkus();

    // null, not a row of zeroes: zeroes would claim we measured and found none.
    expect(row.ownedBreakdown).toBeNull();
    expect(row.owned).toBeNull();
  });

  /**
   * Acceptance G1 — the narrowing, both sides of it. POWER_BI_PRO and VIVA both
   * report enabled 0 and both were flagged before CH-027; only one of them
   * actually has nothing to assign.
   */
  it('narrows noPrepaidSeats to SKUs with no assignable seats at all', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      // Subscription LAPSED — 790 seats still usable. Was flagged, must not be.
      snap('sku-pbipro', 0, 91, { warningUnits: 790 }),
      // Subscription CANCELLED — still flagged, and now for the right reason.
      snap('sku-viva', 0, 30, {
        suspendedUnits: 50,
        capabilityStatus: 'Suspended',
      }),
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-pbipro', 'POWER_BI_PRO'),
      cat('sku-viva', 'VIVA'),
    ]);

    const rows = await service.listTenantSkus();
    const byId = Object.fromEntries(rows.map((r) => [r.skuCatalogId, r]));

    expect(byId['sku-pbipro'].noPrepaidSeats).toBe(false);
    expect(byId['sku-pbipro'].owned).toBe(790);
    expect(byId['sku-viva'].noPrepaidSeats).toBe(true);
    expect(byId['sku-viva'].owned).toBe(0);
    // Acceptance G2's source: the label reads Microsoft's verdict, it does not
    // infer "cancelled" from suspended > 0.
    expect(byId['sku-viva'].ownedBreakdown?.capabilityStatus).toBe('Suspended');
  });

  it('keeps unlimited SKUs out of the grace-period arithmetic entirely', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      snap('sku-pbi', 1000000, 3064, { warningUnits: 12 }),
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      cat('sku-pbi', 'POWER_BI_STANDARD', 'Power Platform', 'unlimited'),
    ]);

    const [row] = await service.listTenantSkus();

    // owned is still the sum — the read-model reports what the tenant said —
    // but every DERIVATION stays suppressed exactly as ADR-0032 D3 left it.
    expect(row.owned).toBe(1000012);
    expect(row.unallocated).toBeNull();
    expect(row.overAllocated).toBe(false);
    expect(row.noPrepaidSeats).toBe(false);
  });

  it('excludes unlimited SKUs from the owned totals but not from allocated / assigned', async () => {
    prisma.tenantSkuSnapshot.findMany.mockResolvedValue([
      snap('sku-e3', 2000, 1500),
      snap('sku-pbi', 1000000, 3064),
      snap('sku-flow', 10000, 4525),
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
    /**
     * CH-028 D3 — the point of the whole decision, in one number: consumption
     * is counted on the unlimited rows too. 4,525 of this 9,089 is FLOW_FREE
     * alone, and a prepaid-only scope would have silently dropped it while the
     * per-category subtotals below kept counting it.
     */
    expect(stats.totalConsumed).toBe(9089); // 1500 + 3064 + 4525 — every SKU
    expect(stats.unlimitedSkus).toBe(2);
    expect(stats.skusOverAllocated).toBe(0);
  });
});
