import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type AppUser, LineItemStage, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOpcoScope } from '../auth/opco-scope';
import {
  RequestSubmissionProvider,
  SubmitLineItem,
  SubmittedRequest,
} from './request-submission.provider';
import { CreateRequestDto } from './dto/create-request.dto';

/**
 * ADR-0008 Phase 乙 — outbound direct. IT opens a standalone license request →
 * create the ServiceNow ticket via the provider (REQ + per-line RITM) → build
 * the local Request/RequestLineItem mirror (D4, two-level D6). ServiceNow write
 * happens FIRST (external side-effect); it throws → nothing is written locally
 * (fail-closed, same ordering as assign.service). OpCo scope is enforced BEFORE
 * any SN write (AUTH-3a).
 */
@Injectable()
export class OutboundRequestService {
  private readonly logger = new Logger(OutboundRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: RequestSubmissionProvider,
  ) {}

  async create(dto: CreateRequestDto, actor: AppUser) {
    // 1. Resolve OpCo + scope gate — fail-closed BEFORE any ServiceNow write.
    const opco = await this.prisma.opco.findUnique({
      where: { code: dto.opcoCode },
    });
    if (!opco)
      throw new NotFoundException(`OpCo code '${dto.opcoCode}' not found`);
    assertOpcoScope(actor, opco.id);

    // 2. Resolve every SKU (fail fast, still BEFORE any SN write).
    const resolved: { skuCatalogId: string; quantity: number }[] = [];
    const submitLines: SubmitLineItem[] = [];
    for (const line of dto.lineItems) {
      const sku = await this.prisma.skuCatalog.findUnique({
        where: { skuId: line.skuId },
      });
      if (!sku || !sku.active) {
        throw new BadRequestException(
          `SKU '${line.skuId}' not found or inactive`,
        );
      }
      resolved.push({ skuCatalogId: sku.id, quantity: line.quantity });
      submitLines.push({
        skuId: line.skuId,
        skuPartNumber: sku.skuPartNumber,
        quantity: line.quantity,
      });
    }

    // 3. Create the ServiceNow ticket via the provider (external side-effect
    // FIRST). Throws → nothing written locally (fail-closed). A raw integration
    // failure (Table API `fetch failed` / n8n webhook down / SN 5xx) is not an
    // HttpException → wrap it as a clean 503 so the operator gets a meaningful,
    // retryable error instead of an opaque 500 (BUG-003; same intent as
    // graphUnavailable for the assign path).
    let submitted: SubmittedRequest;
    try {
      submitted = await this.provider.submit({
        targetUpn: dto.targetUpn,
        opcoCode: dto.opcoCode,
        requesterEmail: dto.requesterEmail,
        remark: dto.remark,
        lineItems: submitLines,
      });
    } catch (err) {
      // H4: log the action + message only, never the target UPN (PII).
      this.logger.error(
        `Request submission to ServiceNow failed: ${(err as Error)?.message}`,
      );
      throw new ServiceUnavailableException(
        'ServiceNow is unavailable — the request could not be submitted. Please retry.',
      );
    }

    // 4. Build the local mirror (D4). resolved[i] and submitted.lineItems[i]
    // share the payload order → zip by index.
    try {
      const request = await this.prisma.request.create({
        data: {
          targetUpn: dto.targetUpn,
          targetDisplayName: dto.targetDisplayName ?? null,
          opcoId: opco.id,
          requesterEmail: dto.requesterEmail ?? null,
          rawRequestText: dto.remark ?? null,
          status: RequestStatus.OPEN,
          origin: 'platform-created',
          handledById: null, // unassigned → Regional queue
          serviceNowSysId: submitted.serviceNowSysId, // parent REQ
          serviceNowNumber: submitted.serviceNowNumber ?? null,
          lineItems: {
            create: resolved.map((r, i) => ({
              skuCatalogId: r.skuCatalogId,
              quantity: r.quantity,
              stage: LineItemStage.REQUESTED,
              serviceNowSysId: submitted.lineItems[i].serviceNowSysId, // RITM
              serviceNowNumber: submitted.lineItems[i].serviceNowNumber ?? null,
            })),
          },
        },
        include: { lineItems: true },
      });
      // H4: id + REQ number + opco code only, never the target UPN (PII).
      this.logger.log(
        `Created outbound request ${request.id} (REQ ${
          submitted.serviceNowNumber ?? submitted.serviceNowSysId
        }, opco ${opco.code})`,
      );
      return request;
    } catch (err) {
      // SN ticket created but local mirror failed → orphan ticket (plan §5).
      this.logger.warn(
        `ServiceNow REQ ${submitted.serviceNowSysId} created but local mirror failed (orphan): ${
          (err as Error).message
        }`,
      );
      throw err;
    }
  }
}
