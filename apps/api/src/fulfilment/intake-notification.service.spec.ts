import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { IntakeNotificationService } from './intake-notification.service';
import { NotificationDispatchService } from './notification-dispatch.service';

/**
 * CH-021 — who gets told, what they are told, and what is NOT written to the log.
 *
 * The adapter spec covers WHEN this runs (only on a genuine create). This file
 * covers everything after that point.
 */
describe('IntakeNotificationService (CH-021)', () => {
  let service: IntakeNotificationService;
  let prisma: {
    request: { findUnique: jest.Mock };
    appUser: { findMany: jest.Mock };
  };
  let dispatch: { send: jest.Mock };
  let config: { get: jest.Mock };

  const REQUEST = {
    id: 'r1',
    targetUpn: 'jane.doe@rhk.com',
    targetDisplayName: 'Jane Doe',
    serviceNowNumber: 'REQ0044038',
    opco: { id: 'o-rhk', code: 'RHK' },
    lineItems: [{ quantity: 1, sku: { skuPartNumber: 'SPE_E5' } }],
  };

  const env: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of Object.keys(env)) delete env[k];
    env.APP_BASE_URL = 'https://uop.example.com';

    prisma = {
      request: { findUnique: jest.fn().mockResolvedValue(REQUEST) },
      appUser: { findMany: jest.fn().mockResolvedValue([]) },
    };
    dispatch = { send: jest.fn().mockResolvedValue({ status: 'sent' }) };
    config = { get: jest.fn((key: string) => env[key]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntakeNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: NotificationDispatchService, useValue: dispatch },
      ],
    }).compile();
    service = moduleRef.get(IntakeNotificationService);
  });

  const addressesSent = () => dispatch.send.mock.calls.map((c) => c[0].to);

  describe('recipients', () => {
    /** A1 — the OpCo's own people plus the ops mailbox, both. */
    it('mails every active OPCO_IT user and the ops mailbox', async () => {
      prisma.appUser.findMany.mockResolvedValue([
        { email: 'it1@rhk.com' },
        { email: 'it2@rhk.com' },
      ]);
      env.OPS_NOTIFICATION_MAILBOX = 'ops@rci-t.com';

      await service.notifyNewIntake('r1');

      expect(addressesSent()).toEqual([
        'it1@rhk.com',
        'it2@rhk.com',
        'ops@rci-t.com',
      ]);
    });

    /**
     * 🔴 A7 — asserted on the QUERY, not by filtering afterwards. A deactivated
     * account is somebody who left; mailing them is how a notification goes to
     * nobody while the count still says it went to two.
     */
    it('scopes the query to this OpCo, this role, and active only', async () => {
      await service.notifyNewIntake('r1');

      expect(prisma.appUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'OPCO_IT', opcoScopeId: 'o-rhk', active: true },
        }),
      );
    });

    /** A5 — the ops mailbox is also an OpCo IT user, typed with other casing. */
    it('sends one mail when the ops mailbox is also an OPCO_IT user', async () => {
      prisma.appUser.findMany.mockResolvedValue([{ email: 'ops@rci-t.com' }]);
      env.OPS_NOTIFICATION_MAILBOX = 'OPS@RCI-T.com';

      await service.notifyNewIntake('r1');

      expect(addressesSent()).toEqual(['ops@rci-t.com']);
    });

    /**
     * 🔴 A4 / D3 — a real situation (24 OpCos, the seed gives only RHK an
     * OPCO_IT user), so it must not throw. But it must not pass silently
     * either: "notifications work" and "nobody is reading them" have to look
     * different from the outside.
     */
    it('warns and sends nothing when there is nobody to tell', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(service.notifyNewIntake('r1')).resolves.toBeUndefined();

      expect(dispatch.send).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('nobody'));
    });
  });

  describe('message', () => {
    beforeEach(() => {
      prisma.appUser.findMany.mockResolvedValue([{ email: 'it1@rhk.com' }]);
    });

    it('carries the target, OpCo, REQ, licences and a deep link', async () => {
      await service.notifyNewIntake('r1');

      expect(dispatch.send).toHaveBeenCalledWith({
        to: 'it1@rhk.com',
        template: 'onboarding-intake',
        params: {
          displayName: 'Jane Doe',
          targetUpn: 'jane.doe@rhk.com',
          opcoCode: 'RHK',
          reqNumber: 'REQ0044038',
          lineItems: 'SPE_E5 × 1',
          requestUrl: 'https://uop.example.com/requests/r1',
        },
      });
    });

    it('trims a trailing slash on APP_BASE_URL rather than doubling it', async () => {
      env.APP_BASE_URL = 'https://uop.example.com/';

      await service.notifyNewIntake('r1');

      expect(dispatch.send.mock.calls[0][0].params.requestUrl).toBe(
        'https://uop.example.com/requests/r1',
      );
    });

    /**
     * 🔴 Deliberately UNLIKE `password-reset`, which refuses to send at all when
     * APP_BASE_URL is unset (W41). A reset mail without its link is dead; this
     * one still says the thing it exists to say.
     */
    it('still sends without APP_BASE_URL, just with no link', async () => {
      delete env.APP_BASE_URL;

      await service.notifyNewIntake('r1');

      expect(dispatch.send).toHaveBeenCalledTimes(1);
      expect(dispatch.send.mock.calls[0][0].params.requestUrl).toBe('');
    });

    it('lists every licence line', async () => {
      prisma.request.findUnique.mockResolvedValue({
        ...REQUEST,
        lineItems: [
          { quantity: 1, sku: { skuPartNumber: 'SPE_E5' } },
          { quantity: 2, sku: { skuPartNumber: 'POWER_BI_STANDARD' } },
        ],
      });

      await service.notifyNewIntake('r1');

      expect(dispatch.send.mock.calls[0][0].params.lineItems).toBe(
        'SPE_E5 × 1, POWER_BI_STANDARD × 2',
      );
    });
  });

  describe('it never breaks the intake that called it', () => {
    /**
     * 🔴 A6. The dispatch service already swallows transport errors and queues
     * them; this asserts the OTHER half — that anything else going wrong here
     * (a failed read, a null request) also cannot turn a written onboarding
     * into a 500 that n8n will retry.
     */
    it('swallows a dispatch that throws', async () => {
      prisma.appUser.findMany.mockResolvedValue([{ email: 'it1@rhk.com' }]);
      dispatch.send.mockRejectedValue(new Error('acs exploded'));

      await expect(service.notifyNewIntake('r1')).resolves.toBeUndefined();
    });

    it('swallows a request that cannot be read back', async () => {
      prisma.request.findUnique.mockRejectedValue(new Error('db down'));

      await expect(service.notifyNewIntake('r1')).resolves.toBeUndefined();
      expect(dispatch.send).not.toHaveBeenCalled();
    });

    it('warns rather than throwing when the request is gone', async () => {
      prisma.request.findUnique.mockResolvedValue(null);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(service.notifyNewIntake('r1')).resolves.toBeUndefined();

      expect(dispatch.send).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no longer exists'),
      );
    });
  });

  /**
   * 🔴 A8 / H4 — SPY THE LOGGER, do not assert an exception message.
   *
   * BUG-004 hid for 18 days behind exactly that mistake: the existing tests
   * asserted the exception text (which was clean) while the UPN leaked into a
   * log line nobody was watching. RISK R5 turned "assert the logger" into a
   * standing requirement, and this is that requirement applied.
   *
   * The UPN is in the MESSAGE on purpose — IT staff cannot triage without it.
   * A mailbox has one known reader; a log file does not.
   */
  describe('H4 — the log line', () => {
    const EMAIL_SHAPED = /[\w.+-]+@[\w-]+\.[\w.-]+/;

    it('never writes an address or a UPN, on either the happy or empty path', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      // happy path — two recipients, both addresses, plus the target UPN
      prisma.appUser.findMany.mockResolvedValue([{ email: 'it1@rhk.com' }]);
      env.OPS_NOTIFICATION_MAILBOX = 'ops@rci-t.com';
      await service.notifyNewIntake('r1');

      // empty path — the warn branch
      prisma.appUser.findMany.mockResolvedValue([]);
      delete env.OPS_NOTIFICATION_MAILBOX;
      await service.notifyNewIntake('r1');

      const written = [...log.mock.calls, ...warn.mock.calls]
        .map((c) => String(c[0]))
        .join('\n');

      expect(written).not.toMatch(EMAIL_SHAPED);
      // ...and it is not vacuous: the lines exist and carry the safe identifiers.
      expect(written).toContain('r1');
      expect(written).toContain('RHK');
    });
  });
});
