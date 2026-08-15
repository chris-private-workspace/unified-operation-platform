import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOpcoScope, scopeWhere } from '../auth/opco-scope';
import { scrubPii } from '../integration/scrub-pii';
import type { AgentTool, AgentToolContext } from './agent-tool';

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

  constructor(private readonly prisma: PrismaService) {
    this.tools = Object.freeze([
      this.listPendingRequests(),
      this.getRequest(),
      this.searchCatalog(),
      this.getLedger(),
      this.proposeLineItems(),
    ]);
  }

  /** Every tool an agent has. There is no second source. */
  list(): readonly AgentTool[] {
    return this.tools;
  }

  get(name: string): AgentTool | undefined {
    return this.tools.find((tool) => tool.name === name);
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
}
