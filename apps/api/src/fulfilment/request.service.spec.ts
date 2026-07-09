import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RequestService } from './request.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { StageService } from './stage.service';

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
      request: { findUnique: jest.fn(), create: jest.fn() },
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

      const res = await service.intake({
        targetUpn: 'new.user@rhk.com',
        opcoId: 'o1',
      });

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

      const res = await service.intake({
        targetUpn: 'new.user@rhk.com',
        opcoId: 'o1',
        serviceNowNumber: 'RITM0012345',
      });

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
        service.intake({ targetUpn: 'x@y.com', opcoId: 'nope' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('throws NotFound when the ServiceNow record is missing', async () => {
      prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
      snow.getRecordByNumber.mockResolvedValue(null);

      await expect(
        service.intake({
          targetUpn: 'x@y.com',
          opcoId: 'o1',
          serviceNowNumber: 'RITM9999999',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.request.create).not.toHaveBeenCalled();
    });
  });

  describe('addLineItem', () => {
    it('creates a REQUESTED line item with triage flag + NOTE event + recompute', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c1',
        skuPartNumber: 'SPE_E3',
      });
      prisma.requestLineItem.create.mockImplementation(({ data }) => ({
        id: 'li1',
        ...data,
      }));

      const item = await service.addLineItem('r1', {
        skuCatalogId: 'c1',
        procurementRequired: true,
      });

      expect(item).toMatchObject({
        stage: 'REQUESTED',
        quantity: 1,
        procurementRequired: true,
      });
      expect(prisma.requestEvent.create).toHaveBeenCalled();
      expect(stage.recomputeRequestStatus).toHaveBeenCalledWith('r1');
    });

    it('throws NotFound when the SKU is unknown', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.skuCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.addLineItem('r1', { skuCatalogId: 'bad' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
    });
  });
});
