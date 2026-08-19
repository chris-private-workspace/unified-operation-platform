import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOpcoScope, scopeWhere } from '../auth/opco-scope';
import { scrubPii } from '../integration/scrub-pii';
import {
  AgentBlastRadiusExceededError,
  type AgentTool,
  type AgentToolContext,
} from './agent-tool';

/**
 * W46 F2 / ADR-0036 D2 — the allow-list, and the only place tools exist.
 *
 * 🔴 THE decision of this file: the platform does not use any SDK's
 * `allowedTools` / `disallowedTools` / `canUseTool` as a security boundary. A
 * tool that is not registered here is not restricted — it is structurally
 * absent. "Cannot see it" beats "told not to use it" by an order of magnitude,
 * because the first is architecture and the second is a prompt.
 *
 * This is ADR-0034 D1 applied again: there the platform asked Graph itself
 * rather than letting the provider report holdings; here the platform decides
 * what tools exist rather than letting the SDK enforce it. Both are ADR-0017 D0
 * used properly, not softened.
 *
 * Adding a row to this list is widening an agent's power, so it needs an ADR
 * (R12). `tool-registry.spec.ts` pins the list word for word — a new tool with
 * no matching test change is a red build, not a review comment.
 *
 * ⚠️ SDK-side guardrails may run as a SECOND layer, but never as the only one
 * and never as something a test treats as the gate (D2 / plan OQ-6).
 */

/**
 * Row cap on every read. Two separate reasons, both real: an agent that pulls
 * the whole request table burns the context window it needs for the actual
 * reasoning, and a tool with no ceiling is a tool whose blast radius nobody
 * has measured. 50 is a starting number, not a finding.
 */
const MAX_ROWS = 50;

/**
 * 期二 G3 / plan B4 — the blast-radius limit: how many tool calls one run may
 * make **on its own**.
 *
 * 🔴 Read the qualifier. This counts tools with `needsApproval: false` — the
 * ones the agent can reach without anybody saying yes. A `propose_*` call is
 * deliberately NOT counted and NOT capped, because it is already bounded by
 * something far stronger than a number: a person has to decide it (D3). Capping
 * it as well would mean an approved proposal could be refused by a counter
 * AFTER the platform had already done the work.
 *
 * 🔴 And be precise about what this bounds. A Tier 1 agent cannot write
 * (D3), so the blast radius of an unbounded run is COST and LOAD, not damage —
 * a model call per turn and a database read per tool. Calling this a safety
 * limit would overstate it; the safety property is that there is nothing to
 * limit, and that one belongs to the approval gate.
 *
 * What it is NOT: a stop. Refusing a call bounds what the run DOES; how long
 * the run keeps talking is bounded by the runtime's own turn ceiling
 * (`MAX_TURNS` in the provider), which is an SDK-side second layer and is
 * labelled as one (D2 — never the gate).
 *
 * 25 is a starting number, not a finding. A real AI-Assist run reads one
 * request, searches the catalogue a few times, maybe checks a ledger: three to
 * ten. The ceiling is deliberately several times that, because a limit tight
 * enough to bite in normal use gets raised until it does not.
 */
export const MAX_AUTONOMOUS_TOOL_CALLS = 25;

/** What one run has spent, and whether it may spend more. */
export interface BlastRadius {
  used: number;
  limit: number;
  exceeded: boolean;
}

/**
 * 🔴 plan §3.4 / R15 — a SKU is named by its `skuId` GUID and nothing else.
 *
 * `businessAlias` exists precisely because names are unreliable, and the
 * catalogue really does carry two E5 variants (`SPE_E5` and
 * `Microsoft_365_E5_(no_Teams)`, ADR-0020), so "the E5 one" does not identify a
 * product. A language model is exactly the caller that will supply a part
 * number, a display name, or a GUID it invented — this is the shape check, and
 * an existence check against the live catalogue follows it. Both halves are
 * needed: format alone accepts a hallucinated GUID, existence alone would have
 * to guess what `SPE_E5` was supposed to mean.
 */
const SKU_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new BadRequestException('Tool arguments must be an object');
  }
  return args as Record<string, unknown>;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`\`${key}\` must be a non-empty string`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new BadRequestException(`\`${key}\` must be a string`);
  }
  return value;
}

@Injectable()
export class AgentToolRegistry {
  private readonly tools: readonly AgentTool[];

  /**
   * The names the blast-radius counter watches — every tool the agent can reach
   * without a human, derived from `needsApproval` rather than listed.
   *
   * 🔴 Derived, because a hand-written list here would be a second place to
   * remember, and the failure it produces is silent in the worst direction: a
   * new autonomous tool missing from the list is a tool with no ceiling at all.
   */
  private readonly autonomousNames: readonly string[];

  constructor(private readonly prisma: PrismaService) {
    const defined = [
      this.listPendingRequests(),
      this.getRequest(),
      this.searchCatalog(),
      this.getLedger(),
      this.proposeLineItems(),
      this.proposeAssign(),
    ];

    this.autonomousNames = Object.freeze(
      defined.filter((tool) => !tool.needsApproval).map((tool) => tool.name),
    );

    /**
     * 🔴 Every tool is wrapped, at the one place tools come into existence.
     *
     * The alternative — a check at the top of each `execute` — is six copies
     * today and a seventh that somebody forgets. Wrapping here means a tool
     * added next month is capped because of where it was declared, not because
     * its author remembered.
     */
    this.tools = Object.freeze(defined.map((tool) => this.capped(tool)));
  }

  /**
   * The allow-list itself — every tool that exists, regardless of who asks.
   *
   * ⚠️ This is NOT what a runtime should hand to a model. It answers "what has
   * the platform built", which is what a spec asserts and what a resume needs
   * in order to recognise a pause it is being asked to decide. `list(ctx)`
   * below answers "what may THIS run use", and that is the one a provider
   * wants.
   *
   * 🔴 The split is why `list` kept the shorter name and gained a required
   * argument: a provider that calls `all()` is visibly reaching past a
   * boundary, and a provider that forgets `list`'s argument does not compile.
   * The alternative — an optional argument defaulting to "everything" — fails
   * open, and W48 F3-4 is a boundary where failing open means a chat with no
   * request reading every request in the operator's OpCo.
   */
  all(): readonly AgentTool[] {
    return this.tools;
  }

  /**
   * W48 F3-4 / ADR-0041 D3 — the tools THIS run may use.
   *
   * A run with no request (`ctx.requestId === null`) does not get the
   * request-scoped tools. Not "gets them and is refused" — they are absent
   * from what the model is shown, which is ADR-0036 D2's whole argument
   * applied to a narrower question than it was written for.
   *
   * ⚠️ What this deliberately does NOT do is narrow OpCo scope. That still
   * comes from `ctx.user`, inside each tool, unchanged. A chat WITH a request
   * gets exactly the tools a run has always had — including the ability to
   * name a different request in the same OpCo, which is a pre-existing
   * property of `get_request` and not something this phase decided.
   */
  list(ctx: AgentToolContext): readonly AgentTool[] {
    if (ctx.requestId !== null) return this.tools;
    return this.tools.filter((tool) => !tool.requestScoped);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.find((tool) => tool.name === name);
  }

  /**
   * 期二 G3 — what this run has spent of its autonomous budget.
   *
   * 🔴 Counted from `AgentStep`, which is the platform's own record of what it
   * observed happening (D4) — not from an in-memory tally. Three reasons, and
   * the first two are the ones that decide it: a run resumes after an approval
   * that may land the next morning, in a different process; and a registry
   * holding per-run counters would be a map nobody empties.
   *
   * ⚠️ The honest cost of reading the ledger: if step writes were failing, the
   * count would stop advancing and the cap would stop biting — a fail-OPEN
   * direction. It is accepted rather than hidden, because a platform whose
   * action ledger is not being written has a louder problem than an
   * over-talkative agent, and `onToolExecuted` is deliberately unable to fail a
   * tool call (provider) so the alternative wiring is not available anyway.
   *
   * ⚠️ `status: 'ok'` — a refused or broken call did not spend the budget.
   * Counting failures too would let one flaky read exhaust a run's allowance.
   */
  async blastRadius(runId: string): Promise<BlastRadius> {
    const used = await this.prisma.agentStep.count({
      where: {
        runId,
        status: 'ok',
        key: { in: [...this.autonomousNames] },
      },
    });
    return {
      used,
      limit: MAX_AUTONOMOUS_TOOL_CALLS,
      exceeded: used >= MAX_AUTONOMOUS_TOOL_CALLS,
    };
  }

  /**
   * The ceiling, applied around one tool.
   *
   * A tool that needs approval passes through untouched — see
   * `MAX_AUTONOMOUS_TOOL_CALLS` for why that is the design and not an oversight.
   */
  private capped(tool: AgentTool): AgentTool {
    if (tool.needsApproval) return tool;
    return {
      ...tool,
      execute: async (args: unknown, ctx: AgentToolContext) => {
        const budget = await this.blastRadius(ctx.runId);
        if (budget.exceeded) {
          throw new AgentBlastRadiusExceededError(
            budget.used,
            budget.limit,
            tool.name,
          );
        }
        return tool.execute(args, ctx);
      },
    };
  }

  // ── read tools (needsApproval: false) ──────────────────────

  private listPendingRequests(): AgentTool {
    return {
      name: 'list_pending_requests',
      description:
        "List licence requests that are not finished yet, within the caller's OpCo scope. Target email addresses are redacted here — use get_request for the detail of a single request.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      needsApproval: false,
      // Takes no request id and still counts (W48 F3-4): it RETURNS them, so a
      // context-free chat that kept this would have the starting point for
      // every other request tool.
      requestScoped: true,
      execute: async (_args: unknown, ctx: AgentToolContext) => {
        const rows = await this.prisma.request.findMany({
          where: {
            ...scopeWhere(ctx.user),
            status: { in: [RequestStatus.OPEN, RequestStatus.IN_PROGRESS] },
          },
          select: {
            id: true,
            opcoId: true,
            status: true,
            targetUpn: true,
            createdAt: true,
            opco: { select: { code: true } },
            lineItems: { select: { stage: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: MAX_ROWS,
        });

        return rows.map((row) => ({
          requestId: row.id,
          opcoId: row.opcoId,
          opcoCode: row.opco.code,
          status: row.status,
          stages: [...new Set(row.lineItems.map((line) => line.stage))],
          createdAt: row.createdAt,
          // plan §3.1 says scrubbed, and the list genuinely does not need an
          // identity — it answers "which requests exist", not "who are they".
          targetUpn: scrubPii(row.targetUpn),
        }));
      },
    };
  }

  private getRequest(): AgentTool {
    return {
      name: 'get_request',
      description:
        'Read one licence request in full, including the original free-text wording of the request and the line items already on it.',
      parameters: {
        type: 'object',
        properties: {
          requestId: { type: 'string', description: 'Request id (cuid).' },
        },
        required: ['requestId'],
        additionalProperties: false,
      },
      needsApproval: false,
      requestScoped: true,
      execute: async (args: unknown, ctx: AgentToolContext) => {
        const requestId = requireString(asRecord(args), 'requestId');

        const request = await this.prisma.request.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            opcoId: true,
            status: true,
            targetUpn: true,
            targetDisplayName: true,
            rawRequestText: true,
            opco: { select: { code: true, displayName: true } },
            lineItems: {
              select: {
                id: true,
                quantity: true,
                stage: true,
                sku: {
                  select: {
                    skuId: true,
                    skuPartNumber: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        });
        if (!request) throw new NotFoundException('Request not found');
        // After the read, because the scope question needs the row's opcoId —
        // and fail-closed either way: a scoped user asking about another OpCo
        // gets 403, never a silent empty answer that reads like "no such data".
        assertOpcoScope(ctx.user, request.opcoId);

        /**
         * 🔴 `rawRequestText` and `targetUpn` leave here UNSCRUBBED, and that
         * is deliberate: parsing the original wording IS the AI-Assist task, so
         * redacting it would hand the agent a blank. The defences are placed
         * elsewhere — the transcript is scrubbed on the way into AgentMessage
         * (D6) and tracing is off (D11).
         *
         * ⚠️ What that leaves standing is real and belongs on the record:
         * inference itself sends this text to a third-party model provider.
         * ADR-0036 never decided that question, and it is not a bug in this
         * file — it is a gap in the ADR. It must be answered before F5 sends a
         * single real request to a live model.
         */
        return {
          requestId: request.id,
          opcoId: request.opcoId,
          opcoCode: request.opco.code,
          status: request.status,
          targetUpn: request.targetUpn,
          targetDisplayName: request.targetDisplayName,
          rawRequestText: request.rawRequestText,
          lineItems: request.lineItems.map((line) => ({
            lineItemId: line.id,
            skuId: line.sku.skuId,
            skuPartNumber: line.sku.skuPartNumber,
            displayName: line.sku.displayName,
            quantity: line.quantity,
            stage: line.stage,
          })),
        };
      },
    };
  }

  private searchCatalog(): AgentTool {
    return {
      name: 'search_catalog',
      description:
        'Search the active licence catalogue. Returns skuId GUIDs; a GUID is the ONLY way to name a SKU when proposing line items — never a product name or a part number.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Free text matched against display name, part number and business alias. Empty string returns the catalogue.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      needsApproval: false,
      // The catalogue belongs to nobody's request. A chat with no context can
      // still answer "what is the GUID for E5", and that is the kind of
      // question D3 was never trying to stop.
      requestScoped: false,
      execute: async (args: unknown) => {
        const query = optionalString(asRecord(args), 'query').trim();
        const match = query
          ? {
              OR: [
                {
                  displayName: {
                    contains: query,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  skuPartNumber: {
                    contains: query,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  businessAlias: {
                    contains: query,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {};

        const rows = await this.prisma.skuCatalog.findMany({
          where: { active: true, ...match },
          // displayName and skuPartNumber are returned as well as the GUID, and
          // they have to be: matching a request that says "give them E5" needs
          // something to match against. What must never happen is a GUID being
          // *derived* from them downstream — propose_line_items re-checks.
          select: {
            skuId: true,
            skuPartNumber: true,
            displayName: true,
            businessAlias: true,
            category: true,
            seatModel: true,
          },
          orderBy: { displayName: 'asc' },
          take: MAX_ROWS,
        });
        return rows;
      },
    };
  }

  private getLedger(): AgentTool {
    return {
      name: 'get_ledger',
      description:
        "Read one OpCo's allocated and assigned quantity for one SKU. Allocated is the OpCo's budget; assigned is what the platform has recorded as handed out.",
      parameters: {
        type: 'object',
        properties: {
          opcoId: { type: 'string', description: 'OpCo id (cuid).' },
          skuId: {
            type: 'string',
            description: 'SKU GUID from search_catalog.',
          },
        },
        required: ['opcoId', 'skuId'],
        additionalProperties: false,
      },
      needsApproval: false,
      // Keyed by OpCo and SKU, never by a request — and already bounded by
      // `assertOpcoScope` below.
      requestScoped: false,
      execute: async (args: unknown, ctx: AgentToolContext) => {
        const record = asRecord(args);
        const opcoId = requireString(record, 'opcoId');
        const skuId = requireString(record, 'skuId');
        assertOpcoScope(ctx.user, opcoId);

        const sku = await this.prisma.skuCatalog.findUnique({
          where: { skuId },
          select: { id: true },
        });
        if (!sku) {
          throw new BadRequestException(
            `Unknown skuId: ${scrubPii(skuId)} — use search_catalog`,
          );
        }

        const ledger = await this.prisma.opcoSkuLedger.findUnique({
          where: {
            opcoId_skuCatalogId: { opcoId, skuCatalogId: sku.id },
          },
          select: { allocatedQuantity: true, assignedQuantity: true },
        });

        // No row is not the same fact as zero of each, and the difference
        // matters here: "this OpCo has never been allocated this SKU" is a
        // reason to stop, "allocated 0" is a reason to ask for budget.
        return {
          opcoId,
          skuId,
          exists: ledger !== null,
          allocatedQuantity: ledger?.allocatedQuantity ?? 0,
          assignedQuantity: ledger?.assignedQuantity ?? 0,
        };
      },
    };
  }

  // ── propose tools (needsApproval: true, zero side-effects) ──

  private proposeLineItems(): AgentTool {
    return {
      name: 'propose_line_items',
      description:
        'Propose the licence line items for a request. This creates nothing: the proposal goes to a person, and only a person can accept it. Name every SKU by its skuId GUID from search_catalog.',
      parameters: {
        type: 'object',
        properties: {
          requestId: { type: 'string', description: 'Request id (cuid).' },
          items: {
            type: 'array',
            description: 'One entry per SKU being proposed.',
            items: {
              type: 'object',
              properties: {
                skuId: {
                  type: 'string',
                  description: 'SKU GUID — never a name or part number.',
                },
                quantity: { type: 'integer', minimum: 1 },
              },
              required: ['skuId', 'quantity'],
              additionalProperties: false,
            },
          },
          reasoning: {
            type: 'string',
            description:
              'Why these SKUs, in terms of what the request actually says. A person reads this before approving.',
          },
        },
        required: ['requestId', 'items', 'reasoning'],
        additionalProperties: false,
      },
      /**
       * 🔴 D3 — literally `true`, never a function. What it buys is that the
       * SDK stops BEFORE `execute` ever runs, which is why the body below can
       * be read as "what happens after a human said yes".
       */
      needsApproval: true,
      requestScoped: true,
      execute: async (args: unknown, ctx: AgentToolContext) => {
        const record = asRecord(args);
        const requestId = requireString(record, 'requestId');
        requireString(record, 'reasoning');

        const rawItems = record.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          throw new BadRequestException('`items` must be a non-empty array');
        }

        const items = rawItems.map((raw) => {
          const item = asRecord(raw);
          const skuId = requireString(item, 'skuId');
          if (!SKU_GUID.test(skuId)) {
            // scrubPii on an identifier field: if a model puts an email-shaped
            // string where a GUID belongs, this message is where it would
            // surface — in a log, in an API response, in a step detail.
            throw new BadRequestException(
              `\`skuId\` must be a SKU GUID, got ${scrubPii(skuId)} — use search_catalog`,
            );
          }
          const quantity = item.quantity;
          if (
            typeof quantity !== 'number' ||
            !Number.isInteger(quantity) ||
            quantity < 1
          ) {
            throw new BadRequestException(
              '`quantity` must be a positive integer',
            );
          }
          return { skuId, quantity };
        });

        const request = await this.prisma.request.findUnique({
          where: { id: requestId },
          select: { id: true, opcoId: true },
        });
        if (!request) throw new NotFoundException('Request not found');
        assertOpcoScope(ctx.user, request.opcoId);

        const skuIds = items.map((item) => item.skuId);
        const known = await this.prisma.skuCatalog.findMany({
          where: { skuId: { in: skuIds }, active: true },
          select: { skuId: true },
        });
        const missing = skuIds.filter(
          (skuId) => !known.some((row) => row.skuId === skuId),
        );
        if (missing.length > 0) {
          throw new BadRequestException(
            `Unknown or inactive skuId: ${missing.map((id) => scrubPii(id)).join(', ')}`,
          );
        }

        /**
         * 🔴 This tool is READ-ONLY, and that is not a limitation — it is what
         * makes the approval real.
         *
         * The order in D3 / plan §3.2 is: a person approves → the PLATFORM runs
         * the existing line-item creation path → the run resumes → the SDK
         * finally calls this. So by the time execution reaches here the work is
         * already done, and creating anything would create it a second time.
         * What the agent gets back is the outcome, so it can keep reasoning.
         *
         * 🔴 The throw below is the second layer under D2. If `needsApproval`
         * ever fails to stop the run — an SDK bug, a bad adapter, a future
         * provider — this tool finds no approved proposal and refuses. Nothing
         * is created either way, and the failure is loud instead of a silent
         * write nobody sanctioned.
         */
        const proposal = await this.prisma.agentProposal.findFirst({
          where: { runId: ctx.runId, kind: 'line_items', status: 'executed' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, approvedById: true, payload: true },
        });
        if (!proposal) {
          throw new BadRequestException(
            'No approved line-item proposal for this run — a person has to approve it first',
          );
        }

        return {
          proposalId: proposal.id,
          status: proposal.status,
          approvedById: proposal.approvedById,
          result: proposal.payload,
        };
      },
    };
  }

  /**
   * 期二 G1 — propose assigning a licence that is already a READY line item.
   *
   * Named in ADR-0036 §3.2 and plan §2.2 from the start, so this is the tool the
   * ADR planned rather than a new row being slipped into the allow-list (R12).
   *
   * 🔴 Three things this tool deliberately CANNOT express, each of them a gate
   * somebody could otherwise talk their way past:
   *
   *  1. **No budget override.** ADR-0016 D3 makes that override ADMIN-only and
   *     demands a written reason, because it is the one gate a person is
   *     allowed to overrule. Putting it in this schema would let a model
   *     compose the sentence that overrules it — and the approver would be
   *     agreeing to a reason they did not write. If budget blocks, the operator
   *     overrides it on the request screen, as themselves.
   *  2. **No usage-location override.** Same shape, smaller blast radius.
   *  3. **No SKU, no quantity, no request.** It names ONE existing line item.
   *     Anything the agent might want to change about what is being assigned
   *     has to go through `propose_line_items` first — and be approved there.
   *
   * Like `propose_line_items`, `execute` is READ-ONLY and only ever runs after
   * a person has decided (D3): the platform performs the assign, marks the
   * proposal, and only then resumes the run.
   */
  private proposeAssign(): AgentTool {
    return {
      name: 'propose_assign',
      description:
        'Propose assigning the licence for ONE existing READY line item. This assigns nothing: a person decides, and the platform then runs its own eight checks — which can still refuse. Use get_request to find lineItemId.',
      parameters: {
        type: 'object',
        properties: {
          lineItemId: {
            type: 'string',
            description: 'Line item id (cuid) from get_request.',
          },
          reasoning: {
            type: 'string',
            description:
              'Why this line is ready to assign, in terms of the request. A person reads this before approving.',
          },
        },
        required: ['lineItemId', 'reasoning'],
        additionalProperties: false,
      },
      needsApproval: true,
      // A line item only exists inside a request, so this is request-scoped
      // even though the word does not appear in its schema.
      requestScoped: true,
      execute: async (args: unknown, ctx: AgentToolContext) => {
        const record = asRecord(args);
        const lineItemId = requireString(record, 'lineItemId');
        requireString(record, 'reasoning');

        const line = await this.prisma.requestLineItem.findUnique({
          where: { id: lineItemId },
          select: {
            id: true,
            stage: true,
            request: { select: { opcoId: true } },
          },
        });
        if (!line) throw new NotFoundException('Line item not found');
        assertOpcoScope(ctx.user, line.request.opcoId);

        /**
         * 🔴 The same second layer `propose_line_items` carries, and it matters
         * more here: if `needsApproval` ever fails to stop the run, the next
         * thing that would happen is a real licence being assigned. This
         * refuses instead, and refuses loudly.
         *
         * Note it looks for `executed` — the approval path marks a proposal
         * the gates REFUSED as `failed`, so a blocked assign never reads as an
         * approved one here.
         */
        const proposal = await this.prisma.agentProposal.findFirst({
          where: { runId: ctx.runId, kind: 'assign', status: 'executed' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, approvedById: true, payload: true },
        });
        if (!proposal) {
          throw new BadRequestException(
            'No approved assign proposal for this run — a person has to approve it first',
          );
        }

        return {
          proposalId: proposal.id,
          status: proposal.status,
          approvedById: proposal.approvedById,
          result: proposal.payload,
        };
      },
    };
  }
}
