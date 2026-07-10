import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { RequestService } from './request.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { StageService } from './stage.service';

// Actors (AUTH-3a). OpCo under test = 'o1'.
const ADMIN = { id: 'admin', opcoScopeId: null } as unknown as AppUser;
const O1_IT = { id: 'o1-it', opcoScopeId: 'o1' } as unknown as AppUser;
const OTHER_IT = { id: 'ox-it', opcoScopeId: 'oX' } as unknown as AppUser;

describe('RequestService', () => {
  let service: RequestService;
  let prisma: {
    opco: Record<string, jest.Mock>;
    request: Record<string, jest.Mock>;
    skuCatalog: Record<string, jest.Mock>;
    requestLineItem: Record<string, jest.Mock>;
    requestEvent: Record<string, jest.Mock>;
  };
  let snow: { getRecordByNumber: jest.Mock };
  let stage: { recomputeRequestStatus: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: { findUnique: jest.fn() },
      request: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      skuCatalog: { findUnique: jest.fn() },
      requestLineItem: { create: jest.fn() },
      requestEvent: { create: jest.fn() },
    };
    snow = { getRecordByNumber: jest.fn() };
    stage = { recomputeRequestStatus: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: ServiceNowService, useValue: snow },
        { provide: StageService, useValue: stage },
      ],
    }).compile();
    service = moduleRef.get(RequestService);
  });

  describe('intake', () => {
    it('creates an OPEN request from a manual payload (no SN lookup)', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      prisma.request.create.mockImplementation(({ data }) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.intake(
        {
          targetUpn: 'new.user@rhk.com',
          opcoId: 'o1',
        },
        ADMIN,
      );

      expect(snow.getRecordByNumber).not.toHaveBeenCalled();
      expect(res).toMatchObject({ id: 'r1', status: 'OPEN', opcoId: 'o1' });
    });

    it('pulls + mirrors ServiceNow fields when a number is given', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      snow.getRecordByNumber.mockResolvedValue({
        sys_id: 'sys123',
        number: 'RITM0012345',
        state: '2',
        short_description: 'Onboard new hire',
      });
      prisma.request.create.mockImplementation(({ data }) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.intake(
        {
          targetUpn: 'new.user@rhk.com',
          opcoId: 'o1',
          serviceNowNumber: 'RITM0012345',
        },
        ADMIN,
      );

      expect(snow.getRecordByNumber).toHaveBeenCalledWith('RITM0012345');
      expect(res).toMatchObject({
        serviceNowSysId: 'sys123',
        serviceNowNumber: 'RITM0012345',
        serviceNowStatus: '2',
        rawRequestText: 'Onboard new hire',
      });
    });

    it('throws NotFound when the OpCo is unknown', async () => {
      prisma.opco.findUnique.mockResolvedValue(null);

      await expect(
        service.intake({ targetUpn: 'x@y.com', opcoId: 'nope' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('throws NotFound when the ServiceNow record is missing', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      snow.getRecordByNumber.mockResolvedValue(null);

      await expect(
        service.intake(
          {
            targetUpn: 'x@y.com',
            opcoId: 'o1',
            serviceNowNumber: 'RITM9999999',
          },
          ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    // AUTH-3a: OPCO_IT may only file for its own OpCo.
    it('OPCO_IT filing for another OpCo → 403, no create', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });

      await expect(
        service.intake({ targetUpn: 'x@y.com', opcoId: 'o1' }, OTHER_IT),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });
  });

  describe('addLineItem', () => {
    it('creates a REQUESTED line item with triage flag + NOTE event + recompute', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c1',
        skuPartNumber: 'SPE_E3',
      });
      prisma.requestLineItem.create.mockImplementation(({ data }) => ({
        id: 'li1',
        ...data,
      }));

      const item = await service.addLineItem(
        'r1',
        { skuCatalogId: 'c1', procurementRequired: true },
        ADMIN,
      );

      expect(item).toMatchObject({
        stage: 'REQUESTED',
        quantity: 1,
        procurementRequired: true,
      });
      expect(prisma.requestEvent.create).toHaveBeenCalled();
      expect(stage.recomputeRequestStatus).toHaveBeenCalledWith('r1');
    });

    it('throws NotFound when the SKU is unknown', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });
      prisma.skuCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'bad' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
    });

    // AUTH-3a: OPCO_IT may only add to its own OpCo's requests.
    it('OPCO_IT adding to another OpCo request → 403, no create', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'c1' }, OTHER_IT),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
    });
  });

  // AUTH-3a read scope
  describe('listRequests', () => {
    it('REGIONAL / ADMIN → no OpCo restriction (where opcoId absent)', async () => {
      await service.listRequests(ADMIN);

      const arg = prisma.request.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
    });

    it('OPCO_IT → scoped to its own OpCo (where opcoId)', async () => {
      await service.listRequests(O1_IT);

      const arg = prisma.request.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ opcoId: 'o1' });
    });
  });

  describe('getRequestDetail', () => {
    it('OPCO_IT reading its own OpCo request is allowed', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });

      await expect(
        service.getRequestDetail('r1', O1_IT),
      ).resolves.toMatchObject({ id: 'r1' });
    });

    it('OPCO_IT reading another OpCo request by id → 403 (no data leak)', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1', opcoId: 'o1' });

      await expect(service.getRequestDetail('r1', OTHER_IT)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFound when the request is missing', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.getRequestDetail('missing', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
