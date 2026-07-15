import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type AppUser, EventType, LineItemStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GraphService,
  type GraphUser,
} from '../integration/graph/graph.service';
import { graphUnavailable } from '../integration/graph/graph-unavailable';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { assertOpcoScope } from '../auth/opco-scope';
import { aggregateRequestStatus } from './stage.service';

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
    private readonly graph: GraphService,
    private readonly snow: ServiceNowService,
  ) {}

  /**
   * Simulate the Phase 1 (n8n) sync write-back that opens the assign gate.
   * Real n8n would set this after the on-prem account syncs to Azure AD.
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
        message: 'Phase 1 sync confirmed (azureSyncedAt set)',
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
  ) {
    const item = await this.prisma.requestLineItem.findUnique({
      where: { id: lineItemId },
      include: { request: true, sku: true },
    });
    if (!item) throw new NotFoundException(`Line item ${lineItemId} not found`);

    // ── Gates (fail closed, in order) ──
    // AUTH-3a scope gate first: an OPCO_IT actor may only assign within its OpCo.
    assertOpcoScope(actor, item.request.opcoId);
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
    // an auth / network / throttle failure — wrap that so a raw Graph error
    // never propagates unhandled (BUG-002: it crashes the Nest process).
    let user: GraphUser | null;
    try {
      user = await this.graph.findUser(request.targetUpn);
    } catch (err) {
      throw graphUnavailable(this.logger, 'look up the target user', err);
    }
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
    let skus;
    try {
      skus = await this.graph.getSubscribedSkus();
    } catch (err) {
      throw graphUnavailable(
        this.logger,
        'read the tenant license inventory',
        err,
      );
    }
    const tenantSku = skus.find((s) => s.skuId === item.sku.skuId);
    if (!tenantSku || tenantSku.consumedUnits >= tenantSku.prepaidEnabled) {
      throw new BadRequestException(
        `No available seats for SKU ${item.sku.skuPartNumber}`,
      );
    }

    // ── Graph assignment (external side-effect, BEFORE the DB transaction) ──
    try {
      await this.graph.assignLicense(request.targetUpn, item.sku.skuId, {
        usageLocation,
      });
    } catch (err) {
      throw graphUnavailable(
        this.logger,
        'assign the license in Microsoft Graph',
        err,
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
          message: `Assigned ${item.sku.skuPartNumber}`,
        },
      });
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
    // Two-level (ADR-0008 / CONTRACT §4): prefer THIS line's RITM (sc_req_item);
    // fall back to the parent REQ mirror for legacy rows without a per-line RITM.
    const snTarget = item.serviceNowSysId ?? request.serviceNowSysId;
    if (snTarget) {
      try {
        await this.snow.addWorkNote(
          snTarget,
          `License ${item.sku.skuPartNumber} assigned via platform.`,
          'sc_req_item',
        );
      } catch (err) {
        this.logger.warn(
          `ServiceNow write-back failed for request ${request.id}: ${
            (err as Error).message
          }`,
        );
      }
    }

    // H4: never log the target UPN (PII) — sku + ids only.
    this.logger.log(
      `Assigned line item ${lineItemId} (${item.sku.skuPartNumber}, request ${request.id})`,
    );
    return updated;
  }
}
