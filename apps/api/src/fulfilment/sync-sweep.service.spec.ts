import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncSweepService } from './sync-sweep.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import {
  AmbiguousServiceNowUserError,
  ServiceNowService,
} from '../integration/servicenow/servicenow.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, pickAuditFields } from '../audit/audit-fields';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';

// W37 / ADR-0015. Graph is mocked throughout (§3.4) — the sweep's whole job is
// asking a vendor a question, so a test that hit the real tenant would be both
// forbidden and non-deterministic.

const GRAPH_USER = {
  id: 'aad-1',
  userPrincipalName: 'new.user@rhk.com',
  displayName: 'New User',
  usageLocation: 'HK',
  accountEnabled: true,
};

describe('SyncSweepService (ADR-0015)', () => {
  let service: SyncSweepService;
  let prisma: any;
  let tx: any;
  let graph: any;
  let snow: any;
  let audit: any;
  let env: Record<string, string | undefined>;

  const candidate = (over: Record<string, any> = {}) => ({
    id: 'r1',
    targetUpn: 'new.user@rhk.com',
    accountCreatedAt: null,
    azureSyncedAt: null,
    /**
     * ADR-0025 D4 — gate ② defaults ALREADY OPEN, so every test written before
     * W43 keeps exercising gate ① alone and nothing else. The gate-② tests set
     * this to null explicitly, which also makes them self-documenting.
     */
    serviceNowUserSyncedAt: new Date(),
    ...over,
  });

  /** Build the service with the current `env` bag (read in the constructor). */
  async function build() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SyncSweepService,
        { provide: PrismaService, useValue: prisma },
        { provide: GraphService, useValue: graph },
        { provide: ServiceNowService, useValue: snow },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    return moduleRef.get(SyncSweepService);
  }

  beforeEach(async () => {
    env = {};
    tx = {
      request: { update: jest.fn() },
      requestEvent: { create: jest.fn() },
    };
    prisma = {
      request: { findMany: jest.fn().mockResolvedValue([]) },
      requestLineItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    graph = { findUser: jest.fn() };
    snow = {
      findUserSysIdByEmail: jest.fn(),
      addWorkNote: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = await build();
  });

  describe('candidate selection (D2)', () => {
    it('applies all four conditions, oldest first, capped at the batch size', async () => {
      await service.sweep();

      const args = prisma.request.findMany.mock.calls[0][0];
      // ADR-0025 D4 — no longer "gate ① shut" but "EITHER gate shut", so a
      // request that cleared Azure but not ServiceNow is still swept.
      expect(args.where.OR).toEqual([
        { azureSyncedAt: null },
        { serviceNowUserSyncedAt: null },
      ]);
      expect(args.where.status).toEqual({ in: ['OPEN', 'IN_PROGRESS'] });
      // "at least one line item still waiting" — a request whose lines are all
      // assigned/cancelled has nothing left for the gate to unblock.
      expect(args.where.lineItems).toEqual({
        some: { stage: { notIn: ['ASSIGNED', 'CANCELLED'] } },
      });
      expect(args.where.createdAt.gt).toBeInstanceOf(Date);
      expect(args.orderBy).toEqual({ createdAt: 'asc' });
      expect(args.take).toBe(50);
    });

    it('honours SYNC_SWEEP_BATCH and SYNC_SWEEP_MAX_AGE_DAYS', async () => {
      env = { SYNC_SWEEP_BATCH: '5', SYNC_SWEEP_MAX_AGE_DAYS: '1' };
      service = await build();

      await service.sweep();

      const args = prisma.request.findMany.mock.calls[0][0];
      expect(args.take).toBe(5);
      // 1 day back, give or take the few ms since the call.
      const ageMs = Date.now() - args.where.createdAt.gt.getTime();
      expect(ageMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(ageMs).toBeLessThan(25 * 60 * 60 * 1000);
    });

    // Junk in the env must not silently become `take: NaN`, which Prisma would
    // either reject or (worse) treat as no limit.
    it('falls back to the defaults on junk env values', async () => {
      env = { SYNC_SWEEP_BATCH: 'abc', SYNC_SWEEP_MAX_AGE_DAYS: '-3' };
      service = await build();

      await service.sweep();

      expect(prisma.request.findMany.mock.calls[0][0].take).toBe(50);
    });
  });

  describe('D7 — idle costs the vendor nothing', () => {
    /**
     * The load-bearing test for ADR-0015 D7, which is what makes this job
     * different from the liveness polling ADR-0010 D5 forbids. Asserting only
     * "it did not crash" would pass even if the sweep called Graph on every
     * tick forever.
     */
    it('makes ZERO Graph calls when nothing is waiting', async () => {
      prisma.request.findMany.mockResolvedValue([]);

      const result = await service.sweep();

      expect(graph.findUser).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 0, opened: 0, snOpened: 0 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('SYNC_SWEEP_ENABLED=false short-circuits before even reading the DB', async () => {
      env = { SYNC_SWEEP_ENABLED: 'false' };
      service = await build();

      const result = await service.sweep();

      expect(prisma.request.findMany).not.toHaveBeenCalled();
      expect(graph.findUser).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 0, opened: 0, snOpened: 0 });
    });

    // Default-on: an unset (or misspelled) flag must leave the sweep running.
    it('stays enabled for any value other than the literal "false"', async () => {
      for (const value of [undefined, 'true', 'TRUE', 'yes', '']) {
        env = { SYNC_SWEEP_ENABLED: value };
        service = await build();
        prisma.request.findMany.mockClear();

        await service.sweep();

        expect(prisma.request.findMany).toHaveBeenCalled();
      }
    });
  });

  describe('hit — opens the gate', () => {
    beforeEach(() => {
      prisma.request.findMany.mockResolvedValue([candidate()]);
      graph.findUser.mockResolvedValue(GRAPH_USER);
    });

    it('sets azureSyncedAt and writes a SYNC event, atomically', async () => {
      const result = await service.sweep();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.request.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          azureSyncedAt: expect.any(Date),
          accountCreatedAt: expect.any(Date),
        },
      });
      expect(tx.requestEvent.create).toHaveBeenCalledWith({
        data: {
          requestId: 'r1',
          type: 'SYNC',
          message: SYNC_GATE_MESSAGE.VERIFIED,
        },
      });
      expect(result).toEqual({ scanned: 1, opened: 1, snOpened: 0 });
    });

    /**
     * `??` not `=`. Overwriting a known creation time with "whenever the cron
     * noticed" destroys the one number that shows how long Entra Connect
     * actually took — which ADR-0015 lists as a deliverable of this phase.
     */
    it('never overwrites an accountCreatedAt that is already known', async () => {
      const created = new Date('2026-07-01T00:00:00Z');
      prisma.request.findMany.mockResolvedValue([
        candidate({ accountCreatedAt: created }),
      ]);

      await service.sweep();

      expect(tx.request.update.mock.calls[0][0].data.accountCreatedAt).toBe(
        created,
      );
    });

    it('processes every candidate in the batch', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1' }),
        candidate({ id: 'r2' }),
        candidate({ id: 'r3' }),
      ]);

      const result = await service.sweep();

      expect(graph.findUser).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ scanned: 3, opened: 3, snOpened: 0 });
    });
  });

  describe('miss — not synced yet', () => {
    it('writes nothing at all and leaves the request for the next round', async () => {
      prisma.request.findMany.mockResolvedValue([candidate()]);
      graph.findUser.mockResolvedValue(null);

      const result = await service.sweep();

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 1, opened: 0, snOpened: 0 });
    });

    it('a miss does not stop the rest of the batch', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1' }),
        candidate({ id: 'r2' }),
      ]);
      graph.findUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(GRAPH_USER);

      const result = await service.sweep();

      expect(result).toEqual({ scanned: 2, opened: 1, snOpened: 0 });
    });
  });

  describe('D6 — Graph failure never becomes a dead process', () => {
    /**
     * 🔴 The reason D6 exists. An exception escaping a @Cron handler is an
     * unhandled rejection, and BUG-002 already proved that kills the Nest
     * process. A sweep that takes the API down every time Graph throttles is
     * far worse than a sweep that does nothing.
     */
    it('does not throw when Graph fails', async () => {
      prisma.request.findMany.mockResolvedValue([candidate()]);
      graph.findUser.mockRejectedValue(new Error('AADSTS500011: throttled'));

      await expect(service.sweep()).resolves.toEqual({
        scanned: 0,
        opened: 0,
        snOpened: 0,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * Aborts the ROUND, not just the request. Asserting only "it didn't throw"
     * would pass an implementation that swallows the error and keeps hammering
     * a Graph that is already refusing us — which is how a throttle becomes a
     * lockout.
     */
    it('aborts the whole round — the next candidate is never looked up', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1' }),
        candidate({ id: 'r2' }),
        candidate({ id: 'r3' }),
      ]);
      graph.findUser.mockRejectedValue(new Error('graph 503'));

      await service.sweep();

      expect(graph.findUser).toHaveBeenCalledTimes(1);
    });

    it('keeps what it already opened before the failure', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1' }),
        candidate({ id: 'r2' }),
      ]);
      graph.findUser
        .mockResolvedValueOnce(GRAPH_USER)
        .mockRejectedValueOnce(new Error('graph 503'));

      const result = await service.sweep();

      expect(result).toEqual({ scanned: 1, opened: 1, snOpened: 0 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    // The scheduler boundary itself: even an unexpected failure (a DB error,
    // say) must not escape into the cron runtime.
    it('handleCron swallows anything sweep somehow lets through', async () => {
      prisma.request.findMany.mockRejectedValue(new Error('db is gone'));

      await expect(service.handleCron()).resolves.toBeUndefined();
    });
  });

  describe('D4 — audit summary', () => {
    beforeEach(() => {
      prisma.request.findMany.mockResolvedValue([candidate()]);
      graph.findUser.mockResolvedValue(GRAPH_USER);
    });

    it('writes ONE row per round, not one per request', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1' }),
        candidate({ id: 'r2' }),
      ]);

      await service.sweep();

      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][1];
      expect(entry.action).toBe(AUDIT_ACTIONS.SYNC_SWEEP);
      expect(entry.targetType).toBe('SyncSweep');
      expect(entry.targetId).toBe('bulk');
      expect(entry.actorType).toBe('system');
      expect(entry.actorId).toBeNull();
    });

    /**
     * The W36 lesson, applied up front: a payload can be perfectly formed and
     * still be dropped by the ADR-0009 whitelist. Asserting the call args alone
     * would go green while the stored row held nothing. So run the captured
     * payload through the REAL projection.
     */
    it('the counts survive the ADR-0009 whitelist (not silently dropped)', async () => {
      await service.sweep();

      const entry = audit.log.mock.calls[0][1];
      expect(pickAuditFields('SyncSweep', entry.after)).toEqual({
        scanned: 1,
        opened: 1,
        // ADR-0025 D4 — the gate ② count has to survive the same whitelist.
        // An unlisted key is dropped silently, so this assertion is what stops
        // the round under-reporting for ever.
        snOpened: 0,
      });
      expect(entry.metadata).toEqual({ source: 'sync-sweep' });
    });

    // A row saying "the cron ran and did nothing" every 10 minutes forever
    // would bury the rows that matter.
    it('writes nothing when the round opened no gates', async () => {
      graph.findUser.mockResolvedValue(null);

      await service.sweep();

      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  /**
   * ADR-0025 D4 — gate ②. `serviceNowUserSyncedAt: null` on the candidate is
   * what opts a test into this half; the default fixture leaves it open.
   */
  describe('gate ② — ServiceNow (ADR-0025 D4)', () => {
    /** Gate ① already open, so only the ServiceNow half is under test. */
    const snOnly = (over: Record<string, any> = {}) =>
      candidate({
        azureSyncedAt: new Date(),
        serviceNowUserSyncedAt: null,
        ...over,
      });

    it('records the sys_id and writes a SYNC event when ServiceNow has the user', async () => {
      prisma.request.findMany.mockResolvedValue([snOnly()]);
      snow.findUserSysIdByEmail.mockResolvedValue('sn-user-1');

      const result = await service.sweep();

      expect(result).toEqual({ scanned: 1, opened: 0, snOpened: 1 });
      expect(tx.request.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          serviceNowUserSyncedAt: expect.any(Date),
          serviceNowUserSysId: 'sn-user-1',
        },
      });
      expect(tx.requestEvent.create).toHaveBeenCalledWith({
        data: {
          requestId: 'r1',
          type: 'SYNC',
          message: SYNC_GATE_MESSAGE.SN_VERIFIED,
        },
      });
      // Gate ① was already open — asking Graph again would be a wasted call.
      expect(graph.findUser).not.toHaveBeenCalled();
    });

    /**
     * ADR-0026 D2 — the RITM's `target_user` cannot be corrected (403 ACL on
     * `sc_item_option`, W43 G7), so the correction travels as a work note down
     * the path CH-010 proved writable.
     *
     * OQ-2: every RITM the request owns, not only a platform-created one. A note
     * is an append — on a ticket we turn out not to own, the worst case is one
     * irrelevant note, where the old PATCH would have overwritten a real target.
     */
    it('writes a work note on every RITM the request owns', async () => {
      prisma.request.findMany.mockResolvedValue([snOnly()]);
      snow.findUserSysIdByEmail.mockResolvedValue('sn-user-1');
      prisma.requestLineItem.findMany.mockResolvedValue([
        { serviceNowSysId: 'ritm-a' },
        { serviceNowSysId: 'ritm-b' },
      ]);

      await service.sweep();

      expect(snow.addWorkNote).toHaveBeenCalledTimes(2);
      for (const ritm of ['ritm-a', 'ritm-b']) {
        expect(snow.addWorkNote).toHaveBeenCalledWith(
          ritm,
          expect.stringContaining('sn-user-1'),
        );
      }
    });

    /**
     * The note is the whole deliverable, so its content is pinned: a fulfiller
     * reading it has to learn BOTH the verified sys_id and that `target_user` is
     * still the requester. A note saying only "verified" would leave them
     * trusting the wrong field.
     */
    it('the note names the verified sys_id AND warns that target_user is the requester', async () => {
      prisma.request.findMany.mockResolvedValue([snOnly()]);
      snow.findUserSysIdByEmail.mockResolvedValue('sn-user-1');
      prisma.requestLineItem.findMany.mockResolvedValue([
        { serviceNowSysId: 'ritm-a' },
      ]);

      await service.sweep();

      const note = snow.addWorkNote.mock.calls[0][1] as string;
      expect(note).toContain('sn-user-1');
      expect(note).toContain('target_user');
      expect(note).toContain('REQUESTER');
      expect(note).toContain('target_users_email');
      // H4 — the note goes onto a ticket, but the UPN still has no business in
      // a string this service builds; `target_users_email` already carries it.
      expect(note).not.toContain('@');
    });

    /**
     * 🔴 The gate records what ServiceNow KNOWS; tidying the ticket is separate.
     * Re-shutting it because the note was refused would stall an assignment that
     * is genuinely ready. Unchanged from the back-fill era on purpose — what
     * changed (ADR-0026) is that a failure here now means a real outage rather
     * than a permission wall we were papering over.
     */
    it('keeps the gate open when the work note is refused', async () => {
      prisma.request.findMany.mockResolvedValue([snOnly()]);
      snow.findUserSysIdByEmail.mockResolvedValue('sn-user-1');
      prisma.requestLineItem.findMany.mockResolvedValue([
        { serviceNowSysId: 'ritm-a' },
      ]);
      snow.addWorkNote.mockRejectedValue(new Error('503'));

      await expect(service.sweep()).resolves.toEqual({
        scanned: 1,
        opened: 0,
        snOpened: 1,
      });
      expect(tx.request.update).toHaveBeenCalled();
    });

    /**
     * 🔴 OQ-4 — two people share an address. That is THIS request's problem, so
     * the gate stays shut, but it must NOT abort the vendor: doing so would
     * stall every other onboarding behind one duplicated directory entry.
     */
    it('skips a request with duplicate ServiceNow users without stalling the rest', async () => {
      prisma.request.findMany.mockResolvedValue([
        snOnly({ id: 'r1' }),
        snOnly({ id: 'r2' }),
      ]);
      snow.findUserSysIdByEmail
        .mockRejectedValueOnce(new AmbiguousServiceNowUserError())
        .mockResolvedValueOnce('sn-user-2');

      const result = await service.sweep();

      expect(snow.findUserSysIdByEmail).toHaveBeenCalledTimes(2);
      expect(result.snOpened).toBe(1);
    });

    /**
     * 🔴 D4's whole point: one vendor being down must not stall the other. If
     * these two shared an abort flag, a ServiceNow outage would silently stop
     * every Azure gate from opening — and the round would still look fine.
     */
    it('keeps opening gate ① while ServiceNow is down', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1', serviceNowUserSyncedAt: null }),
        candidate({ id: 'r2', serviceNowUserSyncedAt: null }),
      ]);
      graph.findUser.mockResolvedValue(GRAPH_USER);
      snow.findUserSysIdByEmail.mockRejectedValue(new Error('SN 503'));

      const result = await service.sweep();

      expect(result.opened).toBe(2); // Graph kept working
      expect(result.snOpened).toBe(0);
      // Asked ServiceNow once, then stopped asking for the rest of the round.
      expect(snow.findUserSysIdByEmail).toHaveBeenCalledTimes(1);
    });

    it('keeps opening gate ② while Graph is down', async () => {
      prisma.request.findMany.mockResolvedValue([
        candidate({ id: 'r1', serviceNowUserSyncedAt: null }),
        candidate({ id: 'r2', serviceNowUserSyncedAt: null }),
      ]);
      graph.findUser.mockRejectedValue(new Error('AADSTS500011: throttled'));
      snow.findUserSysIdByEmail.mockResolvedValue('sn-user-1');

      const result = await service.sweep();

      expect(result.opened).toBe(0);
      expect(result.snOpened).toBe(2); // ServiceNow kept working
      expect(graph.findUser).toHaveBeenCalledTimes(1);
    });
  });
});
