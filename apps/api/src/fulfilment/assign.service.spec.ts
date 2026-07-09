import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssignService } from './assign.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';

describe('AssignService', () => {
  let service: AssignService;
  let prisma: any;
  let tx: any;
  let graph: any;
  let snow: any;

  // A READY line item wired for a successful assign; individual tests tweak it.
  const readyItem = (over: Record<string, any> = {}) => ({
    id: 'li1',
    stage: 'READY',
    requestId: 'r1',
    request: {
      id: 'r1',
      targetUpn: 'new.user@rhk.com',
      opcoId: 'o1',
      azureSyncedAt: new Date(),
      serviceNowSysId: 'sys1',
      ...(over.request ?? {}),
    },
    sku: { id: 'c1', skuId: 'guid-1', skuPartNumber: 'SPE_E3' },
    ...over,
  });

  const arrangeHappy = () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
    graph.findUser.mockResolvedValue({
      id: 'aad-1',
      userPrincipalName: 'new.user@rhk.com',
      displayName: 'New User',
      usageLocation: 'HK',
      accountEnabled: true,
    });
    graph.getSubscribedSkus.mockResolvedValue([
      {
        skuId: 'guid-1',
        skuPartNumber: 'SPE_E3',
        prepaidEnabled: 100,
        consumedUnits: 80,
        capabilityStatus: 'Enabled',
        appliesTo: 'User',
      },
    ]);
    tx.requestLineItem.update.mockResolvedValue({
      id: 'li1',
      stage: 'ASSIGNED',
    });
    tx.requestLineItem.findMany.mockResolvedValue([{ stage: 'ASSIGNED' }]);
  };

  beforeEach(async () => {
    tx = {
      requestLineItem: { update: jest.fn(), findMany: jest.fn() },
      opcoSkuLedger: { upsert: jest.fn() },
      requestEvent: { create: jest.fn() },
      request: { update: jest.fn() },
    };
    prisma = {
      requestLineItem: { findUnique: jest.fn() },
      request: { findUnique: jest.fn(), update: jest.fn() },
      requestEvent: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    graph = {
      findUser: jest.fn(),
      getSubscribedSkus: jest.fn(),
      assignLicense: jest.fn().mockResolvedValue(undefined),
    };
    snow = { addWorkNote: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignService,
        { provide: PrismaService, useValue: prisma },
        { provide: GraphService, useValue: graph },
        { provide: ServiceNowService, useValue: snow },
      ],
    }).compile();
    service = moduleRef.get(AssignService);
  });

  describe('assignLineItem — happy path', () => {
    it('assigns via Graph, increments ledger, marks ASSIGNED, recomputes status, writes back to SN', async () => {
      arrangeHappy();

      await service.assignLineItem('li1');

      expect(graph.assignLicense).toHaveBeenCalledWith(
        'new.user@rhk.com',
        'guid-1',
        { usageLocation: 'HK' },
      );
      // ledger +1 via upsert increment on the compound key
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalledWith({
        where: { opcoId_skuCatalogId: { opcoId: 'o1', skuCatalogId: 'c1' } },
        create: { opcoId: 'o1', skuCatalogId: 'c1', assignedQuantity: 1 },
        update: { assignedQuantity: { increment: 1 } },
      });
      expect(tx.requestLineItem.update).toHaveBeenCalledWith({
        where: { id: 'li1' },
        data: { stage: 'ASSIGNED', assignedAt: expect.any(Date) },
      });
      // all siblings ASSIGNED → request COMPLETED
      expect(tx.request.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'COMPLETED' },
      });
      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys1',
        expect.stringContaining('SPE_E3'),
      );
    });

    it('applies a usageLocation override when the user has none', async () => {
      arrangeHappy();
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: null,
        accountEnabled: true,
      });

      await service.assignLineItem('li1', 'SG');

      expect(graph.assignLicense).toHaveBeenCalledWith(
        'new.user@rhk.com',
        'guid-1',
        { usageLocation: 'SG' },
      );
    });
  });

  describe('assignLineItem — gates fail closed', () => {
    it('rejects a non-READY line item (no Graph call, no tx)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ stage: 'QUOTING' }),
      );

      await expect(service.assignLineItem('li1')).rejects.toThrow(
        BadRequestException,
      );
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the sync gate is closed (azureSyncedAt null)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { azureSyncedAt: null } }),
      );

      await expect(service.assignLineItem('li1')).rejects.toThrow(
        BadRequestException,
      );
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when the user is not yet in Azure AD (findUser null)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue(null);

      await expect(service.assignLineItem('li1')).rejects.toThrow(
        BadRequestException,
      );
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when there is no usageLocation and no override', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: null,
        accountEnabled: true,
      });

      await expect(service.assignLineItem('li1')).rejects.toThrow(
        BadRequestException,
      );
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when the SKU has no available seats', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: 'HK',
        accountEnabled: true,
      });
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'guid-1',
          skuPartNumber: 'SPE_E3',
          prepaidEnabled: 100,
          consumedUnits: 100, // full
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      await expect(service.assignLineItem('li1')).rejects.toThrow(
        BadRequestException,
      );
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('throws NotFound when the line item is missing', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(null);

      await expect(service.assignLineItem('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignLineItem — failure isolation', () => {
    it('does not touch the ledger if Graph assignLicense throws', async () => {
      arrangeHappy();
      graph.assignLicense.mockRejectedValue(new Error('no seats'));

      await expect(service.assignLineItem('li1')).rejects.toThrow('no seats');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.opcoSkuLedger.upsert).not.toHaveBeenCalled();
    });

    it('still succeeds when the ServiceNow write-back throws (non-fatal)', async () => {
      arrangeHappy();
      snow.addWorkNote.mockRejectedValue(new Error('SN down'));

      const res = await service.assignLineItem('li1');

      expect(res).toEqual({ id: 'li1', stage: 'ASSIGNED' });
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalled(); // assign committed
    });
  });

  describe('markSynced', () => {
    it('sets azureSyncedAt + accountCreatedAt and writes a SYNC event', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        accountCreatedAt: null,
      });
      prisma.request.update.mockImplementation(({ data }: any) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.markSynced('r1');

      expect(res.azureSyncedAt).toBeInstanceOf(Date);
      expect(res.accountCreatedAt).toBeInstanceOf(Date);
      expect(prisma.requestEvent.create).toHaveBeenCalledWith({
        data: {
          requestId: 'r1',
          type: 'SYNC',
          message: expect.any(String),
        },
      });
    });

    it('throws NotFound when the request is missing', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.markSynced('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
