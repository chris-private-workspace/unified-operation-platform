import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { IntakeService } from './intake.service';
import { N8nNativeIntakeDto } from './dto/n8n-native-intake.dto';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';
import { opcoCodeForJobFunction } from './opco-department-map';

/**
 * ADR-0017 D4 — translate n8n's native envelope into the canonical intake DTO.
 *
 * This exists because the payload n8n actually sends and the LOCKED intake
 * contract (W24 CONTRACT.md) disagree on three identifiers. Rather than loosen
 * the contract for every caller, the resolution lives here and `IntakeService`
 * is reached with a fully canonical DTO — so there is exactly one code path
 * that creates requests, and the strict route keeps its guarantees.
 *
 * Everything is FAIL-CLOSED (ADR-0017 D0): if any identifier cannot be resolved
 * to exactly one platform record we reject and write nothing. Guessing here
 * means a licence assigned against the wrong OpCo or the wrong SKU — both are
 * silent, both corrupt the ledger, and one of them puts a product on a real
 * person's account.
 *
 * H4: rejection messages quote the offending non-PII identifier (Job Function,
 * licence code, REQ number) because that is how the first live call tells us
 * what ServiceNow actually sends. They never quote the target's UPN or email.
 */
@Injectable()
export class IntakeAdapterService {
  private readonly logger = new Logger(IntakeAdapterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly snow: ServiceNowService,
    private readonly intake: IntakeService,
  ) {}

  async intakeNative(dto: N8nNativeIntakeDto) {
    // Order is cheapest-first so a bad payload fails before we touch the network:
    // constant lookup → DB → ServiceNow.
    const opcoCode = await this.resolveOpcoCode(dto.request.department);
    const lineItems = await this.resolveLineItems(dto.licenseItems);
    const serviceNowSysId = await this.resolveReqSysId(dto.request.requestId);

    const canonical: N8nIntakeRequestDto = {
      targetUpn: dto.targetUser.email.trim(),
      targetDisplayName: this.displayName(dto),
      opcoCode,
      requesterEmail: this.requesterEmail(dto),
      rawRequestText: dto.request.remarks?.trim() || undefined,
      serviceNowSysId,
      serviceNowNumber: dto.request.requestId.trim(),
      // accountCreatedAt / azureSyncedAt are deliberately NOT derived from
      // `sentAt`. n8n does not send them, and inferring "synced" from "n8n
      // posted at" would open the assign gate on a guess. Leaving them null
      // keeps the gate shut until the platform sees the user in Graph itself
      // (assign-time findUser today, ADR-0015 sweep later).
      lineItems,
    };

    // H4: never log the target UPN. Job Function / OpCo / REQ number are safe.
    this.logger.log(
      `n8n native intake: REQ ${canonical.serviceNowNumber} → opco ${opcoCode}, ${lineItems.length} line item(s)`,
    );
    return this.intake.intake(canonical);
  }

  // ── resolvers ────────────────────────────────────────────────

  /**
   * Job Function → Opco.code. Exact match only (see opco-department-map), then
   * the OpCo must exist AND be active — closing the gap noted in
   * N8N-INTAKE-HANDOFF §7 #5, where the canonical route would happily accept an
   * inactive OpCo.
   */
  private async resolveOpcoCode(department: string): Promise<string> {
    const code = opcoCodeForJobFunction(department);
    if (!code) {
      throw new BadRequestException(
        `Unknown department '${department.trim()}': it is not one of the known n8n Job Functions, so no OpCo can be resolved`,
      );
    }
    const opco = await this.prisma.opco.findUnique({ where: { code } });
    if (!opco || !opco.active) {
      throw new BadRequestException(
        `Department '${department.trim()}' maps to OpCo '${code}', which is ${
          opco ? 'inactive' : 'not present'
        } on this environment`,
      );
    }
    return code;
  }

  /**
   * licenceCode → skuId GUID. Resolution order is fixed and documented
   * (MAPPING.md §2.3): businessAlias, then skuPartNumber, active rows only,
   * trimmed and case-insensitive, and the hit must be UNIQUE.
   *
   * 🔴 Do NOT "fix" a miss by pasting the ServiceNow label into
   * `businessAlias`. That column already belongs to ADR-0004 allocation import,
   * which matches Excel column names against it, and it holds a single value —
   * repurposing it makes the import quietly skip that SKU.
   */
  private async resolveLineItems(
    items: N8nNativeIntakeDto['licenseItems'],
  ): Promise<N8nIntakeRequestDto['lineItems']> {
    const resolved: N8nIntakeRequestDto['lineItems'] = [];
    for (const item of items) {
      const code = item.licenseCode.trim();
      const sku =
        (await this.findUniqueSku('businessAlias', code)) ??
        (await this.findUniqueSku('skuPartNumber', code));
      if (!sku) {
        throw new BadRequestException(
          `Licence code '${code}' does not match exactly one active SKU (checked businessAlias then skuPartNumber)`,
        );
      }
      resolved.push({
        skuId: sku.skuId,
        // n8n models one RITM as one seat; it sends no quantity.
        quantity: 1,
        serviceNowRitmSysId: item.ritmSysId?.trim() || undefined,
        serviceNowRitmNumber: item.ritmNumber?.trim() || undefined,
      });
    }
    return resolved;
  }

  /**
   * Returns the single active SKU matching `value` on `column`, or null when
   * there is no match. More than one match is ambiguous and REJECTS rather than
   * picking the first: today "E5" happens to be unique only because the
   * no-Teams variant was never curated, and that is luck, not a guarantee.
   */
  private async findUniqueSku(
    column: 'businessAlias' | 'skuPartNumber',
    value: string,
  ) {
    const matches = await this.prisma.skuCatalog.findMany({
      where: {
        active: true,
        [column]: { equals: value, mode: 'insensitive' },
      },
      select: { skuId: true, skuPartNumber: true },
    });
    if (matches.length > 1) {
      throw new BadRequestException(
        `Licence code '${value}' is ambiguous: it matches ${
          matches.length
        } active SKUs on ${column} (${matches
          .map((m: { skuPartNumber: string }) => m.skuPartNumber)
          .join(', ')})`,
      );
    }
    return matches[0] ?? null;
  }

  /**
   * REQ number → sc_request sysId (ADR-0017 D4, OQ-3). The platform keys
   * idempotency on the sysId (`@unique`), and n8n only has the number, so we
   * look it up rather than loosen that key.
   *
   * A missing record is the caller's problem (400); an unreachable ServiceNow
   * is ours (503) — same split as BUG-003, so a retry is obviously worthwhile
   * in one case and pointless in the other.
   */
  private async resolveReqSysId(requestNumber: string): Promise<string> {
    const number = requestNumber.trim();
    let record: Awaited<ReturnType<ServiceNowService['getRecordByNumber']>>;
    try {
      record = await this.snow.getRecordByNumber(number, 'sc_request');
    } catch (err) {
      this.logger.error(
        `ServiceNow lookup failed for REQ ${number}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'ServiceNow is unavailable, so the request number could not be resolved',
      );
    }
    const sysId = record?.sys_id;
    if (typeof sysId !== 'string' || !sysId) {
      throw new BadRequestException(
        `ServiceNow request '${number}' was not found, so it cannot be mirrored`,
      );
    }
    return sysId;
  }

  // ── small mappings ───────────────────────────────────────────

  private displayName(dto: N8nNativeIntakeDto): string | undefined {
    const composed = [dto.targetUser.firstName, dto.targetUser.lastName]
      .filter((p) => p && p.trim())
      .join(' ')
      .trim();
    return composed || dto.targetUser.raw?.trim() || undefined;
  }

  /**
   * The canonical DTO declares `requesterEmail` as an email. We build that DTO
   * in code, so no ValidationPipe runs on it — anything odd coming out of the
   * Outlook trigger would be persisted as-is. Drop it unless it looks like an
   * address; it is optional metadata and not worth failing an onboarding over.
   */
  private requesterEmail(dto: N8nNativeIntakeDto): string | undefined {
    const sender = dto.request.source?.sender?.trim();
    if (!sender || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) return undefined;
    return sender;
  }
}
