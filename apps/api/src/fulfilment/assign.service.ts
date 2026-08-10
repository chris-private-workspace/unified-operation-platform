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
import {
  TicketUpdateProvider,
  type TicketTarget,
} from '../integration/ticket-update/ticket-update.provider';
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
import { scrubPii } from '../integration/scrub-pii';
import {
  type AssignResult,
  type AssignStep,
  type AssignStepKey,
  type AssignStepOwner,
} from './assign-step';

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

    /**
     * ADR-0029 — every gate now records a step as well as failing closed.
     *
     * Local rather than a field: this service is a singleton, and two
     * concurrent assigns sharing instance state would interleave their steps.
     *
     * `fail` returns `never` so TypeScript keeps narrowing after it exactly as
     * the bare `throw` did — the gates below read the same as before.
     */
    const steps: AssignStep[] = [];
    const pass = (key: AssignStepKey) => {
      steps.push({ key, status: 'ok' });
    };
    const fail = (
      key: AssignStepKey,
      detail: string,
      whoFixes: AssignStepOwner,
      retryable = false,
    ): never => {
      // BUG-004 shape: `directory` and `sync-*` details can embed the target
      // UPN, so it is scrubbed on the way out — `message` included, since that
      // is the same string.
      const safe = scrubPii(detail);
      steps.push({ key, status: 'failed', detail: safe, retryable, whoFixes });
      throw new BadRequestException({
        outcome: 'blocked',
        failedAt: key,
        steps,
        /**
         * Kept ALONGSIDE the new shape, not replaced by it. ADR-0029
         * Consequences named the risk: a caller still reading `message` would
         * render an empty error. Keeping it costs one field and means no
         * moment exists where the UI silently loses its error text.
         */
        message: safe,
      });
    };

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
      fail(
        'stage',
        `Line item must be READY to assign (currently ${item.stage})`,
        'operator',
      );
    }
    pass('stage');
    const request = item.request;
    if (!request.azureSyncedAt) {
      // retryable: nothing is broken — the sweep opens this gate on its own
      // once Entra Connect has the user (ADR-0015).
      fail(
        'sync-azure',
        'Phase 1 sync gate not passed: azureSyncedAt is null',
        'identity',
        true,
      );
    }
    pass('sync-azure');
    /**
     * ADR-0025 D5 — gate ②. The line above is deliberately UNTOUCHED, wording
     * and all: its meaning has not changed, and it has tests pinned to it.
     *
     * Two messages rather than one because the operator has to know WHICH side
     * they are waiting on — the two are chased differently (Entra Connect on one
     * side, the ServiceNow user import on the other), and "sync gate not passed"
     * alone tells them nothing about who to ask.
     *
     * 🔴 Neither gate is overridable, and `budgetOverrideReason` does not reach
     * here. That is not an oversight: an override exists so a human can take
     * responsibility for a BUDGET decision. A sync gate is not a decision — it
     * is a statement of fact about whether the person exists yet, and there is
     * no such thing as knowingly assigning a licence to someone who does not.
     */
    if (!request.serviceNowUserSyncedAt) {
      // Distinct owner from sync-azure on purpose — this is the whole reason
      // ADR-0025 D5 kept them as two messages: the two are chased through
      // different teams, and "sync gate not passed" alone says neither.
      fail(
        'sync-servicenow',
        'ServiceNow sync gate not passed: the target user is not in ServiceNow yet',
        'servicenow',
        true,
      );
    }
    pass('sync-servicenow');
    // findUser returns null for a genuine 404 (not synced yet) but *throws* on
    // an auth / network / throttle failure. The provider wraps that into the
    // same 503 this service used to build itself (BUG-002: a raw Graph error
    // carries status -1 and crashes the Nest process).
    const user: DirectoryUser | null = await this.licenseOps.findUser(
      request.targetUpn,
    );
    if (!user) {
      fail(
        'directory',
        'Target user not found in Azure AD (not synced yet)',
        'identity',
        true,
      );
    }
    pass('directory');
    const usageLocation =
      // `user` cannot be null here — `fail` above throws — but TypeScript does
      // not treat a `never`-returning arrow const as a narrowing point, so the
      // optional chain is for the compiler, not for a case that can happen.
      usageLocationOverride ?? user?.usageLocation ?? undefined;
    if (!usageLocation) {
      // The only gate the operator can clear on the spot — the assign dialog
      // takes an override.
      fail(
        'usage-location',
        'User has no usageLocation; provide one to assign',
        'operator',
      );
    }
    pass('usage-location');
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
      fail(
        'budget',
        `OpCo budget exceeded for ${item.sku.skuPartNumber}: ${assignedBefore} assigned of ${allocated} allocated. ` +
          'Raise the allocation or ask an admin to override.',
        'admin',
      );
    }
    // An admin may send a reason on an assign that is comfortably within
    // budget; nothing was overridden then, so neither the timeline nor the
    // audit trail may claim one was. "Override used" must mean the gate
    // actually stopped this assign (R4 counts on that number being honest).
    const budgetOverridden = overBudget && !!overrideReason;
    if (budgetOverridden) {
      // Reported as `overridden`, not `ok` — the gate refused and a human went
      // past it. H4: numbers and the SKU only; `overrideReason` is free text an
      // admin typed and is deliberately NOT echoed here. It already lives on
      // the request timeline and in the audit log, both of which are narrower
      // surfaces than an API response.
      steps.push({
        key: 'budget',
        status: 'overridden',
        detail:
          `OpCo budget exceeded for ${item.sku.skuPartNumber} ` +
          `(${assignedBefore} assigned of ${allocated} allocated) — overridden by an admin.`,
      });
    } else {
      pass('budget');
    }

    const skus = await this.licenseOps.listTenantSkus();
    const tenantSku = skus.find((s) => s.skuId === item.sku.skuId);
    if (!tenantSku || tenantSku.consumedUnits >= tenantSku.prepaidEnabled) {
      /**
       * 🔴 A SEPARATE step from `budget`, and this is the whole argument for
       * not folding them the way the mockup does. 2026-08-07 on DEV hit BOTH
       * layers on real traffic. The remedies do not overlap: this one is "buy
       * more tenant seats", `budget` is "raise this OpCo's allocation".
       */
      fail(
        'seats',
        `No available seats for SKU ${item.sku.skuPartNumber}`,
        'procurement',
      );
    }
    pass('seats');

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
    // 'already_assigned' counts as ok here for the same reason it counts for
    // the ledger (W39 OQ-1): the provider distinction must not leak into
    // platform semantics.
    pass('assign');

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
    pass('ledger');

    // ── ServiceNow write-back (mirror only, non-fatal — OD4) ──
    const note = `License ${item.sku.skuPartNumber} assigned via platform.`;
    const ticketTarget = this.ticketTarget(item);
    if (ticketTarget) {
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
        ticketTarget,
        note,
        request.id,
      );
      /**
       * "requested", not "closed". `writeTicket` is non-fatal by design
       * (ADR-0011 I1): a refused close is queued and execution still returns
       * here. Claiming a confirmed close would be the same overstatement W44
       * F7-12 spent two days disproving — Delivery failures stays the source of
       * truth for whether it actually landed.
       */
      steps.push({
        key: 'ticket',
        status: 'ok',
        detail: 'RITM close requested',
      });
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
        steps.push({
          key: 'ticket',
          status: 'ok',
          detail: 'Work note added to the parent REQ (this line has no RITM)',
        });
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
        // Recorded as failed even though it is swallowed. The assign itself
        // succeeded, so the outcome stays 'assigned' — but the operator can now
        // see that the mirror note did not land, instead of having to notice
        // its absence in ServiceNow.
        steps.push({
          key: 'ticket',
          status: 'failed',
          detail: scrubPii((err as Error).message),
          retryable: true,
          whoFixes: 'platform',
        });
      }
    } else {
      /**
       * ADR-0029 — `skipped`, deliberately not `ok`. This is the line that
       * answers "did anything get closed on the ServiceNow side" without anyone
       * having to query ServiceNow: W44 F7-12 needed two days and a live SN
       * query to establish exactly this fact for one request.
       */
      steps.push({
        key: 'ticket',
        status: 'skipped',
        detail:
          'This line has no RITM and the request has no ServiceNow mirror',
      });
    }

    // H4: never log the target UPN (PII) — sku + ids only.
    this.logger.log(
      `Assigned line item ${lineItemId} (${item.sku.skuPartNumber}, request ${request.id})`,
    );
    const result: AssignResult = { outcome: 'assigned', steps };
    /**
     * `lineItem` is kept ALONGSIDE the ADR-0029 shape rather than replacing the
     * old return value. Callers that read the line item keep working, and no
     * moment exists where the response is valid-but-useless to them.
     */
    return { ...result, lineItem: updated };
  }

  // ── seam ④ helpers (W40) ────────────────────────────────────────────────

  /**
   * Which ServiceNow record this line's state change addresses: its own RITM,
   * or nothing.
   *
   * 🔴 ADR-0025 D1 — this used to check `serviceNowTaskSysId` FIRST, on
   * ADR-0024 D6's premise that n8n workflow 1001 hands over a Windows Domain
   * Account task and waits for the platform to close it. **That premise was
   * disproved against the live instance** (2026-08-03): n8n closes that task
   * itself — `close_notes = 'Closed & Handled by n8n'`, two live examples — and
   * the note-only branch its own JSON describes has never run once (zero
   * `Awaiting E5 licence` journal entries instance-wide). The premise came
   * entirely from comments and sticky notes inside the workflow JSON, which
   * record intent, not behaviour.
   *
   * Keeping the branch meant every assign PATCHed a task n8n had already
   * closed: the `active=false` guard correctly refused, and filed a Delivery
   * failure for a non-problem.
   *
   * The two columns stay on the model as traceability — which WDA task n8n
   * handled for this line — and no longer drive anything.
   *
   * One resolver for both transitions on purpose: hold and close must never
   * disagree about which ticket a line item is, or a line could be held on one
   * record and closed on another.
   */
  private ticketTarget(item: {
    serviceNowSysId: string | null;
  }): TicketTarget | null {
    if (item.serviceNowSysId) {
      return { kind: 'ritm', sysId: item.serviceNowSysId };
    }
    return null;
  }

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
    // No per-line RITM or task → nothing this seam may write (see the close path).
    const target = this.ticketTarget(item);
    if (!target || item.ticketHeldAt) return;

    const note =
      `License unavailable for ${item.sku.skuPartNumber} — procurement in progress. ` +
      'Item on hold.';
    const held = await this.writeTicket(
      TICKET_TRANSITIONS.HOLD,
      target,
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
    target: TicketTarget,
    note: string,
    requestId: string,
  ): Promise<boolean> {
    try {
      const outcome =
        transition === TICKET_TRANSITIONS.CLOSE
          ? await this.tickets.closeComplete(target, note)
          : await this.tickets.markInProgress(target, note);
      if (outcome.status === 'updated') return true;
      // H4: `details` is the provider's own operator-facing text — both
      // implementations are required to strip the vendor's message, so this is
      // safe to record. Never the raw workflow/vendor body.
      await this.queueTicketFailure(
        transition,
        target,
        note,
        requestId,
        new Error(outcome.details),
      );
    } catch (err) {
      await this.queueTicketFailure(transition, target, note, requestId, err);
    }
    return false;
  }

  private async queueTicketFailure(
    transition: TicketTransition,
    target: TicketTarget,
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
      // CH-020 — `targetKind` travels with the sys_id because a replay has to
      // know which one it is holding. Without it the retry would default to
      // RITM and query `request_item=<task sys_id>`, which finds nothing: the
      // repair could never succeed, and the reason would not be visible
      // anywhere in the row.
      payload: {
        snTarget: target.sysId,
        targetKind: target.kind,
        note,
        transition,
      },
      error,
      requestId,
    });
  }
}
