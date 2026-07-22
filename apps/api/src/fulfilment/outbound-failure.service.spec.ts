import { PrismaService } from '../prisma/prisma.service';
import { OutboundFailureService } from './outbound-failure.service';

describe('OutboundFailureService', () => {
  let prisma: { outboundFailure: Record<string, jest.Mock> };
  let service: OutboundFailureService;

  beforeEach(() => {
    prisma = {
      outboundFailure: {
        create: jest.fn().mockResolvedValue({ id: 'f1' }),
        update: jest.fn().mockResolvedValue({ id: 'f1' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new OutboundFailureService(prisma as unknown as PrismaService);
  });

  const dataOf = () => prisma.outboundFailure.create.mock.calls[0][0].data;

  describe('record — whitelisting reaches the database call', () => {
    it('persists only whitelisted payload fields', async () => {
      await service.record({
        kind: 'request.submit',
        payload: {
          targetUpn: 'may.chan@rhk.ricoh.com.hk',
          opcoCode: 'RHK',
          password: 'MUST-NOT-PERSIST',
        },
        error: new Error('SN 503'),
      });

      const data = dataOf();
      expect(JSON.stringify(data)).not.toContain('MUST-NOT-PERSIST');
      expect(data.payload.targetUpn).toBe('may.chan@rhk.ricoh.com.hk');
      expect(data.lastError).toBe('SN 503');
      expect(data.status).toBe('open');
    });

    it('stores externalRef for a mirror failure and nothing for a submit one', async () => {
      await service.record({
        kind: 'request.mirror',
        payload: { targetUpn: 'a@b.com' },
        externalRef: { serviceNowSysId: 'sys-1', serviceNowNumber: 'REQ001' },
        error: new Error('db down'),
        requestId: null,
      });
      expect(dataOf().externalRef).toEqual({
        serviceNowSysId: 'sys-1',
        serviceNowNumber: 'REQ001',
      });

      prisma.outboundFailure.create.mockClear();
      await service.record({
        kind: 'request.submit',
        payload: {},
        externalRef: { serviceNowSysId: 'sys-1' },
        error: new Error('x'),
      });
      // A submit failure means nothing was created externally — carrying a
      // sysId here would undermine the very signal D3 relies on.
      expect(dataOf().externalRef).toBeUndefined();
    });
  });

  /**
   * record() runs inside a catch block that is ALREADY handling a real problem.
   * If it threw, it would replace a meaningful "ServiceNow is unavailable" with
   * a confusing database error — the operator would be told the wrong thing.
   */
  describe('record — never becomes the failure itself', () => {
    it('swallows its own database error', async () => {
      prisma.outboundFailure.create.mockRejectedValue(
        new Error('relation does not exist'),
      );

      await expect(
        service.record({
          kind: 'request.submit',
          payload: { targetUpn: 'a@b.com' },
          error: new Error('original problem'),
        }),
      ).resolves.toBeUndefined();
    });

    it('does not log the payload when recording fails (H4: it carries a UPN)', async () => {
      prisma.outboundFailure.create.mockRejectedValue(new Error('db down'));
      const spy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.record({
        kind: 'request.submit',
        payload: { targetUpn: 'may.chan@rhk.ricoh.com.hk' },
        error: new Error('original problem'),
      });

      const logged = spy.mock.calls.flat().join(' ');
      expect(logged).not.toContain('may.chan');
      expect(logged).toContain('request.submit');
    });
  });

  /**
   * I2 — a failed retry must not look like progress. "Tried 6 times and still
   * failing" is precisely the fact ADR-0010 D8 wanted visible.
   */
  describe('markAttemptFailed', () => {
    it('increments the attempt count and leaves the row open', async () => {
      await service.markAttemptFailed('f1', new Error('still down'));

      const { data } = prisma.outboundFailure.update.mock.calls[0][0];
      expect(data.attemptCount).toEqual({ increment: 1 });
      expect(data.lastError).toBe('still down');
      expect(data.status).toBeUndefined(); // stays open — never silently resolved
    });
  });

  describe('markResolved / markAbandoned / reopen', () => {
    it('records who resolved it', async () => {
      await service.markResolved('f1', 'u-admin');
      const { data } = prisma.outboundFailure.update.mock.calls[0][0];
      expect(data.status).toBe('resolved');
      expect(data.resolvedById).toBe('u-admin');
    });

    it('reopen clears the abandon so the row returns to the queue (I3)', async () => {
      await service.reopen('f1');
      const { data } = prisma.outboundFailure.update.mock.calls[0][0];
      expect(data.status).toBe('open');
      expect(data.resolvedAt).toBeNull();
      expect(data.resolvedById).toBeNull();
    });
  });
});
