import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type AppUser,
  EventType,
  LineItemStage,
  RequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { assertOpcoScope, scopeWhere } from '../auth/opco-scope';
import { aggregateRequestStatus, StageService } from './stage.service';
import { IntakeRequestDto } from './dto/intake.dto';
import { AddLineItemDto } from './dto/line-item.dto';
import { UpdateRequestDto } from './dto/update-request.dto';

/**
 * Module D-1 — request intake + line-item authoring + triage.
 * Consumes a ServiceNow ticket (mirror only — SN owns intake/approval) and
 * lets an operator author line items. No Graph / ledger / SN write-back here
 * (that is D-2). rawRequestText is NOT auto-parsed (DESIGN §6).
 */
@Injectable()
export class RequestService {
  private readonly logger = new Logger(RequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly snow: ServiceNowService,
    private readonly stage: StageService,
  ) {}

  async intake(dto: IntakeRequestDto, actor: AppUser) {
    const opco = await this.prisma.opco.findUnique({
      where: { id: dto.opcoId },
    });
    if (!opco) throw new NotFoundException(`OpCo ${dto.opcoId} not found`);
    // AUTH-3a: an OPCO_IT actor may only file requests for its own OpCo.
    assertOpcoScope(actor, dto.opcoId);

    const snMirror = {
      serviceNowSysId: null as string | null,
      serviceNowNumber: dto.serviceNowNumber ?? null,
      serviceNowStatus: null as string | null,
      rawRequestText: dto.rawRequestText ?? null,
    };

    if (dto.serviceNowNumber) {
      const rec = await this.snow.getRecordByNumber(dto.serviceNowNumber);
      if (!rec) {
        throw new NotFoundException(
          `ServiceNow record ${dto.serviceNowNumber} not found`,
        );
      }
      // Field names follow the sc_req_item default — align with Phase 1 (OD5).
      snMirror.serviceNowSysId = rec.sys_id ?? null;
      snMirror.serviceNowNumber = rec.number ?? dto.serviceNowNumber;
      snMirror.serviceNowStatus = rec.state ?? null;
      snMirror.rawRequestText =
        dto.rawRequestText ?? rec.description ?? rec.short_description ?? null;
    }

    const request = await this.prisma.request.create({
      data: {
        targetUpn: dto.targetUpn,
        targetDisplayName: dto.targetDisplayName ?? null,
        opcoId: dto.opcoId,
        requesterEmail: dto.requesterEmail ?? null,
        status: RequestStatus.OPEN,
        ...snMirror,
      },
    });
    // H4: never log the target UPN (PII) — id + opco code only.
    this.logger.log(`Intake request ${request.id} (opco ${opco.code})`);
    return request;
  }

  async addLineItem(requestId: string, dto: AddLineItemDto, actor: AppUser) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException(`Request ${requestId} not found`);
    // AUTH-3a: OPCO_IT may only add line items to its own OpCo's requests.
    assertOpcoScope(actor, request.opcoId);
    // CH-007 D6: a platform-created request already pushed every line to
    // ServiceNow as an RITM at creation. A line added here would have no RITM —
    // it would exist locally but not in SN, which is exactly the drift the lock
    // model prevents. Intake requests carry no per-line RITM, so authoring lines
    // on them is safe (that is the D-1 flow).
    if (request.origin === 'platform-created') {
      throw new ConflictException(
        'Cannot add line items to a platform-created request — it is already in ServiceNow. Open a new request instead.',
      );
    }
    // CH-025 C: a finished onboarding stays finished. Without this, adding a
    // line to a COMPLETED request pushed it back to IN_PROGRESS via
    // recomputeRequestStatus below — a delivered onboarding quietly coming back
    // to life, with no record of why.
    //
    // 🔴 Recomputed from the line items rather than read off `request.status`:
    // the persisted column is maintained by recomputeRequestStatus, and gating
    // on a cached copy of a derived value is how the two drift apart. Same
    // function the recompute uses, so they cannot disagree.
    const existing = await this.prisma.requestLineItem.findMany({
      where: { requestId },
      select: { stage: true },
    });
    if (
      aggregateRequestStatus(existing.map((l) => l.stage)) ===
      RequestStatus.COMPLETED
    ) {
      throw new ConflictException(
        'This request is complete — every licence has been assigned. Add line items to a new request instead.',
      );
    }
    const sku = await this.prisma.skuCatalog.findUnique({
      where: { id: dto.skuCatalogId },
    });
    if (!sku) throw new NotFoundException(`SKU ${dto.skuCatalogId} not found`);

    const item = await this.prisma.requestLineItem.create({
      data: {
        requestId,
        skuCatalogId: dto.skuCatalogId,
        quantity: dto.quantity ?? 1,
        procurementRequired: dto.procurementRequired ?? false,
        stage: LineItemStage.REQUESTED,
        note: dto.note ?? null,
      },
    });
    await this.prisma.requestEvent.create({
      data: {
        requestId,
        lineItemId: item.id,
        type: EventType.NOTE,
        message: `Line item added: ${sku.skuPartNumber} ×${item.quantity} (${
          item.procurementRequired ? 'procurement' : 'short-path'
        })`,
      },
    });
    await this.stage.recomputeRequestStatus(requestId);
    return item;
  }

  /**
   * Edit a request header (CH-007). Only the fields the DTO carries can move;
   * the sync keys and opcoId are not on the DTO and are stripped by the global
   * whitelist pipe (D3/D4).
   *
   * targetUpn is the one field with a rule beyond presence: it is editable only
   * while the account has not synced. After sync it is the key the assign flow
   * resolves the M365 user by (assign.service findUser), so changing it would
   * silently break assignment — hence a hard 409 here, not merely a disabled
   * field in the UI (D2, fail-closed at the backend).
   */
  async updateHeader(id: string, dto: UpdateRequestDto, actor: AppUser) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    assertOpcoScope(actor, request.opcoId);

    if (dto.targetUpn !== undefined && request.azureSyncedAt !== null) {
      throw new ConflictException(
        'Cannot change the target UPN after the account has synced — it is the key the assignment flow uses. Cancel and re-open the request if the person changed.',
      );
    }

    // Record which fields moved, never their values (H4: targetUpn is PII).
    const changed = (Object.keys(dto) as (keyof UpdateRequestDto)[]).filter(
      (k) =>
        dto[k] !== undefined &&
        dto[k] !== (request as Record<string, unknown>)[k],
    );
    if (changed.length === 0) return request;

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        targetUpn: dto.targetUpn,
        targetDisplayName: dto.targetDisplayName,
        requesterEmail: dto.requesterEmail,
        rawRequestText: dto.rawRequestText,
      },
    });
    await this.prisma.requestEvent.create({
      data: {
        requestId: id,
        type: EventType.NOTE,
        actorId: actor.id,
        message: `Header updated: ${changed.join(', ')}`,
      },
    });
    this.logger.log(`Request ${id} header updated (${changed.join(', ')})`);
    return updated;
  }

  /**
   * Remove a line item (CH-007 D5). Allowed only while the line has NOT been
   * sent to ServiceNow (no RITM) AND is still at REQUESTED — i.e. no real-world
   * procurement or assignment has started. A REQUESTED line holds no ledger
   * allocation (that lands at assign), so this never touches the ledger (C8).
   */
  async removeLineItem(id: string, lineItemId: string, actor: AppUser) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    assertOpcoScope(actor, request.opcoId);

    const item = await this.prisma.requestLineItem.findUnique({
      where: { id: lineItemId },
      include: { sku: { select: { skuPartNumber: true } } },
    });
    if (!item || item.requestId !== id) {
      throw new NotFoundException(`Line item ${lineItemId} not found`);
    }
    if (item.serviceNowSysId !== null) {
      throw new ConflictException(
        'Cannot remove a line item that exists in ServiceNow (it has an RITM). Cancel it in ServiceNow instead.',
      );
    }
    if (item.stage !== LineItemStage.REQUESTED) {
      throw new ConflictException(
        `Cannot remove a line item once it has moved past REQUESTED (currently ${item.stage}).`,
      );
    }

    await this.prisma.requestLineItem.delete({ where: { id: lineItemId } });
    await this.prisma.requestEvent.create({
      data: {
        requestId: id,
        type: EventType.NOTE,
        actorId: actor.id,
        message: `Line item removed: ${item.sku.skuPartNumber}`,
      },
    });
    await this.stage.recomputeRequestStatus(id);
    this.logger.log(`Line item ${lineItemId} removed from request ${id}`);
    return { id: lineItemId, removed: true };
  }

  async listRequests(actor: AppUser) {
    // AUTH-3a: OPCO_IT sees only its own OpCo; REGIONAL / ADMIN see all ({}).
    return this.prisma.request.findMany({
      where: scopeWhere(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        opco: { select: { code: true, displayName: true } },
        lineItems: true,
      },
    });
  }

  async getRequestDetail(id: string, actor: AppUser) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        opco: { select: { code: true, displayName: true } },
        lineItems: {
          include: {
            sku: {
              select: { skuId: true, skuPartNumber: true, displayName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    // AUTH-3a: block cross-OpCo reads even by direct id (no data leak via guess).
    assertOpcoScope(actor, request.opcoId);
    return request;
  }
}
