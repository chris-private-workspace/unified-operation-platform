import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { AuditService } from '../audit/audit.service';

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
    $transaction: jest.Mock;
  };
  let graph: { getSubscribedSkus: jest.Mock };
  let audit: { log: jest.Mock; logChange: jest.Mock };

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
      // W29 F2c: run the callback against the same mock so existing
      // prisma.skuCatalog.* assertions keep working untouched.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    graph = { getSubscribedSkus: jest.fn() };
    audit = { log: jest.fn(), logChange: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: GraphService, useValue: graph },
        { provide: AuditService, useValue: audit },
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

      await service.updateEntry('actor-1', 'c1', {
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

      await service.updateEntry('actor-1', 'c1', {
        businessAlias: '',
        category: '   ',
      });

      expect(prisma.skuCatalog.update.mock.calls[0][0].data).toEqual({
        businessAlias: null,
        category: null,
      });
    });

    it('touches only supplied fields (omitted = unchanged)', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('actor-1', 'c1', { isBaseLicense: false });

      expect(prisma.skuCatalog.update.mock.calls[0][0].data).toEqual({
        isBaseLicense: false,
      });
    });

    it('404s an unknown id and writes nothing', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.updateEntry('actor-1', 'nope', { category: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
    });

    // W29 F2c — an alias edit silently changes how future allocation imports
    // match rows (ADR-0004), so the curation trail matters.
    it('records catalog.update with before/after in the write transaction', async () => {
      const before = { id: 'c1', businessAlias: 'Old', category: null };
      prisma.skuCatalog.findUnique.mockResolvedValue(before);
      prisma.skuCatalog.update.mockResolvedValue({
        ...before,
        businessAlias: 'New',
      });

      await service.updateEntry('actor-1', 'c1', { businessAlias: 'New' });

      expect(audit.logChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'catalog.update',
          targetType: 'SkuCatalog',
          targetId: 'c1',
          actorId: 'actor-1',
          before,
        }),
      );
    });

    it('writes no audit row when the entry does not exist', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(null);
      await expect(
        service.updateEntry('actor-1', 'nope', { category: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(audit.logChange).not.toHaveBeenCalled();
    });
  });

  // CH-019 / ADR-0023 OQ-1 — the bulk import's collision guard also runs here.
  // Guarding only the bulk path would leave a back door: one single edit could
  // create the collision that then blocks every later import.
  describe('updateEntry — business alias collision guard', () => {
    const active = { id: 'c1', skuPartNumber: 'SPE_E3', active: true };

    it('rejects an alias already held by another active SKU, and writes nothing', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(active);
      prisma.skuCatalog.findMany.mockResolvedValue([
        { id: 'c2', skuPartNumber: 'SPE_E5', businessAlias: 'E5 Bundle' },
      ]);

      await expect(
        service.updateEntry('actor-1', 'c1', { businessAlias: 'E5 Bundle' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.skuCatalog.update).not.toHaveBeenCalled();
      expect(audit.logChange).not.toHaveBeenCalled();
    });

    it('names the SKU already holding it — without listing the row being edited', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(active);
      prisma.skuCatalog.findMany.mockResolvedValue([
        { id: 'c2', skuPartNumber: 'SPE_E5', businessAlias: 'E5 Bundle' },
      ]);

      let thrown: BadRequestException | undefined;
      try {
        await service.updateEntry('actor-1', 'c1', {
          businessAlias: 'E5 Bundle',
        });
      } catch (err) {
        thrown = err as BadRequestException;
      }
      const response = thrown!.getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe('alias-collision');
      expect(response.message).toContain('SPE_E5');
      expect(response.message).not.toContain('SPE_E3');
    });

    it('allows a unique alias through (the guard is not over-broad)', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(active);
      prisma.skuCatalog.findMany.mockResolvedValue([
        { id: 'c2', skuPartNumber: 'SPE_E5', businessAlias: 'E5 Bundle' },
      ]);
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('actor-1', 'c1', {
        businessAlias: 'E3 Bundle',
      });

      expect(prisma.skuCatalog.update).toHaveBeenCalled();
    });

    // null is "not curated" — the state most of the catalog is in. Blocking it
    // would make clearing an alias impossible the moment two SKUs lacked one.
    it('never blocks clearing an alias', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(active);
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('actor-1', 'c1', { businessAlias: '' });

      expect(prisma.skuCatalog.findMany).not.toHaveBeenCalled();
      expect(prisma.skuCatalog.update).toHaveBeenCalled();
    });

    // An inactive SKU's alias takes no part in import matching
    // (allocation-import.service.ts:42-44), so it cannot collide with anything.
    it('skips the check for an inactive entry', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue({
        ...active,
        active: false,
      });
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('actor-1', 'c1', {
        businessAlias: 'E5 Bundle',
      });

      expect(prisma.skuCatalog.findMany).not.toHaveBeenCalled();
      expect(prisma.skuCatalog.update).toHaveBeenCalled();
    });

    it('does not run the check when the alias is not being edited', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue(active);
      prisma.skuCatalog.update.mockResolvedValue({ id: 'c1' });

      await service.updateEntry('actor-1', 'c1', { category: 'Base' });

      expect(prisma.skuCatalog.findMany).not.toHaveBeenCalled();
    });
  });
});
