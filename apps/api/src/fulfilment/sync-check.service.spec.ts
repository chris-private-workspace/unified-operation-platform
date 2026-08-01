import { Test } from '@nestjs/testing';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SyncCheckService } from './sync-check.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { RequestService } from './request.service';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';

// CH-015. Graph is mocked throughout (§3.4): this service's entire job is asking
// a vendor a question, so a test that hit the real tenant would be both
// forbidden and non-deterministic.

const GRAPH_USER = {
  id: 'aad-1',
  userPrincipalName: 'new.user@rhk.com',
  displayName: 'New User',
  usageLocation: 'HK',
  accountEnabled: true,
};

describe('SyncCheckService (CH-015)', () => {
  let service: SyncCheckService;
  let prisma: any;
  let tx: any;
  let graph: any;
  let requests: any;

  const ACTOR = { id: 'u1', role: 'ADMIN', opcoScopeId: null } as any;

  const request = (over: Record<string, any> = {}) => ({
    id: 'r1',
    opcoId: 'opco-rhk',
    targetUpn: 'new.user@rhk.com',
    accountCreatedAt: null,
    azureSyncedAt: null,
    ...over,
  });

  /** Assert nothing at all reached the database. Used by every non-hit path. */
  const expectNoWrites = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.request.update).not.toHaveBeenCalled();
    expect(tx.requestEvent.create).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    tx = {
      request: { update: jest.fn() },
      requestEvent: { create: jest.fn() },
    };
    prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    graph = { findUser: jest.fn() };
    requests = { getRequestDetail: jest.fn().mockResolvedValue(request()) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SyncCheckService,
        { provide: PrismaService, useValue: prisma },
        { provide: GraphService, useValue: graph },
        { provide: RequestService, useValue: requests },
      ],
    }).compile();
    service = moduleRef.get(SyncCheckService);
  });

  describe('hit — Graph has the account', () => {
    beforeEach(() => graph.findUser.mockResolvedValue(GRAPH_USER));

    it('opens the gate and says so with the ON_DEMAND message', async () => {
      const res = await service.check('r1', ACTOR);

      expect(res.status).toBe('FOUND');
      expect(res.retryAfterSeconds).toBe(0);
      expect(tx.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({
            azureSyncedAt: expect.any(Date),
          }),
        }),
      );
      // The whole point of a third message (spec §2.2): an operator reading the
      // timeline can tell a chased sync from one the cron happened to catch.
      // Asserting the constant would pass even if both constants held the same
      // string, so assert the wording that makes them different.
      expect(tx.requestEvent.create).toHaveBeenCalledWith({
        data: {
          requestId: 'r1',
          type: 'SYNC',
          message: SYNC_GATE_MESSAGE.VERIFIED_ON_DEMAND,
        },
      });
      expect(tx.requestEvent.create.mock.calls[0][0].data.message).toContain(
        'on-demand check',
      );
    });

    it('looks the user up by the request UPN', async () => {
      await service.check('r1', ACTOR);
      expect(graph.findUser).toHaveBeenCalledWith('new.user@rhk.com');
    });

    it('never overwrites an accountCreatedAt that is already known', async () => {
      const created = new Date('2026-01-01T00:00:00Z');
      requests.getRequestDetail.mockResolvedValue(
        request({ accountCreatedAt: created }),
      );

      await service.check('r1', ACTOR);

      expect(tx.request.update.mock.calls[0][0].data.accountCreatedAt).toBe(
        created,
      );
    });

    it('returns the request re-read AFTER the gate write', async () => {
      requests.getRequestDetail
        .mockResolvedValueOnce(request())
        .mockResolvedValueOnce(request({ azureSyncedAt: new Date() }));

      const res = await service.check('r1', ACTOR);

      expect(requests.getRequestDetail).toHaveBeenCalledTimes(2);
      expect((res.request as any).azureSyncedAt).not.toBeNull();
    });
  });

  describe('miss — not synced yet', () => {
    beforeEach(() => graph.findUser.mockResolvedValue(null));

    it('writes NOTHING and reports how long to wait', async () => {
      const res = await service.check('r1', ACTOR);

      expect(res.status).toBe('NOT_FOUND');
      expect(res.retryAfterSeconds).toBe(30);
      expectNoWrites();
    });

    it('is not an error — the request still comes back', async () => {
      const res = await service.check('r1', ACTOR);
      expect(res.request).toMatchObject({ id: 'r1', azureSyncedAt: null });
    });
  });

  describe('cooldown', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      graph.findUser.mockResolvedValue(null);
    });
    afterEach(() => jest.useRealTimers());

    it('a second check inside 30s makes ZERO extra Graph calls', async () => {
      await service.check('r1', ACTOR);
      expect(graph.findUser).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5_000);
      const res = await service.check('r1', ACTOR);

      expect(res.status).toBe('THROTTLED');
      expect(res.retryAfterSeconds).toBe(25);
      // The assertion that actually protects the vendor.
      expect(graph.findUser).toHaveBeenCalledTimes(1);
      expectNoWrites();
    });

    it('expires — the cooldown delays a check, it does not block it', async () => {
      await service.check('r1', ACTOR);
      jest.advanceTimersByTime(30_000);

      const res = await service.check('r1', ACTOR);

      expect(res.status).toBe('NOT_FOUND');
      expect(graph.findUser).toHaveBeenCalledTimes(2);
    });

    it('is per request — one request cooling down never blocks another', async () => {
      await service.check('r1', ACTOR);
      requests.getRequestDetail.mockResolvedValue(request({ id: 'r2' }));

      const res = await service.check('r2', ACTOR);

      expect(res.status).toBe('NOT_FOUND');
      expect(graph.findUser).toHaveBeenCalledTimes(2);
    });

    // Cooling down on failure is deliberate: a throttled or broken Graph is the
    // case where retrying hardest does the most damage.
    it('applies after a Graph failure too', async () => {
      graph.findUser.mockRejectedValue(new Error('AADSTS700016'));
      await expect(service.check('r1', ACTOR)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      graph.findUser.mockResolvedValue(null);
      const res = await service.check('r1', ACTOR);

      expect(res.status).toBe('THROTTLED');
      expect(graph.findUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('already through the gate', () => {
    it('reports FOUND without touching Graph or writing again', async () => {
      requests.getRequestDetail.mockResolvedValue(
        request({ azureSyncedAt: new Date('2026-07-01T00:00:00Z') }),
      );

      const res = await service.check('r1', ACTOR);

      expect(res.status).toBe('FOUND');
      // Re-writing would move a timestamp that is now operational history.
      expect(graph.findUser).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  describe('failure modes fail closed', () => {
    it('turns a raw Graph error into a 503, not a 500 (BUG-002)', async () => {
      graph.findUser.mockRejectedValue(new Error('socket hang up'));

      await expect(service.check('r1', ACTOR)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expectNoWrites();
    });

    // AUTH-3a is enforced by getRequestDetail, which this service calls FIRST —
    // so an out-of-scope caller never reaches Graph either.
    it('propagates the cross-OpCo 403 and never looks anyone up', async () => {
      requests.getRequestDetail.mockRejectedValue(
        new ForbiddenException('Out of OpCo scope'),
      );

      await expect(service.check('r1', ACTOR)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(graph.findUser).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });
});
