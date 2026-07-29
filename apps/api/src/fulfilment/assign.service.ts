import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type AppUser, EventType, LineItemStage, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  LicenseOperationsProvider,
  type DirectoryUser,
} from '../integration/license-ops/license-ops.provider';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { TicketUpdateProvider } from '../integration/ticket-update/ticket-update.provider';
import { assertOpcoScope } from '../auth/opco-scope';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { aggregateRequestStatus } from './stage.service';
import { OutboundFailureService } from './outbound-failure.service';
import {
  OUTBOUND_FAILURE_KINDS,
  TICKET_TRANSITIONS,
  type TicketTransition,
} from './outbound-failure-fields';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';

/**
 * Module D-2 — fulfilment actions (the hardest critical path).
 * markSynced opens the Phase 1 sync gate; assignLineItem does the real
 * Graph assignment, ledger increment and ServiceNow write-back.
 */
@Injectable()
export class AssignService {
  private readonly logger = new Logger(AssignService.name);

  constructor(
    private readonly prisma: PrismaService,
    // ADR-0017 seam ② (W38). The concrete provider is chosen in the module —
    // this service must never learn which one it got, or the two paths start
    // to diverge (D0).
    private readonly licenseOps: LicenseOperationsProvider,
    // ADR-0017 seam ④ (W40). Same rule as seam ② above: this service must never
    // learn which implementation it got.
    private readonly tickets: TicketUpdateProvider,
    private readonly snow: ServiceNowService,
    private readonly failures: OutboundFailureService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Human break-glass for the Phase 1 sync gate.
   *
   * W37 / ADR-0015 D3 — deliberately KEPT after the scheduled sweep landed:
   * when Graph is unreachable or Entra Connect is broken, someone still needs a
   * way through. But it stays what it always was — an assertion, not evidence —
   * so its timeline message now says so outright (SYNC_GATE_MESSAGE.MANUAL).
   * Everything else about this endpoint (roles, OpCo scope, return shape) is
   * unchanged.
   */
  async markSynced(requestId: string, actor: AppUser) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException(`Request ${requestId} not found`);
    // AUTH-3a: OPCO_IT may only open the sync gate on its own OpCo (fail-closed).
    assertOpcoScope(actor, request.opcoId);

    const now = new Date();
    const updated = await this.prisma.request.update({
      where: { id: requestId },
      data: {
        azureSyncedAt: now,
        accountCreatedAt: request.accountCreatedAt ?? now,
      },
    });
    await this.prisma.requestEvent.create({
      data: {
        requestId,
        type: EventType.SYNC,
        message: SYNC_GATE_MESSAGE.MANUAL,
      },
    });
    return updated;
  }

  /**
   * Assign a READY line item: gate → Graph assignLicense → atomic domain
   * writes (line item ASSIGNED + ledger +1 + event + status) → SN write-back.
   * Gates fail closed — nothing is written unless the assign succeeds.
   */
  async assignLineItem(
    lineItemId: string,
    usageLocationOverride: string | undefined,
    actor: AppUser,
    budgetOverrideReason?: string,
  ) {
    const item = await this.prisma.requestLineItem.findUnique({
      where: { id: lineItemId },
      include: { request: true, sku: true },
    });
    if (!item) throw new NotFoundException(`Line item ${lineItemId} not found`);

    // ── Gates (fail closed, in order) ──
    // AUTH-3a scope gate first: an OPCO_IT actor may only assign within its OpCo.
    assertOpcoScope(actor, item.request.opcoId);

    // ADR-0016 D3/D4 — the budget override is ADMIN-only, and a non-admin
    // supplying it is a PERMISSION error (403), not something to ignore:
    // silently dropping it would let an OPCO_IT operator believe the override
    // took effect. REGIONAL is deliberately excluded too (D3, fail-closed).
    const overrideReason = budgetOverrideReason?.trim();
    if (budgetOverrideReason !== undefined && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only an admin may override the OpCo budget',
      );
    }
    // Whitespace-only survives the DTO's MinLength — but a blank reason defeats
    // the whole point of requiring one.
    if (budgetOverrideReason !== undefined && !overrideReason) {
      throw new BadRequestException(
        'budgetOverrideReason cannot be blank — the reason is what makes the override auditable',
      );
    }
    if (item.stage !== LineItemStage.READY) {
      throw new BadRequestException(
        `Line item must be READY to assign (currently ${item.stage})`,
      );
    }
    const request = item.request;
    if (!request.azureSyncedAt) {
      throw new BadRequestException(
        'Phase 1 sync gate not passed: azureSyncedAt is null',
      );
    }
    // findUser returns null for a genuine 404 (not synced yet) but *throws* on
    // an auth / network / throttle failure. The provider wraps that into the
    // same 503 this service used to build itself (BUG-002: a raw Graph error
    // carries status -1 and crashes the Nest process).
    const user: DirectoryUser | null = await this.licenseOps.findUser(
      request.targetUpn,
    );
    if (!user) {
      throw new BadRequestException(
        'Target user not found in Azure AD (not synced yet)',
      );
    }
    const usageLocation =
      usageLocationOverride ?? user.usageLocation ?? undefined;
    if (!usageLocation) {
      throw new BadRequestException(
        'User has no usageLocation; provide one to assign',
      );
    }
    // ── OpCo budget gate (ADR-0016) ──
    // Placed BEFORE the Graph inventory read (D5): a request that busts the
    // OpCo's own budget must not cost a vendor round-trip, and "your OpCo has no
    // allocation left" is the more actionable message of the two.
    //
    // NOTE the boundary this does NOT cross: allocatedQuantity still does not
    // take part in drift reconciliation (reconcile.service.ts is untouched, and
    // must stay that way — ADR-0016 Context / AP-10). What changed is only that
    // it stopped being purely decorative.
    const ledger = await this.prisma.opcoSkuLedger.findUnique({
      where: {
        opcoId_skuCatalogId: {
          opcoId: request.opcoId,
          skuCatalogId: item.sku.id,
        },
      },
      select: { allocatedQuantity: true, assignedQuantity: true },
    });
    // No ledger row = nothing was ever allocated → refuse. There is no
    // "unlimited by default" (D1); the way out is to set an allocation.
    const allocated = ledger?.allocatedQuantity ?? 0;
    const assignedBefore = ledger?.assignedQuantity ?? 0;
    // +1, not + item.quantity: one assign moves the ledger by exactly one seat
    // (see the increment in the transaction below). D1 keeps that unchanged.
    const overBudget = assignedBefore + 1 > allocated;
    if (overBudget && !overrideReason) {
      // D6: a block writes no AuditLog — but it should not be invisible either.
      // H4: ids and counts only, never the target UPN.
      //
      // W40 note: ADR-0016 D6 said a block "changes no state". That is no
      // longer literally true — the hold below records ticketHeldAt — but the
      // part that mattered still holds: nothing about the ASSIGNMENT changes,
      // no licence moves and no ledger number moves.
      this.logger.warn(
        `OpCo budget gate blocked line item ${lineItemId} (${item.sku.skuPartNumber}, opco ${request.opcoId}): ${assignedBefore}/${allocated}`,
      );
      // W40 / ADR-0017 D3 (OQ-E) — tell ServiceNow this item is waiting on
      // procurement. Non-fatal and at most once; see holdTicket.
      await this.holdTicket(item, request.id);
      throw new BadRequestException(
        `OpCo budget exceeded for ${item.sku.skuPartNumber}: ${assignedBefore} assigned of ${allocated} allocated. ` +
          'Raise the allocation or ask an admin to override.',
      );
    }
    // An admin may send a reason on an assign that is comfortably within
    // budget; nothing was overridden then, so neither the timeline nor the
    // audit trail may claim one was. "Override used" must mean the gate
    // actually stopped this assign (R4 counts on that number being honest).
    const budgetOverridden = overBudget && !!overrideReason;

    const skus = await this.licenseOps.listTenantSkus();
    const tenantSku = skus.find((s) => s.skuId === item.sku.skuId);
    if (!tenantSku || tenantSku.consumedUnits >= tenantSku.prepaidEnabled) {
      throw new BadRequestException(
        `No available seats for SKU ${item.sku.skuPartNumber}`,
      );
    }

    // ── The assignment itself (external side-effect, BEFORE the DB transaction) ──
    // A transport failure throws (503) exactly as before; what comes back here
    // is a semantic outcome (ADR-0017 D2, W38 plan §7 D1).
    const outcome = await this.licenseOps.assignLicense(
      request.targetUpn,
      item.sku.skuId,
      { usageLocation },
    );
    // W39 OQ-1 (Chris, 2026-07-28): 'already_assigned' is treated EXACTLY like
    // 'assigned' — ledger increment included.
    //
    // Only the n8n provider can report it; Graph's POST is idempotent and says
    // nothing, so on that path a replay has always counted as a fresh assign.
    // Acting on n8n's extra knowledge here would mean switching provider also
    // switches ledger semantics, which is precisely what D0 forbids. The
    // double-count risk is real but PRE-EXISTING: fixing it is a separate
    // change that has to fix both paths at once, not a side effect of 庚.
    if (
      outcome.status !== 'assigned' &&
      outcome.status !== 'already_assigned'
    ) {
      // Still loud for everything else. 'not_synced' cannot reach here (the
      // findUser gate above already returned 400) and 'no_seats' is produced by
      // neither provider — the seat check is the platform's own, and workflow
      // 2003 deliberately does not do one. So this stays a genuine "should not
      // happen", not a swallowed case.
      // H4: the status word only — outcome.details must never be echoed.
      throw new ServiceUnavailableException(
        `License provider returned an outcome this path does not handle: ${outcome.status}`,
      );
    }

    // ── Atomic domain writes (OD2) — only assignedQuantity moves (DESIGN §5) ──
    const updated = await this.prisma.$transaction(async (tx) => {
      const li = await tx.requestLineItem.update({
        where: { id: lineItemId },
        data: { stage: LineItemStage.ASSIGNED, assignedAt: new Date() },
      });
      await tx.opcoSkuLedger.upsert({
        where: {
          opcoId_skuCatalogId: {
            opcoId: request.opcoId,
            skuCatalogId: item.sku.id,
          },
        },
        create: {
          opcoId: request.opcoId,
          skuCatalogId: item.sku.id,
          assignedQuantity: 1,
        },
        update: { assignedQuantity: { increment: 1 } },
      });
      await tx.requestEvent.create({
        data: {
          requestId: request.id,
          lineItemId: item.id,
          type: EventType.ASSIGN,
          fromStage: LineItemStage.READY,
          toStage: LineItemStage.ASSIGNED,
          actorId: actor.id,
          // ADR-0016 D6: an override has to be visible on the request's own
          // timeline, not only in the admin-only audit log — the people reading
          // this request are the ones who need to know the budget was busted.
          message: budgetOverridden
            ? `Assigned ${item.sku.skuPartNumber} — OpCo budget overridden (${assignedBefore}/${allocated}): ${overrideReason}`
            : `Assigned ${item.sku.skuPartNumber}`,
        },
      });
      // ADR-0016 D6 — the override also lands in the platform audit trail, in
      // the SAME transaction as the assign it describes (ADR-0009 D8.1: "done
      // but unrecorded" is the outcome that trail exists to prevent).
      //
      // Deviation from D6 as written, owner-approved 2026-07-27: D6 assumed an
      // existing `ASSIGN` action and a free-form metadata bag, neither of which
      // the ADR-0009 whitelist has. It is its own action + three whitelisted
      // non-PII keys instead — see the plan changelog.
      if (budgetOverridden) {
        await this.audit.log(tx, {
          action: AUDIT_ACTIONS.ASSIGN_BUDGET_OVERRIDE,
          targetType: 'RequestLineItem',
          targetId: item.id,
          actorId: actor.id,
          metadata: {
            budgetOverride: true,
            reason: overrideReason,
            allocated,
            assignedBefore,
          },
        });
      }
      const siblings = await tx.requestLineItem.findMany({
        where: { requestId: request.id },
        select: { stage: true },
      });
      await tx.request.update({
        where: { id: request.id },
        data: { status: aggregateRequestStatus(siblings.map((s) => s.stage)) },
      });
      return li;
    });

    // ── ServiceNow write-back (mirror only, non-fatal — OD4) ──
    const note = `License ${item.sku.skuPartNumber} assigned via platform.`;
    if (item.serviceNowSysId) {
      /**
       * W40 / OQ-E — this line has its own RITM (ADR-0008 D6 two-level), and
       * assigning it is precisely what that RITM asked for, so close it. The
       * close note carries the text the work note used to.
       *
       * No duplicate-close guard needed: the stage gate above rejects anything
       * that is not READY, so a line item can only reach here once.
       *
       * 🔴 Deliberately NOT falling back to request.serviceNowSysId the way the
       * work note below does. That is the parent REQ (sc_request), while seam ④
       * only ever writes sc_req_item — workflow 2004 has the table baked into
       * its patch URL. Closing a REQ is also not the same statement as closing
       * one RITM: the other lines may still be open. ADR-0017 D3 is explicit
       * that the platform closes LICENSE RITMs and nothing else.
       */
      await this.writeTicket(
        TICKET_TRANSITIONS.CLOSE,
        item.serviceNowSysId,
        note,
        request.id,
      );
    } else if (request.serviceNowSysId) {
      // Legacy rows with no per-line RITM keep the behaviour they have always
      // had: a work note on the parent mirror, direct (OQ-A — 2004 has no
      // note-without-state mode, so this path cannot go through the seam).
      const snTarget = request.serviceNowSysId;
      /**
       * BUG-006 — this used to pass 'sc_req_item' here too. The sys_id had two
       * possible sources but the table name only ever had one, and the two have
       * to move together: the parent REQ lives in sc_request (that is the table
       * DirectServiceNowProvider creates it in), so addressing it in the RITM
       * table looks up a record that does not exist there.
       *
       * Named once and reused for the queued payload, because the retry path
       * replays that payload — two literals here would be two things to keep in
       * step, and only one of them would be visible from the other.
       */
      const snTable = 'sc_request';
      try {
        await this.snow.addWorkNote(snTarget, note, snTable);
      } catch (err) {
        this.logger.warn(
          `ServiceNow write-back failed for request ${request.id}: ${
            (err as Error).message
          }`,
        );
        // ADR-0011 (I1): queue it, but STILL swallow. The assignment itself
        // succeeded — the licence is on the user and the ledger has moved. A
        // missing mirror note must not turn a completed assign into a failure
        // (OD4 unchanged); it just stops being invisible.
        await this.failures.record({
          kind: OUTBOUND_FAILURE_KINDS.SERVICENOW_WORKNOTE,
          payload: { snTarget, note, table: snTable },
          error: err,
          requestId: request.id,
        });
      }
    }

    // H4: never log the target UPN (PII) — sku + ids only.
    this.logger.log(
      `Assigned line item ${lineItemId} (${item.sku.skuPartNumber}, request ${request.id})`,
    );
    return updated;
  }

  // ── seam ④ helpers (W40) ────────────────────────────────────────────────

  /**
   * Tell ServiceNow this line is waiting on procurement — AT MOST ONCE.
   *
   * The guard is the whole point. A blocked assign throws, and an operator can
   * retry a blocked assign as many times as they like (raise the allocation,
   * try again, ask an admin, try again). Without `ticketHeldAt` every one of
   * those attempts would PATCH a real customer ticket.
   *
   * ⚠️ Known edge: the flag is written only when the write SUCCEEDS, so a hold
   * that failed and was later repaired from the queue can still be attempted
   * once more on the next blocked assign. That is idempotent on ServiceNow's
   * side (state 2 → 2) and preferable to marking it held when we do not know
   * that it is.
   */
  private async holdTicket(
    item: {
      id: string;
      serviceNowSysId: string | null;
      ticketHeldAt: Date | null;
      sku: { skuPartNumber: string };
    },
    requestId: string,
  ): Promise<void> {
    // No per-line RITM → nothing this seam may write (see the close path).
    if (!item.serviceNowSysId || item.ticketHeldAt) return;

    const note =
      `License unavailable for ${item.sku.skuPartNumber} — procurement in progress. ` +
      'Item on hold.';
    const held = await this.writeTicket(
      TICKET_TRANSITIONS.HOLD,
      item.serviceNowSysId,
      note,
      requestId,
    );
    if (!held) return;

    await this.prisma.requestLineItem.update({
      where: { id: item.id },
      data: { ticketHeldAt: new Date() },
    });
  }

  /**
   * One RITM state change, non-fatal (ADR-0011 OD4). Returns whether the ticket
   * actually moved.
   *
   * Two ways it can fail, and both are the same thing to the caller:
   *   - the provider THREW    — transport / config (see the seam's error contract)
   *   - it answered `error`   — n8n patched with neverError, so ServiceNow can
   *                             refuse (row-level ACL) while the webhook says 200
   */
  private async writeTicket(
    transition: TicketTransition,
    snTarget: string,
    note: string,
    requestId: string,
  ): Promise<boolean> {
    try {
      const outcome =
        transition === TICKET_TRANSITIONS.CLOSE
          ? await this.tickets.closeComplete(snTarget, note)
          : await this.tickets.markInProgress(snTarget, note);
      if (outcome.status === 'updated') return true;
      // H4: `details` is the provider's own operator-facing text — both
      // implementations are required to strip the vendor's message, so this is
      // safe to record. Never the raw workflow/vendor body.
      await this.queueTicketFailure(
        transition,
        snTarget,
        note,
        requestId,
        new Error(outcome.details),
      );
    } catch (err) {
      await this.queueTicketFailure(transition, snTarget, note, requestId, err);
    }
    return false;
  }

  private async queueTicketFailure(
    transition: TicketTransition,
    snTarget: string,
    note: string,
    requestId: string,
    error: unknown,
  ): Promise<void> {
    this.logger.warn(
      `ServiceNow ticket ${transition} failed for request ${requestId}: ${
        (error as Error)?.message
      }`,
    );
    await this.failures.record({
      kind: OUTBOUND_FAILURE_KINDS.SERVICENOW_TICKET_UPDATE,
      payload: { snTarget, note, transition },
      error,
      requestId,
    });
  }
}
