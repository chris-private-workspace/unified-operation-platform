import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ReconcileService } from './reconcile.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { AuditService } from '../audit/audit.service';

const liveSku = (skuId: string, consumed: number) => ({
  skuId,
  skuPartNumber: 'SPE_E3',
  prepaidEnabled: 100,
  consumedUnits: consumed,
  capabilityStatus: 'Enabled',
  appliesTo: 'User',
});

describe('ReconcileService', () => {
  let service: ReconcileService;
  let prisma: {
    skuCatalog: Record<string, jest.Mock>;
    opcoSkuLedger: Record<string, jest.Mock>;
    driftAlert: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let graph: { getSubscribedSkus: jest.Mock };
  let audit: { log: jest.Mock; logChange: jest.Mock };

  beforeEach(async () => {
    prisma = {
      skuCatalog: { findMany: jest.fn() },
      opcoSkuLedger: { aggregate: jest.fn() },
      driftAlert: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      // W29 F2c: run the callback against the same mock so existing
      // prisma.driftAlert.* assertions keep working untouched.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    graph = { getSubscribedSkus: jest.fn() };
    audit = { log: jest.fn(), logChange: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconcileService,
        { provide: PrismaService, useValue: prisma },
        { provide: GraphService, useValue: graph },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ReconcileService);
  });

  // one active SKU 'c1'/'guid-1'; ledger sum + tenant consumed drive the case.
  const arrange = (
    consumed: number,
    ledgerSum: number | null,
    openAlert: unknown,
  ) => {
    graph.getSubscribedSkus.mockResolvedValue([liveSku('guid-1', consumed)]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      { id: 'c1', skuId: 'guid-1' },
    ]);
    prisma.opcoSkuLedger.aggregate.mockResolvedValue({
      _sum: { assignedQuantity: ledgerSum },
    });
    prisma.driftAlert.findFirst.mockResolvedValue(openAlert);
  };

  it('opens a new alert when tenant consumed exceeds ledger (delta > 0)', async () => {
    arrange(5, 3, null);
    prisma.driftAlert.count.mockResolvedValue(1);

    const res = await service.reconcile();

    expect(prisma.driftAlert.create).toHaveBeenCalledWith({
      data: {
        skuCatalogId: 'c1',
        ledgerAssignedSum: 3,
        tenantConsumed: 5,
        delta: 2,
      },
    });
    expect(prisma.driftAlert.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({
      checked: 1,
      opened: 1,
      updated: 0,
      resolved: 0,
      drift: 1,
    });
  });

  it('opens an alert when ledger exceeds tenant consumed (delta < 0)', async () => {
    arrange(2, 4, null);

    await service.reconcile();

    expect(prisma.driftAlert.create).toHaveBeenCalledWith({
      data: {
        skuCatalogId: 'c1',
        ledgerAssignedSum: 4,
        tenantConsumed: 2,
        delta: -2,
      },
    });
  });

  it('treats a null ledger sum as zero (no ledger rows yet)', async () => {
    arrange(5, null, null);

    await service.reconcile();

    expect(prisma.driftAlert.create).toHaveBeenCalledWith({
      data: {
        skuCatalogId: 'c1',
        ledgerAssignedSum: 0,
        tenantConsumed: 5,
        delta: 5,
      },
    });
  });

  it('refreshes an existing OPEN alert instead of creating a duplicate', async () => {
    arrange(5, 3, { id: 'a1', status: 'OPEN' });

    const res = await service.reconcile();

    expect(prisma.driftAlert.create).not.toHaveBeenCalled();
    expect(prisma.driftAlert.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { ledgerAssignedSum: 3, tenantConsumed: 5, delta: 2 },
    });
    expect(res).toMatchObject({ opened: 0, updated: 1 });
  });

  it('resolves the OPEN alert when the totals reconcile (delta == 0)', async () => {
    arrange(3, 3, { id: 'a1', status: 'OPEN' });

    const res = await service.reconcile();

    expect(prisma.driftAlert.create).not.toHaveBeenCalled();
    expect(prisma.driftAlert.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
    });
    expect(res).toMatchObject({ resolved: 1 });
  });

  it('does nothing when there is no drift and no existing alert (delta == 0)', async () => {
    arrange(3, 3, null);

    const res = await service.reconcile();

    expect(prisma.driftAlert.create).not.toHaveBeenCalled();
    expect(prisma.driftAlert.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ opened: 0, updated: 0, resolved: 0 });
  });

  // ADR-0008 D5 (Phase 丁): D365 licence = subscribedSku. reconcile filters SKUs
  // only on active (no SKU-type gate), so a D365 SKU drives total-layer drift
  // (Σ assigned vs tenant consumed) exactly like M365. Lock-in against a future
  // "M365 only" special-case creeping into reconcile.
  it('reconciles a D365 SKU identically — no SKU-type filter', async () => {
    graph.getSubscribedSkus.mockResolvedValue([
      {
        skuId: 'guid-d365',
        skuPartNumber: 'DYN365_ENTERPRISE_SALES',
        prepaidEnabled: 100,
        consumedUnits: 7,
        capabilityStatus: 'Enabled',
        appliesTo: 'User',
      },
    ]);
    prisma.skuCatalog.findMany.mockResolvedValue([
      { id: 'c-d365', skuId: 'guid-d365' },
    ]);
    prisma.opcoSkuLedger.aggregate.mockResolvedValue({
      _sum: { assignedQuantity: 4 },
    });
    prisma.driftAlert.findFirst.mockResolvedValue(null);

    const res = await service.reconcile();

    expect(prisma.driftAlert.create).toHaveBeenCalledWith({
      data: {
        skuCatalogId: 'c-d365',
        ledgerAssignedSum: 4,
        tenantConsumed: 7,
        delta: 3,
      },
    });
    expect(res).toMatchObject({ checked: 1, opened: 1 });
  });

  // BE-graph-harden (BUG-002 sibling): a raw Graph error while reading tenant
  // totals must surface as a clean 503, not crash the process. Fail closed — no
  // catalog read, no drift write happens.
  it('wraps a Graph failure as 503 and writes nothing (fail-closed)', async () => {
    graph.getSubscribedSkus.mockRejectedValue(
      Object.assign(new Error('AADSTS700038: invalid application identifier'), {
        statusCode: -1,
      }),
    );

    await expect(service.reconcile()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.skuCatalog.findMany).not.toHaveBeenCalled();
    expect(prisma.driftAlert.create).not.toHaveBeenCalled();
    expect(prisma.driftAlert.update).not.toHaveBeenCalled();
  });

  /**
   * W29 F2c — resolving a drift alert is decided by the code (delta hit 0), but
   * WHO set the run going is a separate question an auditor will ask
   * (Chris, 2026-07-21).
   */
  describe('audit trail', () => {
    const oneSkuReconciled = () => {
      graph.getSubscribedSkus.mockResolvedValue([liveSku('guid-1', 10)]);
      prisma.skuCatalog.findMany.mockResolvedValue([
        { id: 'c1', skuId: 'guid-1', active: true },
      ]);
      prisma.opcoSkuLedger.aggregate.mockResolvedValue({
        _sum: { assignedQuantity: 10 }, // delta 0 → resolve
      });
      prisma.driftAlert.findFirst.mockResolvedValue({
        id: 'alert-1',
        status: 'OPEN',
      });
      prisma.driftAlert.update.mockResolvedValue({
        id: 'alert-1',
        status: 'RESOLVED',
      });
    };

    it('attributes a manually triggered resolve to the operator', async () => {
      oneSkuReconciled();

      await service.reconcile('actor-1');

      expect(audit.log).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'drift.resolve',
          targetType: 'DriftAlert',
          targetId: 'alert-1',
          actorId: 'actor-1',
          actorType: 'user',
          metadata: { source: 'manual-reconcile' },
        }),
      );
    });

    // The scheduled sweep has no person behind it.
    it('attributes the scheduled sweep to the system', async () => {
      oneSkuReconciled();

      await service.reconcile(); // no actor → @Cron path

      expect(audit.log).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          actorId: null,
          actorType: 'system',
          metadata: { source: 'scheduled' },
        }),
      );
    });
  });
});
