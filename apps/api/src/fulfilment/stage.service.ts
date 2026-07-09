import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EventType,
  LineItemStage,
  Prisma,
  RequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Legal line-item stage transitions (DESIGN §7).
 *   short path      : REQUESTED → READY
 *   procurement path: REQUESTED → QUOTING → OPCO_APPROVED → AWAITING_VENDOR → READY
 *   any non-terminal → CANCELLED
 * READY → ASSIGNED is intentionally ABSENT here — assignment touches Graph +
 * ledger and belongs to Module D-2 (W04).
 */
export const LEGAL_TRANSITIONS: Record<LineItemStage, LineItemStage[]> = {
  [LineItemStage.REQUESTED]: [
    LineItemStage.QUOTING,
    LineItemStage.READY,
    LineItemStage.CANCELLED,
  ],
  [LineItemStage.QUOTING]: [
    LineItemStage.OPCO_APPROVED,
    LineItemStage.CANCELLED,
  ],
  [LineItemStage.OPCO_APPROVED]: [
    LineItemStage.AWAITING_VENDOR,
    LineItemStage.CANCELLED,
  ],
  [LineItemStage.AWAITING_VENDOR]: [
    LineItemStage.READY,
    LineItemStage.CANCELLED,
  ],
  [LineItemStage.READY]: [LineItemStage.CANCELLED], // → ASSIGNED = D-2
  [LineItemStage.ASSIGNED]: [], // terminal
  [LineItemStage.CANCELLED]: [], // terminal
};

/** Stage → the timestamp column stamped when the line item enters it. */
const STAGE_TIMESTAMP: Partial<Record<LineItemStage, string>> = {
  [LineItemStage.QUOTING]: 'quotedAt',
  [LineItemStage.OPCO_APPROVED]: 'opcoApprovedAt',
  [LineItemStage.AWAITING_VENDOR]: 'vendorOrderedAt',
  [LineItemStage.READY]: 'readyAt',
};

/**
 * Aggregate a request's status from its line-item stages (OD4).
 * Pure — the request row is the aggregate; the stage lives on each line item.
 * COMPLETED (all active items ASSIGNED) is reachable once D-2 assigns.
 */
export function aggregateRequestStatus(stages: LineItemStage[]): RequestStatus {
  if (stages.length === 0) return RequestStatus.OPEN;
  const active = stages.filter((s) => s !== LineItemStage.CANCELLED);
  if (active.length === 0) return RequestStatus.CANCELLED;
  if (active.every((s) => s === LineItemStage.REQUESTED)) {
    return RequestStatus.OPEN;
  }
  if (active.every((s) => s === LineItemStage.ASSIGNED)) {
    return RequestStatus.COMPLETED;
  }
  return RequestStatus.IN_PROGRESS;
}

@Injectable()
export class StageService {
  private readonly logger = new Logger(StageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Advance one line item to a new stage, enforcing the legal matrix.
   * Writes a STAGE_CHANGE event + stamps the stage timestamp, then recomputes
   * the parent request's aggregate status.
   */
  async advanceStage(
    lineItemId: string,
    toStage: LineItemStage,
    actorId?: string,
  ) {
    const item = await this.prisma.requestLineItem.findUnique({
      where: { id: lineItemId },
    });
    if (!item) {
      throw new NotFoundException(`Line item ${lineItemId} not found`);
    }
    const fromStage = item.stage;

    if (toStage === LineItemStage.ASSIGNED) {
      throw new BadRequestException(
        'ASSIGNED is handled by the assign flow (Module D-2), not stage advance',
      );
    }
    if (!LEGAL_TRANSITIONS[fromStage].includes(toStage)) {
      throw new BadRequestException(
        `Illegal stage transition ${fromStage} → ${toStage}`,
      );
    }

    const data: Prisma.RequestLineItemUpdateInput = { stage: toStage };
    const tsField = STAGE_TIMESTAMP[toStage];
    if (tsField) {
      (data as Record<string, unknown>)[tsField] = new Date();
    }
    const updated = await this.prisma.requestLineItem.update({
      where: { id: lineItemId },
      data,
    });

    await this.prisma.requestEvent.create({
      data: {
        requestId: item.requestId,
        lineItemId: item.id,
        type: EventType.STAGE_CHANGE,
        fromStage,
        toStage,
        actorId: actorId ?? null,
      },
    });

    await this.recomputeRequestStatus(item.requestId);
    this.logger.log(
      `Line item ${lineItemId}: ${fromStage} → ${toStage} (request ${item.requestId})`,
    );
    return updated;
  }

  /** Recompute + persist a request's status from its current line items. */
  async recomputeRequestStatus(requestId: string): Promise<RequestStatus> {
    const items = await this.prisma.requestLineItem.findMany({
      where: { requestId },
      select: { stage: true },
    });
    const status = aggregateRequestStatus(items.map((i) => i.stage));
    await this.prisma.request.update({
      where: { id: requestId },
      data: { status },
    });
    return status;
  }
}
