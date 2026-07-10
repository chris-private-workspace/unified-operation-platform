import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type AppUser,
  EventType,
  LineItemStage,
  RequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { assertOpcoScope, scopeWhere } from '../auth/opco-scope';
import { StageService } from './stage.service';
import { IntakeRequestDto } from './dto/intake.dto';
import { AddLineItemDto } from './dto/line-item.dto';

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
