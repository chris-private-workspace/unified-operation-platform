import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AssignService } from './assign.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { LicenseOperationsProvider } from '../integration/license-ops/license-ops.provider';
import { GraphLicenseProvider } from '../integration/license-ops/graph-license.provider';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { TicketUpdateProvider } from '../integration/ticket-update/ticket-update.provider';
import { OutboundFailureService } from './outbound-failure.service';
import { AuditService } from '../audit/audit.service';
import {
  AUDIT_ACTIONS,
  pickAuditFields,
  pickAuditMetadata,
} from '../audit/audit-fields';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';

// Actors (AUTH-3a). readyItem's request.opcoId = 'o1'.
// `role` matters from W36 on: the budget override is ADMIN-only (ADR-0016 D3).
const ADMIN = {
  id: 'admin',
  opcoScopeId: null,
  role: 'ADMIN',
} as unknown as AppUser;
const REGIONAL = {
  id: 'reg',
  opcoScopeId: null,
  role: 'REGIONAL',
} as unknown as AppUser;
const O1_IT = {
  id: 'o1-it',
  opcoScopeId: 'o1',
  role: 'OPCO_IT',
} as unknown as AppUser;
const OTHER_IT = {
  id: 'ox-it',
  opcoScopeId: 'oX',
  role: 'OPCO_IT',
} as unknown as AppUser;

describe('AssignService', () => {
  let service: AssignService;
  let prisma: any;
  let tx: any;
  let graph: any;
  let snow: any;
  let tickets: { closeComplete: jest.Mock; markInProgress: jest.Mock };
  let failures: any;
  let audit: any;

  // A READY line item wired for a successful assign; individual tests tweak it.
  const readyItem = (over: Record<string, any> = {}) => ({
    id: 'li1',
    stage: 'READY',
    requestId: 'r1',
    request: {
      id: 'r1',
      targetUpn: 'new.user@rhk.com',
      opcoId: 'o1',
      azureSyncedAt: new Date(),
      serviceNowSysId: 'sys1',
      ...(over.request ?? {}),
    },
    sku: { id: 'c1', skuId: 'guid-1', skuPartNumber: 'SPE_E3' },
    ...over,
  });

  /** Ledger row for the OpCo budget gate; default has plenty of headroom. */
  const ledgerRow = (allocatedQuantity = 10, assignedQuantity = 3) => ({
    allocatedQuantity,
    assignedQuantity,
  });

  const arrangeHappy = () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
    prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow());
    graph.findUser.mockResolvedValue({
      id: 'aad-1',
      userPrincipalName: 'new.user@rhk.com',
      displayName: 'New User',
      usageLocation: 'HK',
      accountEnabled: true,
    });
    graph.getSubscribedSkus.mockResolvedValue([
      {
        skuId: 'guid-1',
        skuPartNumber: 'SPE_E3',
        prepaidEnabled: 100,
        consumedUnits: 80,
        capabilityStatus: 'Enabled',
        appliesTo: 'User',
      },
    ]);
    tx.requestLineItem.update.mockResolvedValue({
      id: 'li1',
      stage: 'ASSIGNED',
    });
    tx.requestLineItem.findMany.mockResolvedValue([{ stage: 'ASSIGNED' }]);
  };

  beforeEach(async () => {
    tx = {
      requestLineItem: { update: jest.fn(), findMany: jest.fn() },
      opcoSkuLedger: { upsert: jest.fn() },
      requestEvent: { create: jest.fn() },
      request: { update: jest.fn() },
    };
    prisma = {
      // `update` here is NOT the stage transition (that runs inside $transaction
      // via tx) — it is W40's ticketHeldAt write, which happens outside it.
      requestLineItem: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      request: { findUnique: jest.fn(), update: jest.fn() },
      requestEvent: { create: jest.fn() },
      // W36 / ADR-0016 — the OpCo budget gate reads the ledger row before Graph.
      opcoSkuLedger: { findUnique: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    graph = {
      findUser: jest.fn(),
      getSubscribedSkus: jest.fn(),
      assignLicense: jest.fn().mockResolvedValue(undefined),
    };
    snow = { addWorkNote: jest.fn().mockResolvedValue(undefined) };
    // W40 / ADR-0017 seam ④. Stubbed at the abstraction: unlike seam ② there is
    // no raw-vendor wrap to keep inside the tested chain here — both
    // implementations already return the same outcome vocabulary, and their own
    // specs cover the mapping.
    tickets = {
      closeComplete: jest
        .fn()
        .mockResolvedValue({ status: 'updated', newState: '3' }),
      markInProgress: jest
        .fn()
        .mockResolvedValue({ status: 'updated', newState: '2' }),
    };

    // ADR-0011: the work-note failure is queued here. Stubbed rather than
    // omitted so the tests below can assert it is (and is NOT) called.
    failures = { record: jest.fn().mockResolvedValue(undefined) };

    // ADR-0016 D6 — the override audit row. Mocked, but the tests below run the
    // captured payload through the REAL whitelist (see the audit describe).
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignService,
        { provide: PrismaService, useValue: prisma },
        // W38 / ADR-0017 seam ②. AssignService now injects the provider, but
        // this suite deliberately wires the REAL GraphLicenseProvider around
        // the same GraphService mock rather than stubbing the provider out.
        //
        // That keeps every assertion below untouched, and — more importantly —
        // keeps the BUG-002 regressions honest: they mock a RAW vendor error
        // and assert a clean 503. Stubbing the provider would have moved the
        // raw→503 wrap outside the tested chain, so those two tests would have
        // been quietly downgraded into "a 503 propagates", which proves nothing.
        { provide: GraphService, useValue: graph },
        {
          provide: LicenseOperationsProvider,
          useFactory: (g: GraphService) => new GraphLicenseProvider(g),
          inject: [GraphService],
        },
        { provide: ServiceNowService, useValue: snow },
        { provide: TicketUpdateProvider, useValue: tickets },
        { provide: OutboundFailureService, useValue: failures },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AssignService);
  });

  describe('assignLineItem — happy path', () => {
    it('assigns via Graph, increments ledger, marks ASSIGNED, recomputes status, writes back to SN', async () => {
      arrangeHappy();

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(graph.assignLicense).toHaveBeenCalledWith(
        'new.user@rhk.com',
        'guid-1',
        { usageLocation: 'HK' },
      );
      // ledger +1 via upsert increment on the compound key
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalledWith({
        where: { opcoId_skuCatalogId: { opcoId: 'o1', skuCatalogId: 'c1' } },
        create: { opcoId: 'o1', skuCatalogId: 'c1', assignedQuantity: 1 },
        update: { assignedQuantity: { increment: 1 } },
      });
      expect(tx.requestLineItem.update).toHaveBeenCalledWith({
        where: { id: 'li1' },
        data: { stage: 'ASSIGNED', assignedAt: expect.any(Date) },
      });
      // all siblings ASSIGNED → request COMPLETED
      expect(tx.request.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'COMPLETED' },
      });
      // fallback: this line has no RITM → write back to the parent REQ mirror,
      // still targeting the sc_req_item table (two-level, ADR-0008 / CONTRACT §4).
      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys1',
        expect.stringContaining('SPE_E3'),
        'sc_req_item',
      );
    });

    /**
     * W40 OQ-E — behaviour change, deliberate. This line's RITM asked for the
     * licence, and assigning it is that request fulfilled, so the ticket is
     * CLOSED rather than annotated. Before W40 this wrote a work note and left
     * the ticket open forever.
     */
    it('closes THIS line item RITM when present, instead of writing a work note', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1' }),
      );

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(tickets.closeComplete).toHaveBeenCalledWith(
        'ritm-1',
        expect.stringContaining('SPE_E3'),
      );
      // Not both: a close carries the same text in close_notes, so writing the
      // work note as well would PATCH the same ticket twice to say one thing.
      expect(snow.addWorkNote).not.toHaveBeenCalled();
    });

    /**
     * 🔴 The parent REQ is sc_request, while seam ④ only ever writes
     * sc_req_item (2004 has the table baked into its patch URL). Closing a REQ
     * is also a different statement — the other lines may still be open.
     */
    it('never closes the parent REQ when this line has no RITM of its own', async () => {
      arrangeHappy(); // readyItem has no serviceNowSysId; request.serviceNowSysId = 'sys1'

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(tickets.closeComplete).not.toHaveBeenCalled();
      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys1',
        expect.any(String),
        'sc_req_item',
      );
    });

    it('applies a usageLocation override when the user has none', async () => {
      arrangeHappy();
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: null,
        accountEnabled: true,
      });

      await service.assignLineItem('li1', 'SG', ADMIN);

      expect(graph.assignLicense).toHaveBeenCalledWith(
        'new.user@rhk.com',
        'guid-1',
        { usageLocation: 'SG' },
      );
    });

    // ADR-0008 D5 (Phase 丁): D365 licence = subscribedSku, assigned via the same
    // Graph assignLicense with no SKU-type gate. A D365 line item assigns and
    // increments the ledger exactly like M365 — lock-in against a future filter.
    it('assigns a D365 SKU via the same Graph path + ledger +1 (no SKU-type gate)', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({
          sku: {
            id: 'c-d365',
            skuId: 'guid-d365',
            skuPartNumber: 'DYN365_ENTERPRISE_SALES',
          },
        }),
      );
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'guid-d365',
          skuPartNumber: 'DYN365_ENTERPRISE_SALES',
          prepaidEnabled: 100,
          consumedUnits: 10,
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(graph.assignLicense).toHaveBeenCalledWith(
        'new.user@rhk.com',
        'guid-d365',
        { usageLocation: 'HK' },
      );
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalledWith({
        where: {
          opcoId_skuCatalogId: { opcoId: 'o1', skuCatalogId: 'c-d365' },
        },
        create: { opcoId: 'o1', skuCatalogId: 'c-d365', assignedQuantity: 1 },
        update: { assignedQuantity: { increment: 1 } },
      });
    });
  });

  describe('assignLineItem — gates fail closed', () => {
    it('rejects a non-READY line item (no Graph call, no tx)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ stage: 'QUOTING' }),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // AUTH-3a scope gate (H5): runs before every other gate, fail-closed.
    it('OPCO_IT out of scope → 403 before any Graph call or tx', async () => {
      arrangeHappy(); // fully valid READY item in OpCo o1

      await expect(
        service.assignLineItem('li1', undefined, OTHER_IT), // scope oX != o1
      ).rejects.toThrow(ForbiddenException);
      expect(graph.findUser).not.toHaveBeenCalled();
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('OPCO_IT in its own OpCo passes the scope gate (assigns)', async () => {
      arrangeHappy();

      await service.assignLineItem('li1', undefined, O1_IT); // scope o1 == o1

      expect(graph.assignLicense).toHaveBeenCalled();
    });

    it('rejects when the sync gate is closed (azureSyncedAt null)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { azureSyncedAt: null } }),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when the user is not yet in Azure AD (findUser null)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue(null);

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when there is no usageLocation and no override', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: null,
        accountEnabled: true,
      });

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('rejects when the SKU has no available seats', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: 'HK',
        accountEnabled: true,
      });
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'guid-1',
          skuPartNumber: 'SPE_E3',
          prepaidEnabled: 100,
          consumedUnits: 100, // full
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('throws NotFound when the line item is missing', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(null);

      await expect(
        service.assignLineItem('missing', undefined, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── W36 / ADR-0016 — OpCo budget gate ──
  describe('assignLineItem — OpCo budget gate (ADR-0016)', () => {
    it('assigns while the OpCo still has headroom', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 3));

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(graph.assignLicense).toHaveBeenCalled();
    });

    // Off-by-one guard: the LAST free seat must still go through. A gate written
    // as `assigned >= allocated - 1` would pass every other test here.
    it('assigns the last free seat (assigned = allocated - 1)', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 9));

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(graph.assignLicense).toHaveBeenCalled();
    });

    it('refuses when the budget is exactly used up (assigned = allocated)', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    // D1: a missing row means nothing was ever allocated — NOT "unlimited".
    it('refuses when the OpCo has no ledger row at all', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(null);

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // D5: the gate sits BEFORE the Graph inventory read, so busting the OpCo
    // budget must not cost a vendor round-trip. Asserting only the 400 would
    // still pass with the gate in the wrong place — this is what pins it down.
    it('does not touch Graph at all when the budget is busted', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(5, 5));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(graph.getSubscribedSkus).not.toHaveBeenCalled();
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('states the real numbers so the operator knows what to fix', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(12, 12));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(/12 assigned of 12 allocated/);
    });
  });

  describe('assignLineItem — budget override (ADR-0016 D3)', () => {
    const REASON = 'RHK urgent hire, allocation tops up next week';

    it('lets an ADMIN through with a reason', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await service.assignLineItem('li1', undefined, ADMIN, REASON);

      expect(graph.assignLicense).toHaveBeenCalled();
    });

    it('records the override on the request timeline, not only in the audit log', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await service.assignLineItem('li1', undefined, ADMIN, REASON);

      const event = tx.requestEvent.create.mock.calls[0][0].data;
      expect(event.message).toContain('budget overridden');
      expect(event.message).toContain(REASON);
    });

    // D3 — fail closed for everyone else, and LOUDLY: silently ignoring the
    // field would let an OPCO_IT operator believe the override took effect.
    it('403s an OPCO_IT that supplies a reason', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await expect(
        service.assignLineItem('li1', undefined, O1_IT, REASON),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('403s a REGIONAL that supplies a reason (deliberately excluded)', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await expect(
        service.assignLineItem('li1', undefined, REGIONAL, REASON),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a whitespace-only reason (it defeats the audit)', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN, '            '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // The override is for the BUDGET and nothing else. These two pin that down —
    // an override that waved through the sync gate or the tenant seat gate would
    // be a far worse bug than the one it solves.
    it('does not bypass the tenant seat gate', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'guid-1',
          skuPartNumber: 'SPE_E3',
          prepaidEnabled: 100,
          consumedUnits: 100,
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      await expect(
        service.assignLineItem('li1', undefined, ADMIN, REASON),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    it('does not bypass the Phase 1 sync gate', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { azureSyncedAt: null } }),
      );
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN, REASON),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    // An admin may send a reason on an assign that never hit the gate. Nothing
    // was overridden, so nothing may claim one was — otherwise the "how often
    // is override used?" number R4 depends on is inflated by non-events.
    it('a reason on an in-budget assign is not an override', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 3));

      await service.assignLineItem('li1', undefined, ADMIN, REASON);

      expect(audit.log).not.toHaveBeenCalled();
      expect(
        tx.requestEvent.create.mock.calls[0][0].data.message,
      ).not.toContain('overridden');
    });
  });

  // ── W36 / ADR-0016 D6 + ADR-0009 — the override in the audit trail ──
  describe('assignLineItem — budget override audit (D6)', () => {
    const REASON = 'RHK urgent hire, allocation tops up next week';

    const overrideAndCapture = async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(12, 12));
      await service.assignLineItem('li1', undefined, ADMIN, REASON);
      return audit.log.mock.calls[0];
    };

    it('writes an assign.budget_override row against the line item', async () => {
      const [, entry] = await overrideAndCapture();

      expect(entry.action).toBe(AUDIT_ACTIONS.ASSIGN_BUDGET_OVERRIDE);
      expect(entry.targetType).toBe('RequestLineItem');
      expect(entry.targetId).toBe('li1');
      expect(entry.actorId).toBe('admin');
    });

    /**
     * The blocker this phase hit: a payload can be perfectly formed and still
     * be dropped on the floor by the ADR-0009 whitelist. Asserting the call
     * args alone would have gone green while the stored row held only `reason`.
     * So run the captured metadata through the REAL pickAuditMetadata.
     */
    it('every field survives the ADR-0009 whitelist (not silently dropped)', async () => {
      const [, entry] = await overrideAndCapture();

      expect(pickAuditMetadata(entry.metadata)).toEqual({
        budgetOverride: true,
        reason: REASON,
        allocated: 12,
        assignedBefore: 12,
      });
    });

    // Event-only target, like OutboundFailure: the request behind this line item
    // carries the target UPN, and the audit table is read by a different (wider
    // on this axis) audience than the request itself. H4.
    it('copies no line-item fields into before/after (no PII widening)', async () => {
      const [, entry] = await overrideAndCapture();

      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
      expect(pickAuditFields('RequestLineItem', readyItem())).toBeUndefined();
    });

    // ADR-0009 D8.1 — the audit row and the assign it describes commit together.
    // Passing `prisma` instead of `tx` would leave "assigned but unrecorded"
    // possible, which is the exact outcome the trail exists to prevent.
    it('writes inside the assign transaction, not outside it', async () => {
      const [handle] = await overrideAndCapture();

      expect(handle).toBe(tx);
      expect(handle).not.toBe(prisma);
    });

    it('writes nothing when the gate blocked the assign (no state changed)', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(10, 10));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('writes nothing on an ordinary in-budget assign', async () => {
      arrangeHappy();

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('assignLineItem — failure isolation', () => {
    it('does not touch the ledger if Graph assignLicense throws', async () => {
      arrangeHappy();
      graph.assignLicense.mockRejectedValue(new Error('graph 500'));

      // BUG-002: a raw Graph error becomes a clean 503, not an unhandled throw.
      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.opcoSkuLedger.upsert).not.toHaveBeenCalled();
    });

    // BUG-002 regression: findUser *throws* (auth/network/throttle — not a 404
    // null) → must surface a 503, never propagate the raw MSAL error (which
    // crashes the Nest process with an invalid status code).
    it('wraps a findUser failure as 503 and touches nothing (fail-closed)', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(readyItem());
      graph.findUser.mockRejectedValue(
        Object.assign(
          new Error('AADSTS700038: invalid application identifier'),
          {
            statusCode: -1,
          },
        ),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(graph.assignLicense).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.opcoSkuLedger.upsert).not.toHaveBeenCalled();
    });

    it('still succeeds when the ServiceNow write-back throws (non-fatal)', async () => {
      arrangeHappy();
      snow.addWorkNote.mockRejectedValue(new Error('SN down'));

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      expect(res).toEqual({ id: 'li1', stage: 'ASSIGNED' });
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalled(); // assign committed
    });
  });

  describe('markSynced', () => {
    it('sets azureSyncedAt + accountCreatedAt and writes a SYNC event', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        accountCreatedAt: null,
      });
      prisma.request.update.mockImplementation(({ data }: any) => ({
        id: 'r1',
        ...data,
      }));

      const res = await service.markSynced('r1', ADMIN);

      expect(res.azureSyncedAt).toBeInstanceOf(Date);
      expect(res.accountCreatedAt).toBeInstanceOf(Date);
      expect(prisma.requestEvent.create).toHaveBeenCalledWith({
        data: {
          requestId: 'r1',
          type: 'SYNC',
          message: SYNC_GATE_MESSAGE.MANUAL,
        },
      });
    });

    /**
     * W37 / ADR-0015 D3. The break-glass path must not read as equivalent to
     * the sweep's evidence-backed one — an operator looking at a stalled
     * onboarding needs to know whether the gate was opened by a Graph hit or by
     * someone asserting it. `expect.any(String)` above would have passed
     * whatever wording; this pins the claim itself.
     */
    it('says outright that a manual confirm is NOT Graph-verified', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        accountCreatedAt: null,
      });
      prisma.request.update.mockImplementation(({ data }: any) => ({
        id: 'r1',
        ...data,
      }));

      await service.markSynced('r1', ADMIN);

      const { message } = prisma.requestEvent.create.mock.calls[0][0].data;
      expect(message).toContain('not verified against Graph');
      expect(message).not.toBe(SYNC_GATE_MESSAGE.VERIFIED);
    });

    it('throws NotFound when the request is missing', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.markSynced('missing', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    // AUTH-3a scope gate: OPCO_IT can only open the gate on its own OpCo.
    it('OPCO_IT out of scope → 403, gate untouched', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'o1',
        accountCreatedAt: null,
      });

      await expect(service.markSynced('r1', OTHER_IT)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.request.update).not.toHaveBeenCalled();
    });
  });

  // ── ADR-0011 I1: the write-back failure is queued but STILL swallowed ──
  describe('ServiceNow write-back failure (W31)', () => {
    it('queues the failed note but the assign still succeeds', async () => {
      arrangeHappy();
      snow.addWorkNote.mockRejectedValue(new Error('SN 503'));

      // The licence is on the user and the ledger has moved. A missing mirror
      // note must NOT turn a completed assign into a failure (OD4 unchanged).
      const result = await service.assignLineItem('li1', undefined, ADMIN);
      expect(result).toBeDefined();

      const entry = failures.record.mock.calls[0][0];
      expect(entry.kind).toBe('servicenow.worknote');
      expect(entry.payload.snTarget).toBe('sys1');
      expect(entry.payload.note).toMatch(/SPE_E3 assigned via platform/);
      expect(entry.requestId).toBe('r1');
    });

    it('the ledger increment still happened despite the note failing', async () => {
      arrangeHappy();
      snow.addWorkNote.mockRejectedValue(new Error('SN 503'));

      await service.assignLineItem('li1', undefined, ADMIN);
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalled();
    });

    it('queues nothing when the write-back succeeds', async () => {
      arrangeHappy();

      await service.assignLineItem('li1', undefined, ADMIN);
      expect(failures.record).not.toHaveBeenCalled();
    });
  });

  /**
   * W40 / ADR-0017 seam ④ — the ticket state transitions (OQ-E).
   *
   * The load-bearing property here is that a blocked assign PATCHes a real
   * customer ticket at most once. An operator retries a blocked assign as a
   * matter of course — raise the allocation, try again, ask an admin, try
   * again — and every one of those attempts runs this code path.
   */
  describe('ticket state transitions', () => {
    /** Budget gate: assigned 5 of 5 allocated → +1 busts it. */
    const arrangeBlocked = (over: Record<string, any> = {}) => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue({
        allocatedQuantity: 5,
        assignedQuantity: 5,
      });
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({
          serviceNowSysId: 'ritm-1',
          ticketHeldAt: null,
          ...over,
        }),
      );
    };

    it('marks the RITM in progress when the budget gate blocks the assign', async () => {
      arrangeBlocked();

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);

      expect(tickets.markInProgress).toHaveBeenCalledWith(
        'ritm-1',
        expect.stringContaining('procurement'),
      );
      // The hold is recorded so the next blocked attempt does not repeat it.
      expect(prisma.requestLineItem.update).toHaveBeenCalledWith({
        where: { id: 'li1' },
        data: { ticketHeldAt: expect.any(Date) },
      });
    });

    /** 🔴 The reason ticketHeldAt exists. */
    it('does NOT touch the ticket again on a second blocked attempt', async () => {
      arrangeBlocked({ ticketHeldAt: new Date('2026-07-27T00:00:00.000Z') });

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);

      expect(tickets.markInProgress).not.toHaveBeenCalled();
      expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
    });

    it('does not record a hold that failed, so it can be attempted again', async () => {
      arrangeBlocked();
      tickets.markInProgress.mockRejectedValue(new Error('n8n is down'));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(BadRequestException);

      expect(failures.record).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'servicenow.ticket_update',
          payload: expect.objectContaining({ transition: 'hold' }),
        }),
      );
      expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
    });

    it('never holds a ticket the assign was allowed to proceed on', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1', ticketHeldAt: null }),
      );

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(tickets.markInProgress).not.toHaveBeenCalled();
    });

    /**
     * OD4 — the licence is on the user and the ledger has moved. A ticket that
     * did not close must not turn that into a failed assign.
     */
    it('keeps the assign successful when the close fails, and queues it', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1' }),
      );
      tickets.closeComplete.mockRejectedValue(new Error('ServiceNow is down'));

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).resolves.toBeDefined();

      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalled();
      expect(failures.record).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'servicenow.ticket_update',
          payload: expect.objectContaining({
            transition: 'close',
            snTarget: 'ritm-1',
          }),
        }),
      );
    });

    /**
     * The n8n path answers HTTP 200 with status 'error' when ServiceNow refused
     * its PATCH (row-level ACL). Treating that as success would report a ticket
     * as closed while it never moved.
     */
    it('queues a provider "error" outcome the same as a thrown failure', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1' }),
      );
      tickets.closeComplete.mockResolvedValue({
        status: 'error',
        details: 'ServiceNow returned HTTP 403',
      });

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(failures.record).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'servicenow.ticket_update' }),
      );
    });
  });
});
