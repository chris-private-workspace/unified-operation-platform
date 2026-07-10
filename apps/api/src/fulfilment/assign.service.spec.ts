import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AssignService } from './assign.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';

// Actors (AUTH-3a). readyItem's request.opcoId = 'o1'.
const ADMIN = { id: 'admin', opcoScopeId: null } as unknown as AppUser;
const O1_IT = { id: 'o1-it', opcoScopeId: 'o1' } as unknown as AppUser;
const OTHER_IT = { id: 'ox-it', opcoScopeId: 'oX' } as unknown as AppUser;

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

      await service.assignLineItem('li1', undefined, ADMIN);

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

      await service.assignLineItem('li1', 'SG', ADMIN);

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

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // AUTH-3a scope gate (H5): runs before every other gate, fail-closed.
    it('OPCO_IT out of scope → 403 before any Graph call or tx', async () => {
      arrangeHappy(); // fully valid READY item in OpCo o1

      await expect(
        service.assignLineItem('li1', undefined, OTHER_IT), // scope oX != o1
      ).rejects.toThrow(ForbiddenException);
      expect(graph.findUser).not.toHaveBeenCalled();
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('OPCO_IT in its own OpCo passes the scope gate (assigns)', async () => {
      arrangeHappy();

      await service.assignLineItem('li1', undefined, O1_IT); // scope o1 == o1

      expect(graph.assignLicense).toHaveBeenCalled();
    });

    it('rejects when the sync gate is closed (azureSyncedAt null)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { azureSyncedAt: null } }),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when the user is not yet in Azure AD (findUser null)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue(null);

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
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

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
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

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('throws NotFound when the line item is missing', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(null);

      await expect(
        service.assignLineItem('missing', undefined, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignLineItem — failure isolation', () => {
    it('does not touch the ledger if Graph assignLicense throws', async () => {
      arrangeHappy();
      graph.assignLicense.mockRejectedValue(new Error('graph 500'));

      // BUG-002: a raw Graph error becomes a clean 503, not an unhandled throw.
      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.opcoSkuLedger.upsert).not.toHaveBeenCalled();
    });

    // BUG-002 regression: findUser *throws* (auth/network/throttle — not a 404
    // null) → must surface a 503, never propagate the raw MSAL error (which
    // crashes the Nest process with an invalid status code).
    it('wraps a findUser failure as 503 and touches nothing (fail-closed)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockRejectedValue(
        Object.assign(
          new Error('AADSTS700038: invalid application identifier'),
          {
            statusCode: -1,
          },
        ),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.opcoSkuLedger.upsert).not.toHaveBeenCalled();
    });

    it('still succeeds when the ServiceNow write-back throws (non-fatal)', async () => {
      arrangeHappy();
      snow.addWorkNote.mockRejectedValue(new Error('SN down'));

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      expect(res).toEqual({ id: 'li1', stage: 'ASSIGNED' });
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalled(); // assign committed
    });
  });

  describe('markSynced', () => {
    it('sets azureSyncedAt + accountCreatedAt and writes a SYNC event', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        accountCreatedAt: null,
      });
      prisma.request.update.mockImplementation(({ data }: any) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.markSynced('r1', ADMIN);

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

      await expect(service.markSynced('missing', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    // AUTH-3a scope gate: OPCO_IT can only open the gate on its own OpCo.
    it('OPCO_IT out of scope → 403, gate untouched', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        accountCreatedAt: null,
      });

      await expect(service.markSynced('r1', OTHER_IT)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.request.update).not.toHaveBeenCalled();
    });
  });
});
