import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestService } from '../fulfilment/request.service';
import { AssignService } from '../fulfilment/assign.service';
import type { AssignStep } from '../fulfilment/assign-step';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  AiAssistService,
  type AiAssistRunResult,
} from '../agent/ai-assist.service';

/**
 * W46 F6 / ADR-0036 D3 — a person decides, and only then does anything happen.
 *
 * 🔴 WHY THIS MODULE EXISTS AT ALL (Chris 2026-08-15, H1).
 *
 * Approving a proposal has to touch both sides: the existing line-item path
 * (domain) and `resume()` (agent). D0 forbids the `agent` module from importing
 * any domain service, so this work cannot live there — and putting it in
 * `fulfilment` would make licence fulfilment responsible for knowing when an
 * agent run resumes, which is not its job.
 *
 * So it lives in its own thin module that imports both. The rule in D0 stays
 * literally true, and this file is not the agent: it is what happens after a
 * human says yes. It holds no gate of its own — every check that mattered
 * before still runs inside `RequestService.addLineItem`.
 */

/** The shape `propose_line_items` puts in `AgentProposal.payload`. */
interface LineItemsPayload {
  requestId: string;
  items: { skuId: string; quantity: number }[];
}

/** The shape `propose_assign` puts in `AgentProposal.payload`. */
interface AssignPayload {
  lineItemId: string;
}

/**
 * What `AssignService` throws when a gate refuses (ADR-0029): a 400 whose body
 * carries the step list. Narrowed here rather than imported because the shape
 * IS the contract — that is ADR-0029's own wording — and because the agent path
 * only needs to read it, never to build one.
 */
interface BlockedAssign {
  outcome?: string;
  failedAt?: string;
  message?: string;
}

@Injectable()
export class AgentApprovalService {
  private readonly logger = new Logger(AgentApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestService,
    private readonly assign: AssignService,
    private readonly aiAssist: AiAssistService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 🔴 OUTSIDE any transaction, and after the decision is stored.
   *
   * By the time this runs, real work has happened — line items exist, or a
   * rejection has been written. `outbound-retry.service.ts:398-401` states the
   * rule for exactly this position: a repair that succeeded must not be undone
   * by an audit hiccup. (The opposite choice is correct at run START, where
   * nothing irreversible precedes it — see `ai-assist.service.ts`.)
   *
   * Approve and reject share ONE action and are told apart by `reason`, because
   * R13 — approvals degenerating into rubber-stamping — has to be one query.
   */
  private async auditDecision(
    proposal: { id: string },
    approver: AppUser,
    reason: string,
  ): Promise<void> {
    await this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.AGENT_PROPOSAL_DECIDED,
      targetType: 'AgentProposal',
      targetId: proposal.id,
      actorId: approver.id,
      metadata: { reason },
    });
  }

  /**
   * @param approver the person accountable for the write. 🔴 They are the actor
   *   passed to the domain path — not the person who started the run. The run's
   *   starter supplies the agent's READ scope (`AiAssistService.resumeRun`);
   *   the approver supplies the authority for the WRITE. Two different people
   *   with two different roles, and collapsing them would lose one of them.
   */
  async approve(
    proposalId: string,
    approver: AppUser,
  ): Promise<AiAssistRunResult> {
    const proposal = await this.loadDecidable(proposalId);

    if (proposal.kind === 'assign')
      return this.approveAssign(proposal, approver);

    if (proposal.kind !== 'line_items') {
      throw new BadRequestException(
        `Proposals of kind '${proposal.kind}' cannot be approved yet`,
      );
    }

    const created = await this.createLineItems(proposal, approver);

    /**
     * 🔴 Marked `executed` BEFORE the resume, and the order is load-bearing:
     * `propose_line_items.execute` looks for exactly this row and throws when
     * it is absent (tool-registry.ts). So if the runtime ever calls the tool
     * without the platform having done the work, it refuses — loudly, instead
     * of quietly returning a success for something nobody did.
     */
    await this.prisma.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'executed',
        approvedById: approver.id,
        decidedAt: new Date(),
        payload: {
          ...(proposal.payload as unknown as Record<string, unknown>),
          createdLineItemIds: created,
        },
      },
    });

    await this.auditDecision(
      proposal,
      approver,
      `approved: ${created.length} line item(s) created`,
    );

    return this.aiAssist.resumeRun(proposal.runId, [
      { ref: proposal.interruptionRef ?? '', approved: true },
    ]);
  }

  async reject(
    proposalId: string,
    reason: string,
    approver: AppUser,
  ): Promise<AiAssistRunResult> {
    const proposal = await this.loadDecidable(proposalId);

    await this.prisma.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'rejected',
        approvedById: approver.id,
        rejectedReason: reason,
        decidedAt: new Date(),
      },
    });

    /**
     * Resumed rather than abandoned, so the reason reaches the model and it can
     * react instead of proposing the same thing again. Nothing in the domain
     * moved on this path — that is acceptance A10's second half, and it is true
     * by construction here: there is no domain call in this method.
     */
    await this.auditDecision(proposal, approver, `rejected: ${reason}`);

    return this.aiAssist.resumeRun(proposal.runId, [
      { ref: proposal.interruptionRef ?? '', approved: false, reason },
    ]);
  }

  // ── the domain half ────────────────────────────────────────

  /**
   * 期二 G1 — an approved `assign` proposal runs `AssignService.assignLineItem`,
   * which is the SAME call the request screen makes. All eight gates, in order,
   * none skipped.
   *
   * 🔴 The approver is the actor, and the call stops at three arguments: the
   * budget-override parameter is never supplied on this path, and there is no
   * route for one to reach it (see `propose_assign`). ADR-0016 D3 makes that
   * override ADMIN-only AND requires a written reason; routing it through here
   * would mean approving a sentence a model composed. An operator who wants to
   * override does it on the request screen, as themselves, with their own words.
   *
   * ⚠️ The name of that parameter is deliberately not written anywhere in this
   * file — `agent.boundary.spec.ts` greps for it, and a comment explaining the
   * rule would trip the rule. CH-029 hit exactly this and the fix there was the
   * same: change the comment, never loosen the check.
   *
   * 🔴 A refusal is NOT a failure of this method. ADR-0016's gates exist to say
   * no, and F8 tells the approver so in as many words ("Approving runs the
   * platform's normal checks — they can still refuse"). So a blocked assign:
   *
   *   - marks the proposal `failed`, never `executed` — which is what stops
   *     `propose_assign.execute` from reporting a success back to the model
   *   - resumes the run with `approved: false` AND the real reason, so the
   *     agent learns which gate said no instead of being told a person
   *     rejected it. Those are different facts and the transcript should not
   *     merge them.
   *
   * ⚠️ Only an ADR-0029 `blocked` body is treated this way. Anything else — a
   * 403 because the approver is out of scope, a database error — is rethrown
   * untouched: reporting those to the agent as "the platform refused" would be
   * a lie about what happened, and INC-001 is this project's own record of what
   * that costs.
   */
  private async approveAssign(
    proposal: {
      id: string;
      runId: string;
      payload: unknown;
      interruptionRef: string | null;
    },
    approver: AppUser,
  ): Promise<AiAssistRunResult> {
    const { lineItemId } = this.parseAssignPayload(proposal.payload);

    let assigned: { outcome: string; steps: AssignStep[] } | null = null;
    let refusal: string | null = null;

    try {
      const result = await this.assign.assignLineItem(
        lineItemId,
        undefined,
        approver,
      );
      // Only these two fields are kept. The full return also carries the line
      // item row, and this payload is both shown on screen and handed back to
      // the model — so it stays as small as the thing it has to explain.
      assigned = { outcome: result.outcome, steps: result.steps };
    } catch (error) {
      const body = (error as { response?: BlockedAssign })?.response;
      if (body?.outcome !== 'blocked') throw error;

      refusal = `The platform refused at the '${body.failedAt}' check: ${body.message}`;
      this.logger.warn(
        `Approved assign proposal ${proposal.id} was blocked at ${body.failedAt}`,
      );
    }

    await this.prisma.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: refusal ? 'failed' : 'executed',
        approvedById: approver.id,
        rejectedReason: refusal,
        decidedAt: new Date(),
        payload: {
          ...(proposal.payload as unknown as Record<string, unknown>),
          // Always written, `null` when the gates refused. An absent key would
          // read as "not recorded"; null says "nothing was assigned", which is
          // the fact.
          //
          // Cast for the same reason `outbound-failure.service.ts:58` casts:
          // Prisma's InputJsonValue rejects a declared interface (no index
          // signature), and `AssignStep` is one.
          assign: assigned as Prisma.InputJsonValue | null,
        },
      },
    });

    await this.auditDecision(
      proposal,
      approver,
      refusal
        ? `approved, then blocked by the platform: ${refusal}`
        : `approved: line item ${lineItemId} assigned`,
    );

    return this.aiAssist.resumeRun(proposal.runId, [
      {
        ref: proposal.interruptionRef ?? '',
        approved: refusal === null,
        ...(refusal ? { reason: refusal } : {}),
      },
    ]);
  }

  /** `propose_assign` names exactly one line item, and nothing else. */
  private parseAssignPayload(payload: unknown): AssignPayload {
    const lineItemId = (payload as AssignPayload | null)?.lineItemId;
    if (typeof lineItemId !== 'string' || lineItemId.length === 0) {
      throw new BadRequestException(
        'This proposal names no line item to assign',
      );
    }
    return { lineItemId };
  }

  /**
   * Run the EXISTING line-item creation path, once per proposed SKU.
   *
   * 🔴 Every id is resolved before the first write. The proposal already
   * checked these GUIDs when it was made, and that is not good enough: a
   * proposal can sit overnight, and a SKU that went inactive in between would
   * otherwise be discovered halfway through, leaving some lines created and
   * some not.
   *
   * ⚠️ What is NOT claimed here is atomicity. `RequestService.addLineItem`
   * writes a line, an event and a status recompute, and it takes no
   * transaction client, so N calls are N units of work. Pre-resolving removes
   * the failure this would realistically hit; a database-level failure partway
   * would still leave part of the list created, and the proposal is marked
   * `failed` rather than `executed` when that happens. Stated rather than
   * papered over.
   */
  private async createLineItems(
    proposal: { id: string; runId: string; payload: unknown },
    approver: AppUser,
  ): Promise<string[]> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: proposal.runId },
      select: { requestId: true },
    });
    if (!run?.requestId) {
      throw new ConflictException(
        'This run is not attached to a request, so there is nothing to add line items to',
      );
    }

    const payload = this.parsePayload(proposal.payload);

    /**
     * 🔴 The request comes from the RUN ROW, never from the payload — the
     * payload was written by a language model. They are compared, and a
     * mismatch refuses, because it would mean the proposal a person read
     * described a different request from the one about to be written to.
     */
    if (payload.requestId !== run.requestId) {
      throw new BadRequestException(
        'This proposal names a different request from the run it belongs to',
      );
    }

    const resolved = await this.resolveSkus(payload.items);

    const created: string[] = [];
    try {
      for (const item of resolved) {
        const line = await this.requests.addLineItem(
          run.requestId,
          { skuCatalogId: item.skuCatalogId, quantity: item.quantity },
          approver,
        );
        created.push(line.id);
      }
    } catch (err) {
      await this.prisma.agentProposal.update({
        where: { id: proposal.id },
        data: { status: 'failed', decidedAt: new Date() },
      });
      this.logger.error(
        `Proposal ${proposal.id} failed after creating ${created.length} of ${resolved.length} line items`,
      );
      throw err;
    }

    return created;
  }

  private parsePayload(payload: unknown): LineItemsPayload {
    const record = payload as Record<string, unknown> | null;
    const requestId = record?.requestId;
    const items = record?.items;

    if (typeof requestId !== 'string' || !Array.isArray(items)) {
      throw new BadRequestException('This proposal has no readable payload');
    }
    if (items.length === 0) {
      throw new BadRequestException('This proposal has no line items');
    }

    return {
      requestId,
      items: items.map((raw) => {
        const item = raw as Record<string, unknown>;
        if (typeof item.skuId !== 'string') {
          throw new BadRequestException('A proposed item has no skuId');
        }
        const quantity = item.quantity;
        if (
          typeof quantity !== 'number' ||
          !Number.isInteger(quantity) ||
          quantity < 1
        ) {
          throw new BadRequestException(
            'A proposed item has an invalid quantity',
          );
        }
        return { skuId: item.skuId, quantity };
      }),
    };
  }

  /** GUID → catalogue row id. The domain path takes the row id, not the GUID. */
  private async resolveSkus(
    items: LineItemsPayload['items'],
  ): Promise<{ skuCatalogId: string; quantity: number }[]> {
    const skuIds = items.map((item) => item.skuId);
    const rows = await this.prisma.skuCatalog.findMany({
      where: { skuId: { in: skuIds }, active: true },
      select: { id: true, skuId: true },
    });

    return items.map((item) => {
      const row = rows.find((candidate) => candidate.skuId === item.skuId);
      if (!row) {
        throw new BadRequestException(
          `SKU ${item.skuId} is unknown or no longer active — this proposal cannot be approved as it stands`,
        );
      }
      return { skuCatalogId: row.id, quantity: item.quantity };
    });
  }

  // ── loading ────────────────────────────────────────────────

  private async loadDecidable(proposalId: string) {
    const proposal = await this.prisma.agentProposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        runId: true,
        kind: true,
        payload: true,
        status: true,
        interruptionRef: true,
        run: { select: { status: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    // Not "already decided" as one condition: a proposal that is `executed` and
    // one that is `rejected` are different situations for whoever is looking at
    // the screen, and the message they get should say which.
    if (proposal.status !== 'pending') {
      throw new ConflictException(
        `This proposal was already ${proposal.status}`,
      );
    }
    if (proposal.run.status !== 'awaiting_approval') {
      throw new ConflictException(
        `The run behind this proposal is ${proposal.run.status}, so a decision would change nothing`,
      );
    }
    if (!proposal.interruptionRef) {
      // Without it the decision cannot be matched back to the tool call the
      // runtime paused on, and approving "some pause" is not approving anything.
      throw new ConflictException(
        'This proposal has no runtime reference and cannot be resumed',
      );
    }

    return proposal;
  }
}
