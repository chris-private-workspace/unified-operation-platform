import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { OutboundRequestService } from './outbound-request.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestSubmissionProvider } from './request-submission.provider';

// Actors (AUTH-3a). OpCo under test = 'o1'.
const ADMIN = { id: 'admin', opcoScopeId: null } as unknown as AppUser;
const OTHER_IT = { id: 'ox-it', opcoScopeId: 'oX' } as unknown as AppUser;

const payload = () => ({
  targetUpn: 'user@rhk.com.hk',
  opcoCode: 'RHK',
  remark: 'need e3',
  lineItems: [
    { skuId: 'guid-e3', quantity: 1 },
    { skuId: 'guid-p1', quantity: 2 },
  ],
});

describe('OutboundRequestService', () => {
  let service: OutboundRequestService;
  let prisma: {
    opco: Record<string, jest.Mock>;
    skuCatalog: Record<string, jest.Mock>;
    request: Record<string, jest.Mock>;
  };
  let provider: { submit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: { findUnique: jest.fn() },
      skuCatalog: { findUnique: jest.fn() },
      request: { create: jest.fn() },
    };
    provider = { submit: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboundRequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: RequestSubmissionProvider, useValue: provider },
      ],
    }).compile();
    service = moduleRef.get(OutboundRequestService);
  });

  const arrangeResolves = () => {
    prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
    prisma.skuCatalog.findUnique.mockImplementation(
      ({ where }: { where: { skuId: string } }) => ({
        id: `cat-${where.skuId}`,
        skuId: where.skuId,
        skuPartNumber: where.skuId.toUpperCase(),
        active: true,
      }),
    );
  };

  it('creates the SN ticket via provider, then a two-level mirror with origin', async () => {
    arrangeResolves();
    provider.submit.mockResolvedValue({
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ0001',
      lineItems: [
        {
          skuId: 'guid-e3',
          quantity: 1,
          serviceNowSysId: 'ritm-1',
          serviceNowNumber: 'RITM0001',
        },
        {
          skuId: 'guid-p1',
          quantity: 2,
          serviceNowSysId: 'ritm-2',
          serviceNowNumber: 'RITM0002',
        },
      ],
    });
    prisma.request.create.mockImplementation(({ data }) => ({
      id: 'r1',
      ...data,
    }));

    const res = await service.create(payload(), ADMIN);

    // provider called with resolved lines (incl. skuPartNumber)
    expect(provider.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUpn: 'user@rhk.com.hk',
        opcoCode: 'RHK',
        lineItems: [
          { skuId: 'guid-e3', skuPartNumber: 'GUID-E3', quantity: 1 },
          { skuId: 'guid-p1', skuPartNumber: 'GUID-P1', quantity: 2 },
        ],
      }),
    );
    // mirror: parent REQ + origin=platform-created + unassigned + OPEN
    const { data } = prisma.request.create.mock.calls[0][0];
    expect(data).toMatchObject({
      opcoId: 'o1',
      status: 'OPEN',
      origin: 'platform-created',
      handledById: null,
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ0001',
    });
    // each line's RITM zipped by index onto the resolved catalog id
    expect(data.lineItems.create).toEqual([
      {
        skuCatalogId: 'cat-guid-e3',
        quantity: 1,
        stage: 'REQUESTED',
        serviceNowSysId: 'ritm-1',
        serviceNowNumber: 'RITM0001',
      },
      {
        skuCatalogId: 'cat-guid-p1',
        quantity: 2,
        stage: 'REQUESTED',
        serviceNowSysId: 'ritm-2',
        serviceNowNumber: 'RITM0002',
      },
    ]);
    expect(res).toMatchObject({ id: 'r1' });
  });

  it('OPCO_IT out of scope → 403 BEFORE any SN write or local create', async () => {
    arrangeResolves();

    await expect(service.create(payload(), OTHER_IT)).rejects.toThrow(
      ForbiddenException,
    );
    expect(provider.submit).not.toHaveBeenCalled();
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('unknown OpCo code → 404, no SN write', async () => {
    prisma.opco.findUnique.mockResolvedValue(null);

    await expect(service.create(payload(), ADMIN)).rejects.toThrow(
      NotFoundException,
    );
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it('unknown / inactive SKU → 400, no SN write', async () => {
    prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
    prisma.skuCatalog.findUnique.mockResolvedValue(null);

    await expect(service.create(payload(), ADMIN)).rejects.toThrow(
      BadRequestException,
    );
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it('ServiceNow create fails → fail-closed, no local mirror', async () => {
    arrangeResolves();
    provider.submit.mockRejectedValue(new Error('SN down'));

    await expect(service.create(payload(), ADMIN)).rejects.toThrow('SN down');
    expect(prisma.request.create).not.toHaveBeenCalled();
  });
});
