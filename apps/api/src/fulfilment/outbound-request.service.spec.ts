import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { OutboundRequestService } from './outbound-request.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestSubmissionProvider } from './request-submission.provider';
import { OutboundFailureService } from './outbound-failure.service';

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
  let failures: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: { findUnique: jest.fn() },
      skuCatalog: { findUnique: jest.fn() },
      request: { create: jest.fn() },
    };
    provider = { submit: jest.fn() };
    // ADR-0011 — both failure branches queue through this.
    failures = { record: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboundRequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: RequestSubmissionProvider, useValue: provider },
        { provide: OutboundFailureService, useValue: failures },
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

  it('provider failure → clean 503 (not opaque 500), fail-closed, no local mirror', async () => {
    // BUG-003: a raw integration error ("fetch failed" / webhook down) must
    // surface as a 503 ServiceUnavailable with a meaningful message, not a raw
    // Error that Nest renders as a generic 500. Mirror is still never written.
    arrangeResolves();
    provider.submit.mockRejectedValue(new Error('fetch failed'));

    await expect(service.create(payload(), ADMIN)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  // ── ADR-0011: the outbound failure queue ──────────────────────────────
  describe('failure queue (W31)', () => {
    const submitted = {
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ0001',
      lineItems: [
        { serviceNowSysId: 'ritm-1', serviceNowNumber: 'RITM001' },
        { serviceNowSysId: 'ritm-2', serviceNowNumber: 'RITM002' },
      ],
    };

    it('queues a submit failure with NO externalRef — nothing was created', async () => {
      arrangeResolves();
      provider.submit.mockRejectedValue(new Error('fetch failed'));

      await expect(service.create(payload(), ADMIN)).rejects.toThrow(
        ServiceUnavailableException,
      );

      const entry = failures.record.mock.calls[0][0];
      expect(entry.kind).toBe('request.submit');
      expect(entry.payload.targetUpn).toBe('user@rhk.com.hk');
      // Absent externalRef is the signal that re-submitting is safe (D3).
      expect(entry.externalRef).toBeUndefined();
    });

    /**
     * The orphan case. Two things must hold: the sysIds are captured (so the
     * repair can write the mirror without touching ServiceNow), and the error
     * NAMES the ticket — D7. The old `throw err` surfaced a raw Prisma error,
     * which told the operator nothing about the real ticket now sitting in SN.
     */
    it('queues a mirror failure WITH the SN sysIds and names the ticket', async () => {
      arrangeResolves();
      provider.submit.mockResolvedValue(submitted);
      prisma.request.create.mockRejectedValue(new Error('deadlock detected'));

      await expect(service.create(payload(), ADMIN)).rejects.toThrow(
        /REQ0001 was created, but the platform could not record it/,
      );

      const entry = failures.record.mock.calls[0][0];
      expect(entry.kind).toBe('request.mirror');
      expect(entry.externalRef.serviceNowSysId).toBe('req-sys');
      expect(entry.externalRef.lineItems).toHaveLength(2);
      // The payload must still carry what the local rows need.
      expect(entry.payload.opcoCode).toBe('RHK');
      expect(entry.payload.lineItems).toHaveLength(2);
    });

    it('tells the operator NOT to submit again', async () => {
      arrangeResolves();
      provider.submit.mockResolvedValue(submitted);
      prisma.request.create.mockRejectedValue(new Error('deadlock'));

      await expect(service.create(payload(), ADMIN)).rejects.toThrow(
        /Do not submit again/,
      );
    });

    /**
     * G3 — recording must survive the failure it describes. The mirror write is
     * what failed; if the record shared its fate the queue would be empty at
     * exactly the moment it matters (D6).
     */
    it('records the mirror failure even though the local write failed', async () => {
      arrangeResolves();
      provider.submit.mockResolvedValue(submitted);
      prisma.request.create.mockRejectedValue(new Error('write failed'));

      await expect(service.create(payload(), ADMIN)).rejects.toThrow();
      expect(failures.record).toHaveBeenCalledTimes(1);
    });

    it('queues nothing on the happy path', async () => {
      arrangeResolves();
      provider.submit.mockResolvedValue(submitted);
      prisma.request.create.mockResolvedValue({ id: 'r1', lineItems: [] });

      await service.create(payload(), ADMIN);
      expect(failures.record).not.toHaveBeenCalled();
    });
  });
});
