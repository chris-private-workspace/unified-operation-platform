import { Test } from '@nestjs/testing';
import type { AppUser } from '@prisma/client';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';

// Only opcoScopeId matters to scopeWhere; the rest of AppUser is irrelevant.
const ADMIN = { opcoScopeId: null } as unknown as AppUser;
const REGIONAL = { opcoScopeId: null } as unknown as AppUser;
const OPCO_IT = { opcoScopeId: 'opco-rhk' } as unknown as AppUser;

const row = (over: Record<string, unknown> = {}) => ({
  id: 'ev1',
  type: 'ASSIGN',
  fromStage: 'READY',
  toStage: 'ASSIGNED',
  message: 'Assigned SPE_E3',
  createdAt: new Date('2026-07-21T10:00:00Z'),
  requestId: 'req-abc123def456',
  actor: { displayName: 'Alex Tan' },
  request: { serviceNowNumber: 'REQ0012345' },
  ...over,
});

describe('ActivityService', () => {
  let service: ActivityService;
  let prisma: { requestEvent: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { requestEvent: { findMany: jest.fn().mockResolvedValue([]) } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ActivityService);
  });

  const lastCall = () => prisma.requestEvent.findMany.mock.calls[0][0];

  describe('scope', () => {
    // B3 — the security assertion. A scoped operator must never be able to see
    // another OpCo's operational history through this feed.
    it('restricts OPCO_IT to its own OpCo, nested under request', async () => {
      await service.recent(OPCO_IT, 6);

      expect(lastCall().where).toEqual({ request: { opcoId: 'opco-rhk' } });
    });

    // B5 — an empty relation filter ({ request: {} }) would still force a join
    // and defeat the [createdAt] index this Change added. The unscoped path must
    // carry no `request` key at all.
    it.each([
      ['ADMIN', ADMIN],
      ['REGIONAL', REGIONAL],
    ])(
      'leaves %s unrestricted with no join-forcing relation filter',
      async (_label, actor) => {
        await service.recent(actor, 6);

        const { where } = lastCall();
        expect(where).toEqual({});
        expect(where).not.toHaveProperty('request');
      },
    );
  });

  describe('query shape', () => {
    it('takes the newest `limit` events', async () => {
      await service.recent(ADMIN, 6);

      expect(lastCall().orderBy).toEqual({ createdAt: 'desc' });
      expect(lastCall().take).toBe(6);
    });

    // The response whitelist is enforced by the query, not by trimming after.
    it('selects only the whitelisted request column', async () => {
      await service.recent(ADMIN, 6);

      expect(lastCall().select.request).toEqual({
        select: { serviceNowNumber: true },
      });
      expect(lastCall().select.actor).toEqual({
        select: { displayName: true },
      });
    });
  });

  describe('mapping', () => {
    it('flattens actor + request handle onto the row', async () => {
      prisma.requestEvent.findMany.mockResolvedValue([row()]);

      const [event] = await service.recent(ADMIN, 6);

      expect(event).toEqual({
        id: 'ev1',
        type: 'ASSIGN',
        fromStage: 'READY',
        toStage: 'ASSIGNED',
        message: 'Assigned SPE_E3',
        createdAt: new Date('2026-07-21T10:00:00Z'),
        actorName: 'Alex Tan',
        requestId: 'req-abc123def456',
        requestRef: 'REQ0012345',
      });
    });

    // SYNC / NOTE events are written by the platform with no actor — printing a
    // bare "user" there would read like someone's name.
    it('reports a null actor rather than inventing one', async () => {
      prisma.requestEvent.findMany.mockResolvedValue([
        row({ type: 'SYNC', actor: null, message: 'Phase 1 sync confirmed' }),
      ]);

      const [event] = await service.recent(ADMIN, 6);

      expect(event.actorName).toBeNull();
    });

    // Platform-created requests have no SN number until submission succeeds.
    it('falls back to an id tail when the request has no ServiceNow number', async () => {
      prisma.requestEvent.findMany.mockResolvedValue([
        row({ request: { serviceNowNumber: null } }),
      ]);

      const [event] = await service.recent(ADMIN, 6);

      expect(event.requestRef).toBe('def456');
    });
  });

  /**
   * B6 — H4 negative assertion (same posture as W31 G1).
   *
   * This endpoint is open to OPCO_IT, so the onboarding subject's address must
   * not travel with a feed row. Prisma is stubbed to hand back a FATTER row than
   * the service selects: if someone later widens the select or spreads
   * `...row.request` into the response, these values ride along and this fails.
   */
  it('never emits onboarding PII, even when the row carries it', async () => {
    prisma.requestEvent.findMany.mockResolvedValue([
      row({
        request: {
          serviceNowNumber: 'REQ0012345',
          targetUpn: 'may.chan@rapo.com.hk',
          requesterEmail: 'boss@rapo.com.hk',
          targetDisplayName: 'May Chan',
        },
      }),
    ]);

    const events = await service.recent(OPCO_IT, 6);
    const serialised = JSON.stringify(events);

    for (const leak of [
      'may.chan@rapo.com.hk',
      'boss@rapo.com.hk',
      'May Chan',
      'targetUpn',
      'requesterEmail',
      'targetDisplayName',
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });
});
