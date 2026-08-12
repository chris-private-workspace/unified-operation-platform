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
import {
  ASSIGN_GATE_KEYS,
  type AssignStep,
  type AssignStepKey,
  type AssignStepOwner,
} from './assign-step';

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
    // 'prepaid' is the column default, so every test written before CH-026
    // still exercises the ordinary seat gate rather than the new branch.
    sku: {
      id: 'c1',
      skuId: 'guid-1',
      skuPartNumber: 'SPE_E3',
      seatModel: 'prepaid',
    },
    ...over,
    /**
     * 🔴 AFTER `...over`, deliberately. `request` used to sit before it, which
     * meant `over.request` REPLACED the defaults instead of merging into them —
     * a test that shut one gate silently dropped every other request field too.
     * Harmless while there was one gate to shut; actively misleading now that
     * there are two, because shutting gate ② also blanked gate ① and the test
     * then passed for the wrong reason.
     */
    request: {
      id: 'r1',
      targetUpn: 'new.user@rhk.com',
      opcoId: 'o1',
      azureSyncedAt: new Date(),
      // ADR-0025 D5 — gate ② defaults OPEN so every test written before W43
      // still exercises the thing it was written for, not the new gate.
      serviceNowUserSyncedAt: new Date(),
      serviceNowSysId: 'sys1',
      ...(over.request ?? {}),
    },
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
      /**
       * Fallback: this line has no RITM → write back to the parent REQ mirror.
       *
       * BUG-006 — this assertion used to say 'sc_req_item', and the comment
       * above it used to say "still targeting the sc_req_item table" as though
       * that were the design. It was not: the parent REQ lives in sc_request
       * (two-level, ADR-0008 D6 / CONTRACT §4), so the old value addressed a
       * REQ sys_id inside the RITM table. The test and the comment were
       * agreeing with each other rather than with ServiceNow.
       */
      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys1',
        expect.stringContaining('SPE_E3'),
        'sc_request',
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
        { kind: 'ritm', sysId: 'ritm-1' },
        expect.stringContaining('SPE_E3'),
      );
      // Not both: a close carries the same text in close_notes, so writing the
      // work note as well would PATCH the same ticket twice to say one thing.
      expect(snow.addWorkNote).not.toHaveBeenCalled();
    });

    /**
     * 🔴 ADR-0025 D1 — this used to assert the OPPOSITE (task in preference to
     * RITM), on ADR-0024 D6's premise that n8n waits for the platform to close
     * the handed-over Windows Domain Account task. Disproved live on
     * 2026-08-03: n8n closes that task itself. Acting on the id would PATCH a
     * task that is already closed, which the `active` guard refuses — so every
     * assign filed a Delivery failure for a non-problem.
     *
     * Both ids present is still the case that matters, just with the answer
     * reversed: the line's own RITM is the only record this seam may close.
     */
    it('ignores a handed-over catalog task and closes this line RITM', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({
          serviceNowSysId: 'ritm-1',
          serviceNowTaskSysId: 'task-1',
          serviceNowTaskNumber: 'SCTASK0071802',
        }),
      );

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(tickets.closeComplete).toHaveBeenCalledWith(
        { kind: 'ritm', sysId: 'ritm-1' },
        expect.stringContaining('SPE_E3'),
      );
      expect(snow.addWorkNote).not.toHaveBeenCalled();
    });

    /**
     * The task id alone must not become a close target either. Until F2 gives
     * the injected line a RITM of its own, a line with no RITM falls back to the
     * parent REQ work note — the behaviour that predates CH-020.
     */
    it('does not close a handed-over catalog task when the line has no RITM', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: null, serviceNowTaskSysId: 'task-1' }),
      );

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(tickets.closeComplete).not.toHaveBeenCalled();
      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys1',
        expect.any(String),
        'sc_request',
      );
    });

    /**
     * W43 F6-2 / RISK R7 — `close_notes` is the ONLY way to tell a UOP close
     * from an n8n close.
     *
     * UOP and n8n authenticate to ServiceNow as the same account
     * (`n8napiservice1`), so `sys_updated_by` and `assigned_to` say the same
     * thing whichever system acted. That is not a hypothetical: ADR-0024 D5's
     * rationale was written on a mis-attribution this exact ambiguity produced
     * (SCTASK0071807 was read as "closed by hand" when UOP had closed it during
     * CH-020 verification), and that reading became a premise of a whole ADR.
     *
     * So the note text is not cosmetic — it is the discriminator. Pinned here
     * because nothing else would notice it drifting into something n8n also
     * says, and the cost of that is future evidence quietly becoming unreadable.
     */
    it('closes with the UOP fingerprint, never wording n8n also uses', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1' }),
      );

      await service.assignLineItem('li1', undefined, ADMIN);

      const [, note] = tickets.closeComplete.mock.calls[0] as [unknown, string];
      // The fingerprint itself: "via platform" is what a query for UOP's closes
      // matches on, and the SKU is what makes one close distinguishable from
      // the next.
      expect(note).toContain('via platform');
      expect(note).toContain('SPE_E3');
      // n8n's own fingerprint, observed live: `Closed & Handled by n8n`. Sharing
      // any of it would make both systems' closes match the same query.
      expect(note).not.toMatch(/n8n/i);
      expect(note).not.toMatch(/handled by/i);
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
      // BUG-006: the parent REQ is addressed in sc_request, not sc_req_item.
      expect(snow.addWorkNote).toHaveBeenCalledWith(
        'sys1',
        expect.any(String),
        'sc_request',
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

    /**
     * ADR-0025 D5 — gate ②, and the message is asserted because it is the whole
     * reason there are two: the operator has to know WHICH side they are waiting
     * on, since the two are chased differently.
     */
    it('rejects when the ServiceNow sync gate is closed', async () => {
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { serviceNowUserSyncedAt: null } }),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).rejects.toThrow(/not in ServiceNow yet/);
      expect(graph.assignLicense).not.toHaveBeenCalled();
    });

    /**
     * 🔴 An override exists so a human can own a BUDGET decision. A sync gate is
     * not a decision — it states whether the person exists yet, and there is no
     * such thing as knowingly assigning a licence to someone who does not.
     */
    it('does not let a budget override bypass the ServiceNow gate', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { serviceNowUserSyncedAt: null } }),
      );

      await expect(
        service.assignLineItem('li1', undefined, ADMIN, 'urgent joiner'),
      ).rejects.toThrow(/not in ServiceNow yet/);
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

      // ADR-0029 — the line item moved to `lineItem`; the response itself is
      // now the step breakdown.
      expect(res.lineItem).toEqual({ id: 'li1', stage: 'ASSIGNED' });
      expect(res.outcome).toBe('assigned');
      expect(tx.opcoSkuLedger.upsert).toHaveBeenCalled(); // assign committed

      /**
       * The point of this test is failure ISOLATION, and ADR-0029 makes that
       * visible rather than inferable: the assign succeeded, but the operator
       * can now see that the mirror note did not land — previously the only
       * trace was a swallowed warn and a queue row nobody was looking at.
       */
      const ticket = res.steps.find((s) => s.key === 'ticket');
      expect(ticket).toMatchObject({
        status: 'failed',
        retryable: true,
        whoFixes: 'platform',
      });
      expect(res.steps.find((s) => s.key === 'assign')?.status).toBe('ok');
      expect(res.steps.find((s) => s.key === 'ledger')?.status).toBe('ok');
    });
  });

  /**
   * ADR-0029 — one assertion per gate. Written as its own block rather than
   * folded into the existing gate tests on purpose: those assert the MESSAGE
   * (and still do, unchanged), while these assert the STEP contract. Changing
   * the old ones to check steps would have quietly dropped the message
   * coverage that ADR-0029 explicitly promised to keep.
   */
  describe('assignLineItem — step breakdown (ADR-0029)', () => {
    /** Runs an assign expected to be blocked, and returns the 400 body. */
    const blockedBody = async () => {
      try {
        await service.assignLineItem('li1', undefined, ADMIN);
      } catch (err) {
        return (
          err as { getResponse: () => Record<string, unknown> }
        ).getResponse();
      }
      throw new Error('expected the assign to be blocked, but it succeeded');
    };

    /**
     * One gate, checked three ways at once, because `failedAt` on its own is
     * the weakest of the three:
     *
     *  1. the body NAMES the gate,
     *  2. every gate BEFORE it is reported `ok` — that is what turns the list
     *     into evidence ("it reached budget, so both syncs were fine"),
     *  3. nothing AFTER it appears at all — steps that were never evaluated
     *     must be absent, not reported as skipped.
     *
     * 🔴 The expected prefix is derived from `ASSIGN_GATE_KEYS` rather than
     * retyped. That is a real cross-check, not a tautology: `assign.service.ts`
     * never reads that array — it runs the gates in hand-written order — so
     * this fails the moment the declared contract order and the runtime order
     * disagree, which is exactly the drift nothing else would catch.
     */
    const expectBlockedAt = async (
      key: AssignStepKey,
      whoFixes: AssignStepOwner,
      retryable: boolean,
    ) => {
      const body = await blockedBody();
      expect(body.outcome).toBe('blocked');
      expect(body.failedAt).toBe(key);

      const steps = body.steps as AssignStep[];
      const expected = ASSIGN_GATE_KEYS.slice(
        0,
        ASSIGN_GATE_KEYS.indexOf(key as never) + 1,
      );
      expect(steps.map((s) => s.key)).toEqual(expected);
      expect(steps.slice(0, -1).map((s) => s.status)).toEqual(
        steps.slice(0, -1).map(() => 'ok'),
      );
      expect(steps[steps.length - 1]).toMatchObject({
        status: 'failed',
        whoFixes,
        retryable,
      });
      // Non-empty, and free of anything email-shaped (BUG-004 net).
      expect(steps[steps.length - 1].detail).toBeTruthy();
      expect(steps[steps.length - 1].detail).not.toMatch(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );
    };

    it('reports every gate it passed, in run order, on a full success', async () => {
      arrangeHappy();

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      expect(res.steps.map((s) => s.key)).toEqual([
        'stage',
        'sync-azure',
        'sync-servicenow',
        'directory',
        'usage-location',
        'budget',
        'seats',
        'assign',
        'ledger',
        'ticket',
      ]);
      expect(res.failedAt).toBeUndefined();
    });

    /**
     * F2-12 — one test per gate, never one test covering several.
     *
     * 🔴 Every one of these starts from `arrangeHappy()` and then shuts exactly
     * ONE thing. Without that the assertion can pass for the wrong reason: an
     * unarranged mock makes the run die at some earlier gate, and the test then
     * proves nothing about the gate it is named after. (CH-022 hit precisely
     * this — an assert that held because the code early-returned for an
     * unrelated reason.)
     */
    it('names `stage` when the line item is not READY', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ stage: 'QUOTING' }),
      );

      // `operator`, and NOT retryable: pressing again changes nothing — the
      // line has to be moved through its stages first.
      await expectBlockedAt('stage', 'operator', false);
    });

    it('names `sync-azure` when the Phase 1 gate has not opened', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { azureSyncedAt: null } }),
      );

      // retryable: nothing is broken — the ADR-0015 sweep opens this on its own
      // once Entra Connect has the user.
      await expectBlockedAt('sync-azure', 'identity', true);
    });

    /**
     * Gate ② — the ServiceNow side, chased through a different team than the
     * Azure one. Telling them apart is the whole reason ADR-0025 D5 kept two
     * messages, and ADR-0029 makes it machine-readable.
     */
    it('names `sync-servicenow` when gate ② has not opened', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { serviceNowUserSyncedAt: null } }),
      );

      // 🔴 A DIFFERENT owner from sync-azure, on identical-looking symptoms.
      // Collapsing the two would send the operator to the wrong team.
      await expectBlockedAt('sync-servicenow', 'servicenow', true);
    });

    it('names `directory` when Graph cannot find the user yet', async () => {
      arrangeHappy();
      graph.findUser.mockResolvedValue(null);

      await expectBlockedAt('directory', 'identity', true);
    });

    it('names `usage-location` when the user has none and none was supplied', async () => {
      arrangeHappy();
      graph.findUser.mockResolvedValue({
        id: 'aad-1',
        userPrincipalName: 'new.user@rhk.com',
        displayName: 'New User',
        usageLocation: null,
        accountEnabled: true,
      });

      // The one gate the operator clears on the spot — the assign dialog takes
      // an override — so `operator`, and retrying the same call is pointless.
      await expectBlockedAt('usage-location', 'operator', false);
    });

    it('names `budget` when the OpCo allocation is used up', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(5, 5));

      await expectBlockedAt('budget', 'admin', false);
    });

    /**
     * 🔴 The pair that must never be folded together. `budget` above is green
     * here (arrangeHappy leaves headroom) and `seats` still refuses — which is
     * exactly the 2026-08-07 DEV shape, and exactly what the mockup's single
     * `precheck` step could not have said. Different owner, different remedy.
     */
    it('names `seats` when the tenant has none left, with budget green', async () => {
      arrangeHappy();
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

      await expectBlockedAt('seats', 'procurement', false);
    });

    // ── CH-026 / ADR-0032 D4 — the seat gate says what it means ──────────────

    /**
     * 🔴 The Graph inventory read is asserted as NOT happening, not merely as
     * "the assign succeeded". `getSubscribedSkus` returning [] here means that
     * if the skip branch is removed, `!tenantSku` refuses and this goes red —
     * which is exactly the falsification CH-026 E-5 asks for. Asserting only
     * the outcome would let a version that still calls Graph pass.
     */
    it('skips the tenant seat gate for an unlimited SKU, without reading Graph inventory', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({
          sku: {
            id: 'c1',
            skuId: 'guid-1',
            skuPartNumber: 'POWER_BI_STANDARD',
            seatModel: 'unlimited',
          },
        }),
      );
      graph.getSubscribedSkus.mockResolvedValue([]);

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      expect(res.outcome).toBe('assigned');
      expect(graph.getSubscribedSkus).not.toHaveBeenCalled();
      const seats = res.steps.find((s) => s.key === 'seats');
      // `skipped`, not `ok` — nothing was checked, and assign-step.ts is explicit
      // that collapsing those two is how a screen ends up claiming a check ran.
      expect(seats).toMatchObject({ key: 'seats', status: 'skipped' });
      expect(seats?.detail).toBe(
        'POWER_BI_STANDARD is marked unlimited — it has no prepaid seat count to check.',
      );
      // Still ten steps in run order: skipping a check is not dropping it.
      expect(res.steps).toHaveLength(10);
    });

    it('refuses a prepaid SKU with no prepaid seats, and stops calling it "no seats left"', async () => {
      arrangeHappy();
      // POWER_BI_PRO on the live tenant: 0 owned, 91 in use (ADR-0032 Context).
      graph.getSubscribedSkus.mockResolvedValue([
        {
          skuId: 'guid-1',
          skuPartNumber: 'SPE_E3',
          prepaidEnabled: 0,
          consumedUnits: 91,
          capabilityStatus: 'Enabled',
          appliesTo: 'User',
        },
      ]);

      const body = await blockedBody();
      expect(body.failedAt).toBe('seats');
      const steps = body.steps as AssignStep[];
      expect(steps[steps.length - 1]).toMatchObject({
        key: 'seats',
        status: 'failed',
        whoFixes: 'procurement',
      });
      // Hard-coded expectation, not one derived from the fixture: a message
      // rebuilt from the same values would pass no matter what it said.
      expect(body.message).toBe(
        'Tenant has no prepaid seats for SPE_E3 (0 owned, 91 in use) — ' +
          'M365 reports no purchased seat count. ' +
          'If this SKU is not licensed per seat, mark it unlimited in SKU Catalog.',
      );
    });

    it('leaves the ordinary "seats used up" message word for word', async () => {
      arrangeHappy();
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

      const body = await blockedBody();
      expect(body.message).toBe('No available seats for SKU SPE_E3');
    });

    it('keeps `message` alongside the new shape so an unchanged caller still renders an error', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ request: { azureSyncedAt: null } }),
      );

      const body = await blockedBody();

      // ADR-0029 Consequences named "the error message goes blank" as the risk
      // of changing this body. This is the assertion that keeps it from
      // happening — it must fail if anyone drops `message`.
      expect(body.message).toBe(
        'Phase 1 sync gate not passed: azureSyncedAt is null',
      );
    });

    /**
     * W45 G4 / plan R3 — `detail` carries vendor error text, and vendor error
     * text quotes UPNs (BUG-004's whole shape). A reviewer cannot see this: the
     * scrub is one call inside a string that reads fine either way, so it needs
     * a test that goes red when the call is removed.
     */
    it('scrubs email-shaped tokens out of `detail` before it leaves the service', async () => {
      arrangeHappy();
      // The realistic carrier: this line has no RITM, so the write-back goes to
      // the parent REQ, and the failure text is ServiceNow's own.
      snow.addWorkNote.mockRejectedValue(
        new Error(
          "Resource '/users/new.user@rhk.com' does not exist or one of its " +
            'queried reference-property objects are not present',
        ),
      );

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      const ticket = res.steps.find((s) => s.key === 'ticket');
      expect(ticket?.status).toBe('failed');
      // Asserted as a PATTERN, not as "!== the UPN we sent": a regression that
      // leaked a *different* address would still have to fail this.
      expect(ticket?.detail).not.toMatch(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
      // …and the diagnostic value survives — a scrub that ate the whole string
      // would pass the line above while making the step useless.
      expect(ticket?.detail).toContain('does not exist');
    });

    /**
     * W45 G6 — an override is NOT an `ok` budget check. ADR-0016 R4 counts on
     * "override used" meaning the allocation was actually busted.
     */
    it('reports `budget: overridden` when an admin goes past a busted allocation', async () => {
      arrangeHappy();
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(ledgerRow(3, 3));

      const res = await service.assignLineItem(
        'li1',
        undefined,
        ADMIN,
        'urgent onboarding, CFO approved',
      );

      expect(res.outcome).toBe('assigned');
      const budget = res.steps.find((s) => s.key === 'budget');
      expect(budget?.status).toBe('overridden');
      // The numbers that make the override auditable, and nothing else.
      expect(budget?.detail).toContain('3 assigned of 3 allocated');
      // 🔴 H4 — the reason is free text an admin typed. It belongs on the
      // timeline and in the audit log, not in an API response.
      expect(budget?.detail).not.toContain('CFO');
    });

    it('reports `budget: ok` when a reason is supplied but nothing was actually overridden', async () => {
      arrangeHappy(); // ledgerRow() = 3 assigned of 10 — plenty of headroom

      const res = await service.assignLineItem(
        'li1',
        undefined,
        ADMIN,
        'sent out of habit',
      );

      // Same rule as the timeline and the audit row: an override that did not
      // happen must not be claimed anywhere, or R4's count stops being honest.
      expect(res.steps.find((s) => s.key === 'budget')?.status).toBe('ok');
    });
  });

  /**
   * CH-023 / ADR-0031 §Outcome — ADR-0029 made the ServiceNow outcome visible;
   * this makes it survive the dialog being closed. Chris asked for it hours
   * after using ADR-0029 for real, then immediately demonstrated why: asked
   * whether that morning's FORMS_PRO line had a RITM, the answer was "沒有印象".
   */
  describe('assignLineItem — ServiceNow outcome on the timeline (CH-023)', () => {
    /** The note this change adds — NOT the ASSIGN event written inside the tx. */
    const noteCall = () =>
      prisma.requestEvent.create.mock.calls.find(
        (c: any) => c[0].data.type === 'NOTE',
      )?.[0].data;

    it('records the RITM close, so the fact outlives the dialog', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1' }),
      );

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      const ticket = res.steps.find((s) => s.key === 'ticket');
      expect(noteCall()).toEqual({
        requestId: 'r1',
        lineItemId: 'li1',
        type: 'NOTE',
        actorId: 'admin',
        // 🔴 G5 — derived, not re-phrased. If someone edits the step's wording
        // and not the timeline's, this still passes, which is the point: there
        // is only one sentence to edit.
        message: `ServiceNow ${ticket?.status}: ${ticket?.detail}`,
      });
      // …and the line below is why the one above is not a tautology: THIS text
      // comes from neither the step nor the service, so a message derived from
      // the wrong step (or an empty one) fails here.
      expect(noteCall().message).toBe('ServiceNow ok: RITM close requested');
    });

    /**
     * The expensive one. `skipped` is the exact question W44 F7-12 spent two
     * days and a live ServiceNow query answering for one request — and until
     * now, answering it again a week later meant querying ServiceNow again.
     */
    it('records that NOTHING was written back when the line has no RITM and no mirror', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({
          serviceNowSysId: null,
          request: { serviceNowSysId: null },
        }),
      );

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(noteCall().message).toBe(
        'ServiceNow skipped: This line has no RITM and the request has no ' +
          'ServiceNow mirror',
      );
    });

    it('records a failed write-back too, without displacing the Delivery failures row', async () => {
      arrangeHappy(); // no RITM on the line → work note on the parent REQ
      snow.addWorkNote.mockRejectedValue(new Error('SN down'));

      await service.assignLineItem('li1', undefined, ADMIN);

      expect(noteCall().message).toContain('ServiceNow failed:');
      expect(noteCall().message).toContain('SN down');
      // The existing surface for a failure is unchanged — the timeline note is
      // additional, not a replacement (ADR-0009 D1: coexist, don't supersede).
      expect(failures.record).toHaveBeenCalled();
    });

    /**
     * 🔴 CH-023 P1 / G4. Heavier than the non-fatal write-back it describes: by
     * the time this note is written the licence IS on the user and the ledger
     * HAS moved. A 500 here would tell an operator to retry something already
     * done — and on this path "retry" means a second licence assignment.
     */
    it('never turns a completed assign into a failure when the note cannot be written', async () => {
      arrangeHappy();
      prisma.requestEvent.create.mockRejectedValue(new Error('db gone'));

      const res = await service.assignLineItem('li1', undefined, ADMIN);

      expect(res.outcome).toBe('assigned');
      expect(res.lineItem).toBeDefined();
      // The response shape is unchanged down to the steps — a swallowed error
      // must not quietly truncate what the caller renders.
      expect(res.steps.map((s) => s.key)).toContain('ticket');
      expect(res.steps.every((s) => s.status !== 'failed')).toBe(true);
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
      /**
       * BUG-006 — the queued table has to match the one we actually tried.
       * `repairWorkNote` replays this payload verbatim, so a payload that
       * disagreed with the original call would make every retry fail the same
       * way the first attempt did, forever, with nothing pointing at why.
       */
      expect(entry.payload.table).toBe('sc_request');
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
        { kind: 'ritm', sysId: 'ritm-1' },
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

    /**
     * CH-020 — the queued row has to say which record the sys_id is, so the
     * repair addresses the same table the original write did. ADR-0025 D1
     * removed the only producer of `targetKind: 'task'` from this path, but the
     * field stays: `outbound-retry` still reads it, older queued rows may still
     * carry it, and dropping it would make those unreplayable.
     */
    it('records which kind of ticket a failed close was against', async () => {
      arrangeHappy();
      prisma.requestLineItem.findUnique.mockResolvedValue(
        readyItem({ serviceNowSysId: 'ritm-1' }),
      );
      tickets.closeComplete.mockResolvedValue({
        status: 'error',
        details: 'the RITM is no longer open',
      });

      await expect(
        service.assignLineItem('li1', undefined, ADMIN),
      ).resolves.toBeDefined();

      expect(failures.record).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            snTarget: 'ritm-1',
            targetKind: 'ritm',
          }),
        }),
      );
    });
  });
});
