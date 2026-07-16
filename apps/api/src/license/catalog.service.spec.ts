import { Test } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';

// A tenant subscribedSkus row (shape from GraphService.getSubscribedSkus()).
const sku = (
  skuId: string,
  part: string,
  prepaid: number,
  consumed: number,
) => ({
  skuId,
  skuPartNumber: part,
  prepaidEnabled: prepaid,
  consumedUnits: consumed,
  capabilityStatus: 'Enabled',
  appliesTo: 'User',
});

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: {
    skuCatalog: Record<string, jest.Mock>;
    tenantSkuSnapshot: Record<string, jest.Mock>;
  };
  let graph: { getSubscribedSkus: jest.Mock };

  beforeEach(async () => {
    prisma = {
      skuCatalog: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn(),
      },
      tenantSkuSnapshot: { create: jest.fn() },
    };
    graph = { getSubscribedSkus: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: GraphService, useValue: graph },
      ],
    }).compile();
    service = moduleRef.get(CatalogService);
  });

  it('creates new SKUs, updates existing without clobbering curated fields, snapshots totals', async () => {
    graph.getSubscribedSkus.mockResolvedValue([
      sku('guid-1', 'SPE_E3', 100, 80), // existing
      sku('guid-2', 'FLOW_FREE', 50, 10), // new
    ]);
    prisma.skuCatalog.findUnique
      .mockResolvedValueOnce({
        id: 'c1',
        skuId: 'guid-1',
        businessAlias: 'E3 舊名',
      })
      .mockResolvedValueOnce(null);
    prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });
    prisma.skuCatalog.create.mockResolvedValue({ id: 'c2' });

    const res = await service.syncFromTenant();

    expect(res).toEqual({
      created: 1,
      updated: 1,
      deactivated: 0,
      snapshots: 2,
    });

    // update touches only tenant-owned fields — curated columns survive.
    const updateData = prisma.skuCatalog.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('businessAlias');
    expect(updateData).not.toHaveProperty('displayName');
    expect(updateData.active).toBe(true);
    expect(updateData.skuPartNumber).toBe('SPE_E3');

    // one snapshot per SKU, carrying tenant totals.
    expect(prisma.tenantSkuSnapshot.create).toHaveBeenCalledTimes(2);
    expect(prisma.tenantSkuSnapshot.create).toHaveBeenCalledWith({
      data: { skuCatalogId: 'c1', prepaidEnabled: 100, consumedUnits: 80 },
    });
  });

  it('soft-deactivates SKUs no longer present in the tenant (never hard-deletes)', async () => {
    graph.getSubscribedSkus.mockResolvedValue([]);
    prisma.skuCatalog.updateMany.mockResolvedValue({ count: 3 });

    const res = await service.syncFromTenant();

    expect(res).toEqual({
      created: 0,
      updated: 0,
      deactivated: 3,
      snapshots: 0,
    });
    expect(prisma.skuCatalog.updateMany).toHaveBeenCalledWith({
      where: { active: true, skuId: { notIn: [] } },
      data: { active: false },
    });
  });

  // BE-graph-harden: a raw Graph error must surface as a clean 503, not crash
  // the process. Fail closed — no catalog write happens.
  it('wraps a Graph failure as 503 and writes nothing (fail-closed)', async () => {
    graph.getSubscribedSkus.mockRejectedValue(
      Object.assign(new Error('AADSTS700038: invalid application identifier'), {
        statusCode: -1,
      }),
    );

    await expect(service.syncFromTenant()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.skuCatalog.create).not.toHaveBeenCalled();
    expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
    expect(prisma.tenantSkuSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.skuCatalog.updateMany).not.toHaveBeenCalled();
  });

  // CH-003 — human curation of alias / category / base-flag. Only the curated
  // columns are writable; skuId / part number / display name stay system-owned.
  describe('updateEntry (CH-003 curation)', () => {
    it('updates only curated fields (trimmed); system-owned columns never written', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue({ id: 'c1', skuId: 'g1' });
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('c1', {
        businessAlias: '  E3 Bundle  ',
        category: 'Base',
        isBaseLicense: true,
      });

      const arg = prisma.skuCatalog.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'c1' });
      expect(arg.data).toEqual({
        businessAlias: 'E3 Bundle',
        category: 'Base',
        isBaseLicense: true,
      });
      for (const owned of ['skuId', 'skuPartNumber', 'displayName', 'active']) {
        expect(arg.data).not.toHaveProperty(owned);
      }
    });

    it('normalizes empty / whitespace alias & category to null', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('c1', { businessAlias: '', category: '   ' });

      expect(prisma.skuCatalog.update.mock.calls[0][0].data).toEqual({
        businessAlias: null,
        category: null,
      });
    });

    it('touches only supplied fields (omitted = unchanged)', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('c1', { isBaseLicense: false });

      expect(prisma.skuCatalog.update.mock.calls[0][0].data).toEqual({
        isBaseLicense: false,
      });
    });

    it('404s an unknown id and writes nothing', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.updateEntry('nope', { category: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
    });
  });
});
