import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestService } from '../fulfilment/request.service';
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

@Injectable()
export class AgentApprovalService {
  private readonly logger = new Logger(AgentApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestService,
    private readonly aiAssist: AiAssistService,
  ) {}

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

    if (proposal.kind !== 'line_items') {
      // `assign` joins this in 期二 G1, and it arrives with its own 8 gates.
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
    return this.aiAssist.resumeRun(proposal.runId, [
      { ref: proposal.interruptionRef ?? '', approved: false, reason },
    ]);
  }

  // ── the domain half ────────────────────────────────────────

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
