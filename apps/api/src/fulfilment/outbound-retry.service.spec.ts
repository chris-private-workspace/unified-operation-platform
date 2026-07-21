import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { OutboundRetryService } from './outbound-retry.service';
import { OutboundFailureService } from './outbound-failure.service';
import { RequestSubmissionProvider } from './request-submission.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { AuditService } from '../audit/audit.service';

const ADMIN = { id: 'admin' } as unknown as AppUser;

const MIRROR_FAILURE = {
  id: 'f-mirror',
  kind: 'request.mirror',
  status: 'open',
  attemptCount: 1,
  payload: {
    targetUpn: 'user@rhk.com.hk',
    opcoCode: 'RHK',
    lineItems: [{ skuId: 'guid-e3', skuPartNumber: 'E3', quantity: 1 }],
  },
  externalRef: {
    serviceNowSysId: 'req-sys',
    serviceNowNumber: 'REQ0001',
    lineItems: [{ serviceNowSysId: 'ritm-1', serviceNowNumber: 'RITM001' }],
  },
};

const SUBMIT_FAILURE = {
  ...MIRROR_FAILURE,
  id: 'f-submit',
  kind: 'request.submit',
  externalRef: null,
};

const WORKNOTE_FAILURE = {
  id: 'f-note',
  kind: 'servicenow.worknote',
  status: 'open',
  attemptCount: 2,
  payload: {
    snTarget: 'sys-1',
    note: 'License E3 assigned.',
    table: 'sc_req_item',
  },
  externalRef: null,
};

describe('OutboundRetryService', () => {
  let service: OutboundRetryService;
  let prisma: any;
  let failures: any;
  let provider: { submit: jest.Mock };
  let snow: any;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      opco: {
        findUnique: jest.fn().mockResolvedValue({ id: 'o1', code: 'RHK' }),
      },
      skuCatalog: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'cat-1', skuId: 'guid-e3' }),
      },
      request: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'r-new', lineItems: [] }),
      },
    };
    failures = {
      findById: jest.fn(),
      markResolved: jest
        .fn()
        .mockResolvedValue({ id: 'x', status: 'resolved' }),
      markAttemptFailed: jest.fn().mockResolvedValue(undefined),
      markAbandoned: jest.fn().mockResolvedValue({ id: 'x' }),
      reopen: jest.fn().mockResolvedValue({ id: 'x' }),
    };
    provider = { submit: jest.fn() };
    snow = {
      addWorkNote: jest.fn().mockResolvedValue(undefined),
      createRecord: jest.fn(),
      updateRecord: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboundRetryService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboundFailureService, useValue: failures },
        { provide: RequestSubmissionProvider, useValue: provider },
        { provide: ServiceNowService, useValue: snow },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(OutboundRetryService);
  });

  /**
   * 🔴 G2 — the single most important test in this phase (ADR-0011 D3).
   *
   * A request.mirror failure means a REAL ticket already exists in ServiceNow.
   * Repairing it by "retrying the outbound" would open a SECOND one, and the
   * platform would have no way to tell which is authoritative. The repair must
   * be purely local.
   */
  describe('G2 — repairing a mirror failure never touches ServiceNow', () => {
    it('writes the local mirror without calling the provider or creating records', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE);

      await service.retry('f-mirror', ADMIN);

      expect(provider.submit).not.toHaveBeenCalled();
      expect(snow.createRecord).not.toHaveBeenCalled();
      expect(snow.updateRecord).not.toHaveBeenCalled();
      expect(snow.addWorkNote).not.toHaveBeenCalled();
      // …and it did do the thing it is supposed to do.
      expect(prisma.request.create).toHaveBeenCalled();
    });

    it('reuses the sysIds recorded at failure time, inventing nothing', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE);

      await service.retry('f-mirror', ADMIN);

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.serviceNowSysId).toBe('req-sys');
      expect(data.serviceNowNumber).toBe('REQ0001');
      expect(data.lineItems.create[0].serviceNowSysId).toBe('ritm-1');
    });

    /**
     * Without a recorded sysId there is no safe repair: writing a mirror would
     * invent a link, and re-submitting would duplicate the ticket. Refusing is
     * the only honest option.
     */
    it('refuses rather than guessing when the SN reference is missing', async () => {
      failures.findById.mockResolvedValue({
        ...MIRROR_FAILURE,
        externalRef: null,
      });

      await expect(service.retry('f-mirror', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(provider.submit).not.toHaveBeenCalled();
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('is idempotent — an already-written mirror is not duplicated', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE);
      prisma.request.findUnique.mockResolvedValue({ id: 'r-existing' });

      await service.retry('f-mirror', ADMIN);

      expect(prisma.request.create).not.toHaveBeenCalled();
      expect(failures.markResolved).toHaveBeenCalled();
    });
  });

  describe('repairing a submit failure', () => {
    it('DOES call the provider — nothing was created the first time', async () => {
      failures.findById.mockResolvedValue(SUBMIT_FAILURE);
      provider.submit.mockResolvedValue({
        serviceNowSysId: 'new-sys',
        serviceNowNumber: 'REQ0009',
        lineItems: [{ serviceNowSysId: 'ritm-9', serviceNowNumber: 'RITM009' }],
      });

      await service.retry('f-submit', ADMIN);

      expect(provider.submit).toHaveBeenCalledTimes(1);
      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.serviceNowSysId).toBe('new-sys');
    });
  });

  describe('repairing a work-note failure', () => {
    it('re-sends the note (idempotent — a duplicate note is harmless)', async () => {
      failures.findById.mockResolvedValue(WORKNOTE_FAILURE);

      await service.retry('f-note', ADMIN);

      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys-1',
        'License E3 assigned.',
        'sc_req_item',
      );
      expect(provider.submit).not.toHaveBeenCalled();
    });
  });

  /** I2 — a failed repair must not look like progress. */
  describe('a repair that fails again', () => {
    it('increments the attempt count and does NOT resolve the row', async () => {
      failures.findById.mockResolvedValue(SUBMIT_FAILURE);
      provider.submit.mockRejectedValue(new Error('still down'));

      await expect(service.retry('f-submit', ADMIN)).rejects.toThrow(
        'still down',
      );

      expect(failures.markAttemptFailed).toHaveBeenCalledWith(
        'f-submit',
        expect.any(Error),
      );
      expect(failures.markResolved).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled(); // nothing was repaired
    });
  });

  describe('audit (D8)', () => {
    it('records a successful repair', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE);

      await service.retry('f-mirror', ADMIN);

      const entry = audit.log.mock.calls[0][1];
      expect(entry.action).toBe('outbound.retry');
      expect(entry.targetType).toBe('OutboundFailure');
      expect(entry.actorId).toBe('admin');
    });

    it('records an abandon — "decided not to repair" is a decision too', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE);

      await service.abandon('f-mirror', ADMIN);

      const entry = audit.log.mock.calls[0][1];
      expect(entry.action).toBe('outbound.abandon');
      expect(entry.metadata.reason).toMatch(/abandoned request\.mirror/);
    });

    /**
     * The failure payload carries a UPN and lives in a table readable by
     * ADMIN + REGIONAL; the audit trail is ADMIN-only. Copying the payload
     * across would duplicate PII into a differently-permissioned table.
     */
    it('does not copy the failure payload into the audit row', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE);

      await service.retry('f-mirror', ADMIN);

      const serialised = JSON.stringify(audit.log.mock.calls[0][1]);
      expect(serialised).not.toContain('user@rhk.com.hk');
    });
  });

  describe('guards', () => {
    it('404 for an unknown failure', async () => {
      failures.findById.mockResolvedValue(null);
      await expect(service.retry('nope', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to repair an already-resolved failure', async () => {
      failures.findById.mockResolvedValue({
        ...MIRROR_FAILURE,
        status: 'resolved',
      });
      await expect(service.retry('f-mirror', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('only an abandoned failure can be reopened (I3)', async () => {
      failures.findById.mockResolvedValue(MIRROR_FAILURE); // status: open
      await expect(service.reopen('f-mirror', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
