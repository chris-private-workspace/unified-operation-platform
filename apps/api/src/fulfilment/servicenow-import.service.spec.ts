import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceNowImportService } from './servicenow-import.service';
import type { AuthUser } from '../auth/current-user.decorator';
import type { LookedUpRequest } from '../integration/servicenow/servicenow-lookup.service';

/**
 * CH-013 / ADR-0021 — what the import surface is allowed to do.
 *
 * The load-bearing assertions here are about TRUST, not plumbing:
 *
 *  - the RITM sys_id that reaches the canonical payload comes from the server's
 *    own re-read, never from the body (D5). Getting this wrong is invisible:
 *    the import succeeds, and the platform mirrors somebody else's ticket.
 *  - `azureSyncedAt` never gets set. "An admin imported this" says nothing
 *    about whether Entra can see the user, and the sync gate exists to stop
 *    exactly that inference (RISK R3).
 *  - preview writes nothing and leaks no raw ServiceNow fields.
 */
describe('ServiceNowImportService', () => {
  let prisma: { request: { findUnique: jest.Mock }; $transaction: jest.Mock };
  let lookup: { lookupByNumber: jest.Mock };
  let intake: { intake: jest.Mock };
  let audit: { log: jest.Mock };
  let service: ServiceNowImportService;

  const actor = { id: 'admin-1', role: 'ADMIN' } as unknown as AuthUser;

  const found: LookedUpRequest = {
    number: 'REQ0044038',
    sysId: 'REQ_SYS_TRUE',
    shortDescription: 'O365 licence request',
    openedAt: '2026-07-30 06:01:33',
    items: [
      {
        number: 'RITM0047331',
        sysId: 'RITM_SYS_TRUE',
        title: 'O365',
        activeTaskCount: 1,
        importable: true,
        blockedReason: null,
        activeTasks: [
          {
            sys_id: 'TASK1',
            number: 'SCTASK0071802',
            state: '1',
            // Fields a browser has no business receiving.
            assigned_to: { value: 'someone', link: 'x' },
            description: 'internal chatter',
          },
        ],
      },
      {
        number: 'RITM_BLOCKED',
        sysId: 'RITM_SYS_B',
        title: 'no task',
        activeTaskCount: 0,
        importable: false,
        blockedReason: 'No active catalog task — nothing to close',
        activeTasks: [],
      },
    ],
  };

  const body = {
    reqNumber: 'REQ0044038',
    opcoCode: 'RHK',
    targetUpn: 'chris.lai@rapo.com.hk',
    items: [{ ritmNumber: 'RITM0047331', skuId: 'SKU-GUID-E5' }],
  };

  beforeEach(() => {
    prisma = {
      request: { findUnique: jest.fn().mockResolvedValue(null) },
      // W29 pattern — hand the callback the same mock, so audit writes are
      // observable without a real transaction.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    lookup = { lookupByNumber: jest.fn().mockResolvedValue(found) };
    intake = { intake: jest.fn().mockResolvedValue({ id: 'req-1' }) };
    audit = { log: jest.fn() };

    service = new ServiceNowImportService(
      prisma as never,
      lookup as never,
      intake as never,
      audit as never,
    );
  });

  describe('preview', () => {
    it('404s when the request is not found, and says ACL is indistinguishable', async () => {
      lookup.lookupByNumber.mockResolvedValue(null);

      await expect(service.preview('REQ0000000')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.preview('REQ0000000')).rejects.toThrow(/ACL/i);
    });

    it('writes nothing', async () => {
      await service.preview('REQ0044038');

      expect(intake.intake).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('exposes only picked task fields — no raw ServiceNow record reaches the client', async () => {
      const view = await service.preview('REQ0044038');

      expect(view.items[0].tasks).toEqual([
        { number: 'SCTASK0071802', state: '1' },
      ]);
      // The raw record carried these; the view must not.
      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain('assigned_to');
      expect(serialised).not.toContain('internal chatter');
      // sys_id is deliberately absent too: the client never names one (D5), so
      // publishing it would only invite a body that tries to.
      expect(serialised).not.toContain('RITM_SYS_TRUE');
    });

    it('carries the blocked verdict through untouched', async () => {
      const view = await service.preview('REQ0044038');

      expect(view.items[1]).toMatchObject({
        number: 'RITM_BLOCKED',
        importable: false,
        activeTaskCount: 0,
      });
    });
  });

  describe('import — rejections write nothing', () => {
    it('400s when a named RITM does not belong to the REQ', async () => {
      await expect(
        service.import(
          { ...body, items: [{ ritmNumber: 'RITM_ELSEWHERE', skuId: 'S' }] },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(intake.intake).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('400s when the RITM has no single active catalog task, quoting the reason', async () => {
      await expect(
        service.import(
          { ...body, items: [{ ritmNumber: 'RITM_BLOCKED', skuId: 'S' }] },
          actor,
        ),
      ).rejects.toThrow(/nothing to close/i);

      expect(intake.intake).not.toHaveBeenCalled();
    });
  });

  describe('import — the canonical payload', () => {
    it('🔴 takes the RITM sys_id from the server re-read, never from the caller', async () => {
      await service.import(body, actor);

      const canonical = intake.intake.mock.calls[0][0];
      expect(canonical.lineItems).toEqual([
        {
          skuId: 'SKU-GUID-E5',
          quantity: 1,
          serviceNowRitmSysId: 'RITM_SYS_TRUE',
          serviceNowRitmNumber: 'RITM0047331',
        },
      ]);
      expect(canonical.serviceNowSysId).toBe('REQ_SYS_TRUE');
    });

    it('🔴 never sets azureSyncedAt — importing is not evidence of an Entra sync', async () => {
      await service.import(body, actor);

      const canonical = intake.intake.mock.calls[0][0];
      expect(canonical.azureSyncedAt).toBeUndefined();
      expect(canonical.accountCreatedAt).toBeUndefined();
    });

    it('passes the operator-chosen OpCo and target straight through, and defaults quantity to 1', async () => {
      await service.import(body, actor);

      const canonical = intake.intake.mock.calls[0][0];
      expect(canonical).toMatchObject({
        opcoCode: 'RHK',
        targetUpn: 'chris.lai@rapo.com.hk',
        serviceNowNumber: 'REQ0044038',
      });
      expect(canonical.lineItems[0].quantity).toBe(1);
    });

    it('honours an explicit quantity', async () => {
      await service.import(
        {
          ...body,
          items: [{ ritmNumber: 'RITM0047331', skuId: 'S', quantity: 3 }],
        },
        actor,
      );

      expect(intake.intake.mock.calls[0][0].lineItems[0].quantity).toBe(3);
    });
  });

  describe('import — audit (D7)', () => {
    it('records the import against the created request, attributed to the actor', async () => {
      await service.import(body, actor);

      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][1];
      expect(entry).toMatchObject({
        action: 'request.imported_from_servicenow',
        targetType: 'Request',
        targetId: 'req-1',
        actorId: 'admin-1',
      });
    });

    it('🔴 keeps the target UPN out of the audit metadata', async () => {
      await service.import(body, actor);

      const metadata = audit.log.mock.calls[0][1].metadata;
      expect(JSON.stringify(metadata)).not.toContain('chris.lai@rapo.com.hk');
      // What an auditor actually needs is there.
      expect(metadata.reason).toContain('REQ0044038');
      expect(metadata.source).toBe('servicenow-import');
    });

    it('does NOT audit a re-import — nothing was created', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'req-1' });

      await service.import(body, actor);

      // The canonical service still runs (it owns idempotency and returns the
      // existing request), but an audit row would claim an import happened.
      expect(intake.intake).toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
