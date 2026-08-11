import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { OutboundRetryService } from './outbound-retry.service';
import { OutboundFailureService } from './outbound-failure.service';
import { RequestSubmissionProvider } from './request-submission.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { TicketUpdateProvider } from '../integration/ticket-update/ticket-update.provider';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../integration/email/notification.service';

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

/** W40 — a RITM state repair. `transition` is what makes it repairable. */
const TICKET_CLOSE_FAILURE = {
  id: 'f-close',
  kind: 'servicenow.ticket_update',
  status: 'open',
  attemptCount: 1,
  payload: {
    snTarget: 'ritm-sys-1',
    note: 'License E3 assigned via platform.',
    transition: 'close',
  },
  externalRef: null,
};

const TICKET_HOLD_FAILURE = {
  ...TICKET_CLOSE_FAILURE,
  id: 'f-hold',
  payload: { ...TICKET_CLOSE_FAILURE.payload, transition: 'hold' },
};

describe('OutboundRetryService', () => {
  let service: OutboundRetryService;
  let prisma: any;
  let failures: any;
  let provider: { submit: jest.Mock };
  let snow: any;
  let tickets: { closeComplete: jest.Mock; markInProgress: jest.Mock };
  let notifications: { send: jest.Mock };
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
    tickets = {
      closeComplete: jest
        .fn()
        .mockResolvedValue({ status: 'updated', newState: '3' }),
      markInProgress: jest
        .fn()
        .mockResolvedValue({ status: 'updated', newState: '2' }),
    };
    // CH-011 — the abstraction, never the ACS service (email.boundary.spec).
    notifications = {
      send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 'op-1' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboundRetryService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboundFailureService, useValue: failures },
        { provide: RequestSubmissionProvider, useValue: provider },
        { provide: ServiceNowService, useValue: snow },
        { provide: TicketUpdateProvider, useValue: tickets },
        { provide: AuditService, useValue: audit },
        { provide: NotificationService, useValue: notifications },
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

  /**
   * CH-011 — repairing a notification.
   *
   * The interesting half is not "it re-sends"; it is WHAT IT REFUSES to
   * re-send. The queue row deliberately does not store template parameters
   * (ADR-0019 D8 will put a single-use reset token there), so a replay can only
   * ever re-render templates that need none. Everything else has to be refused
   * loudly, or AUTH-4c-C will ship a button that mails somebody a dead link.
   */
  describe('CH-011 — notification repairs', () => {
    const notificationFailure = (
      payload: Record<string, unknown>,
      id = 'f-mail',
    ) => ({
      id,
      kind: 'notification.send',
      status: 'open',
      payload,
      externalRef: null,
      attemptCount: 1,
      requestId: null,
    });

    it('re-sends through the abstraction — a real send, not a no-op resolve', async () => {
      failures.findById.mockResolvedValue(
        notificationFailure({
          to: 'someone.private@rci-t.com',
          template: 'connectivity-check',
        }),
      );

      await service.retry('f-mail', ADMIN);

      expect(notifications.send).toHaveBeenCalledWith({
        to: 'someone.private@rci-t.com',
        template: 'connectivity-check',
      });
      expect(failures.markResolved).toHaveBeenCalled();
    });

    /**
     * 🔴 CH-021 reworded the refusal. It used to say "its contents are
     * single-use", which was true of `password-reset` and false of the template
     * this phase added — so the assertion moved to the reason BOTH share: the
     * queue does not store parameters.
     *
     * The property the original test was protecting is unchanged and still
     * why this asserts a message rather than a type: when `password-reset`
     * became a real key the case silently moved from the unknown-template
     * branch to this one, and a bare `toThrow(BadRequestException)` would have
     * passed either way.
     */
    it.each(['password-reset', 'onboarding-intake'] as const)(
      '🔴 refuses %s — the queue never stored its parameters',
      async (template) => {
        failures.findById.mockResolvedValue(
          notificationFailure({ to: 'someone.private@rci-t.com', template }),
        );

        await expect(service.retry('f-mail', ADMIN)).rejects.toThrow(
          /does not store template parameters/,
        );
        expect(notifications.send).not.toHaveBeenCalled();
        expect(failures.markResolved).not.toHaveBeenCalled();
      },
    );

    it('refuses an unknown template rather than picking a default', async () => {
      failures.findById.mockResolvedValue(
        notificationFailure({
          to: 'someone.private@rci-t.com',
          template: 'not-a-real-template',
        }),
      );

      // Added in W41: the unknown-template branch used to be covered by the test
      // above, by accident, because 'password-reset' was not a real key yet.
      // Losing that coverage the moment 4c-C landed would have been invisible.
      await expect(service.retry('f-mail', ADMIN)).rejects.toThrow(
        /Unknown notification template/,
      );
      expect(notifications.send).not.toHaveBeenCalled();
      expect(failures.markResolved).not.toHaveBeenCalled();
    });

    it('refuses when no recipient was recorded, instead of sending nowhere', async () => {
      failures.findById.mockResolvedValue(
        notificationFailure({ template: 'connectivity-check' }),
      );

      await expect(service.retry('f-mail', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('treats "still not configured" as a failed repair, not a resolved one', async () => {
      failures.findById.mockResolvedValue(
        notificationFailure({
          to: 'someone.private@rci-t.com',
          template: 'connectivity-check',
        }),
      );
      notifications.send.mockResolvedValue({
        status: 'not_configured',
        details: 'ACS_CONNECTION_STRING is not set',
      });

      await expect(service.retry('f-mail', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(failures.markResolved).not.toHaveBeenCalled();
      expect(failures.markAttemptFailed).toHaveBeenCalled();
    });
  });

  /**
   * W40 — which repair reaches which system.
   *
   * This replaces a source check that used to live in
   * ticket-update.boundary.spec.ts ("outbound-retry must not import the seam").
   * That was true until this phase and is not any more: a ticket STATE failure
   * was produced by whichever provider is configured, so repairing it directly
   * would fix an n8n close by calling the Table API. A work note is the
   * opposite — its payload records a direct call, so replaying it directly IS
   * replaying the same thing (OQ-D).
   *
   * Once the file imports both, only behaviour can tell the two apart.
   */
  describe('W40 — ticket repairs go through the seam, work notes do not', () => {
    it('repairs a close through the provider and never through the Table API', async () => {
      failures.findById.mockResolvedValue(TICKET_CLOSE_FAILURE);

      await service.retry('f-close', ADMIN);

      expect(tickets.closeComplete).toHaveBeenCalledWith(
        { kind: 'ritm', sysId: 'ritm-sys-1' },
        'License E3 assigned via platform.',
      );
      expect(tickets.markInProgress).not.toHaveBeenCalled();
      expect(snow.updateRecord).not.toHaveBeenCalled();
      expect(snow.addWorkNote).not.toHaveBeenCalled();
    });

    it('repairs a hold with markInProgress, not close', async () => {
      failures.findById.mockResolvedValue(TICKET_HOLD_FAILURE);

      await service.retry('f-hold', ADMIN);

      expect(tickets.markInProgress).toHaveBeenCalledWith(
        { kind: 'ritm', sysId: 'ritm-sys-1' },
        expect.any(String),
      );
      expect(tickets.closeComplete).not.toHaveBeenCalled();
    });

    /**
     * CH-020 — the payload now says WHICH record the sys_id is, because a replay
     * that guesses wrong queries `request_item=<task sys_id>` and can never
     * succeed.
     *
     * The two cases above have no `targetKind` at all, which is exactly the
     * shape of every row queued before CH-020: they must keep replaying as
     * RITMs, and they do (asserted there).
     */
    it('replays a task failure as a task, not as a RITM', async () => {
      failures.findById.mockResolvedValue({
        ...TICKET_CLOSE_FAILURE,
        id: 'f-task',
        payload: {
          ...TICKET_CLOSE_FAILURE.payload,
          snTarget: 'task-sys-9',
          targetKind: 'task',
        },
      });

      await service.retry('f-task', ADMIN);

      expect(tickets.closeComplete).toHaveBeenCalledWith(
        { kind: 'task', sysId: 'task-sys-9' },
        expect.any(String),
      );
    });

    it('a work-note repair still goes direct and never touches the seam', async () => {
      failures.findById.mockResolvedValue(WORKNOTE_FAILURE);

      await service.retry('f-note', ADMIN);

      expect(snow.addWorkNote).toHaveBeenCalled();
      expect(tickets.closeComplete).not.toHaveBeenCalled();
      expect(tickets.markInProgress).not.toHaveBeenCalled();
    });

    /**
     * Closing a ticket that was only meant to go on hold is not recoverable, so
     * an unrecognised transition must fail rather than default to either one.
     */
    it('refuses an unrecognised transition instead of guessing', async () => {
      failures.findById.mockResolvedValue({
        ...TICKET_CLOSE_FAILURE,
        payload: { ...TICKET_CLOSE_FAILURE.payload, transition: 'reopen' },
      });

      await expect(service.retry('f-close', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(tickets.closeComplete).not.toHaveBeenCalled();
      expect(tickets.markInProgress).not.toHaveBeenCalled();
      expect(failures.markResolved).not.toHaveBeenCalled();
    });

    /**
     * I2 — the provider answered, but the ticket did not move (ServiceNow
     * refused the PATCH). A repair that changed nothing must not be recorded as
     * resolved.
     */
    it('treats a provider "error" outcome as a failed repair, not a resolved one', async () => {
      failures.findById.mockResolvedValue(TICKET_CLOSE_FAILURE);
      tickets.closeComplete.mockResolvedValue({
        status: 'error',
        details: 'ServiceNow returned HTTP 403',
      });

      await expect(service.retry('f-close', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(failures.markAttemptFailed).toHaveBeenCalled();
      expect(failures.markResolved).not.toHaveBeenCalled();
    });
  });
});
