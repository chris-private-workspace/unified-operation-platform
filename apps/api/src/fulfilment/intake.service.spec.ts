import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IntakeService } from './intake.service';
import { PrismaService } from '../prisma/prisma.service';
import type { N8nIntakeRequestDto } from './dto/n8n-intake.dto';

const REQ_SYS = 'req-sys-1';

// Full representative n8n push (AGENDA-locked shape): REQ + per-line RITM + sync gate.
const basePayload = (): N8nIntakeRequestDto => ({
  targetUpn: 'new.user@rhk.com',
  opcoCode: 'RHK',
  serviceNowSysId: REQ_SYS,
  serviceNowNumber: 'REQ0012345',
  accountCreatedAt: '2026-07-15T07:30:00.000Z',
  azureSyncedAt: '2026-07-15T08:00:00.000Z',
  lineItems: [
    {
      skuId: 'guid-e3',
      quantity: 1,
      serviceNowRitmSysId: 'ritm-sys-1',
      serviceNowRitmNumber: 'RITM0012345',
    },
  ],
});

describe('IntakeService', () => {
  let service: IntakeService;
  let prisma: {
    request: Record<string, jest.Mock>;
    opco: Record<string, jest.Mock>;
    skuCatalog: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      request: { findUnique: jest.fn(), create: jest.fn() },
      opco: { findUnique: jest.fn() },
      skuCatalog: { findUnique: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [IntakeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(IntakeService);
  });

  it('builds a Request + line-item mirror with REQ/RITM + sync gate', async () => {
    prisma.request.findUnique.mockResolvedValue(null);
    prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
    prisma.skuCatalog.findUnique.mockResolvedValue({
      id: 'c-e3',
      skuId: 'guid-e3',
      active: true,
    });
    prisma.request.create.mockImplementation(({ data }) => ({
      id: 'r1',
      ...data,
      lineItems: [],
    }));

    const res = await service.intake(basePayload());

    expect(res).toMatchObject({ id: 'r1' });
    const { data } = prisma.request.create.mock.calls[0][0];
    // parent REQ + unassigned queue + OPEN
    expect(data).toMatchObject({
      opcoId: 'o1',
      status: 'OPEN',
      handledById: null,
      serviceNowSysId: REQ_SYS,
      serviceNowNumber: 'REQ0012345',
    });
    // sync gate: ISO string → Date
    expect(data.azureSyncedAt).toBeInstanceOf(Date);
    expect(data.accountCreatedAt).toBeInstanceOf(Date);
    // nested line item: resolved SKU (GUID→catalog id) + RITM + REQUESTED
    expect(data.lineItems.create[0]).toMatchObject({
      skuCatalogId: 'c-e3',
      quantity: 1,
      stage: 'REQUESTED',
      serviceNowSysId: 'ritm-sys-1',
      serviceNowNumber: 'RITM0012345',
    });
  });

  it('is idempotent: existing REQ sysId → returns existing, no create', async () => {
    prisma.request.findUnique.mockResolvedValue({
      id: 'r-existing',
      lineItems: [],
    });

    const res = await service.intake(basePayload());

    expect(res).toMatchObject({ id: 'r-existing' });
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('throws NotFound for an unknown OpCo code, no create', async () => {
    prisma.request.findUnique.mockResolvedValue(null);
    prisma.opco.findUnique.mockResolvedValue(null);

    await expect(service.intake(basePayload())).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('throws BadRequest for an unknown SKU, no create', async () => {
    prisma.request.findUnique.mockResolvedValue(null);
    prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
    prisma.skuCatalog.findUnique.mockResolvedValue(null);

    await expect(service.intake(basePayload())).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive SKU (curation-as-scope), no create', async () => {
    prisma.request.findUnique.mockResolvedValue(null);
    prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
    prisma.skuCatalog.findUnique.mockResolvedValue({
      id: 'c-e3',
      skuId: 'guid-e3',
      active: false,
    });

    await expect(service.intake(basePayload())).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('concurrent retry racing past the pre-check → P2002 returns existing', async () => {
    // 1st pre-check: null (not created yet). create() throws unique violation.
    // Re-fetch after the race returns the row the other push created.
    prisma.request.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'r-raced', lineItems: [] });
    prisma.opco.findUnique.mockResolvedValue({ id: 'o1', code: 'RHK' });
    prisma.skuCatalog.findUnique.mockResolvedValue({
      id: 'c-e3',
      skuId: 'guid-e3',
      active: true,
    });
    prisma.request.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const res = await service.intake(basePayload());

    expect(res).toMatchObject({ id: 'r-raced' });
  });
});
