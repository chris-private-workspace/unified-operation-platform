import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { IntakeService, type IntakeTaskRef } from './intake.service';
import { N8nNativeIntakeDto } from './dto/n8n-native-intake.dto';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';
import { N8nFlatIntakeDto } from './dto/n8n-flat-intake.dto';
import { opcoCodeForJobFunction } from './opco-department-map';

/** The catalogue row a default injection resolved to. */
type DefaultSku = { id: string; skuId: string; skuPartNumber: string };

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
    private readonly connectorConfig: ConnectorConfigService,
    private readonly audit: AuditService,
  ) {}

  async intakeNative(dto: N8nNativeIntakeDto) {
    // Order is cheapest-first so a bad payload fails before we touch the network:
    // constant lookup → DB → ServiceNow.
    const opcoCode = await this.resolveOpcoCode(dto.request.department);
    const resolved = await this.resolveLineItems(dto.licenseItems);
    const { lineItems, injected } = await this.applyDefaultSku(
      resolved,
      dto.request.requestId,
    );
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

    /**
     * Checked BEFORE the write so a repeat push does not audit an injection
     * that did not happen this time round. Intake is idempotent on the REQ
     * sysId, so a re-post returns the existing request untouched — and an audit
     * row saying "the platform added a line" when it added nothing is exactly
     * the misleading-trail failure W41 had to go back and fix.
     */
    const preExisting = injected
      ? await this.prisma.request.findUnique({
          where: { serviceNowSysId },
          select: { id: true },
        })
      : null;

    const created = await this.intake.intake(canonical);
    if (injected && !preExisting) {
      await this.auditInjection(created, injected);
    }
    return created;
  }

  /**
   * CH-020 / ADR-0024 D3 — workflow 1001's FLAT envelope.
   *
   * Deliberately thin. Everything it needs already exists on this service and
   * is reached by calling it, not by copying it: `resolveReqSysId` keeps the
   * idempotency key exactly what it has always been (`Request.serviceNowSysId`,
   * `@unique`), and `applyDefaultSku` is ADR-0020 untouched. The only genuinely
   * new thing here is the catalog task ref riding along to the line item.
   *
   * No Job Function mapping: this payload resolves the OpCo on the n8n side and
   * sends the code. It is still checked for existence + active, because that is
   * the gap N8N-INTAKE-HANDOFF §7 #5 flagged on the canonical route.
   */
  async intakeFlat(dto: N8nFlatIntakeDto) {
    const opcoCode = dto.opcoCode.trim();
    const opco = await this.prisma.opco.findUnique({
      where: { code: opcoCode },
    });
    if (!opco || !opco.active) {
      throw new BadRequestException(
        `OpCo '${opcoCode}' is ${
          opco ? 'inactive' : 'not present'
        } on this environment`,
      );
    }

    // 1001 carries no licence line at all, so this is always the ADR-0020
    // injection — but it is asked rather than assumed, so a future payload that
    // does carry one is not silently given a second licence.
    const { lineItems, injected } = await this.applyDefaultSku(
      [],
      dto.requestId,
    );
    const serviceNowSysId = await this.resolveReqSysId(dto.requestId);

    const canonical: N8nIntakeRequestDto = {
      targetUpn: dto.targetUpn.trim(),
      targetDisplayName: dto.targetDisplayName?.trim() || undefined,
      opcoCode,
      // Same sanitising as the native path: optional metadata off an Outlook
      // trigger must not fail an onboarding, but must not be persisted raw
      // either (the canonical DTO declares it an email and no pipe runs here).
      requesterEmail: this.emailOrUndefined(dto.requesterEmail),
      serviceNowSysId,
      serviceNowNumber: dto.requestId.trim(),
      // accountCreatedAt / azureSyncedAt stay null for the same reason as the
      // native path: n8n does not send them, and the assign gate must not open
      // on an inference.
      lineItems,
    };

    const taskRef = this.taskRef(dto);

    // H4: REQ number / OpCo / task number are safe; the target UPN is not.
    this.logger.log(
      `n8n flat intake: REQ ${canonical.serviceNowNumber} → opco ${opcoCode}, ${
        lineItems.length
      } line item(s), task ${taskRef?.number ?? taskRef?.sysId ?? 'none'}`,
    );

    // Same reasoning as intakeNative: checked BEFORE the write so a repeat push
    // does not audit an injection that did not happen this time round.
    const preExisting = injected
      ? await this.prisma.request.findUnique({
          where: { serviceNowSysId },
          select: { id: true },
        })
      : null;

    const created = await this.intake.intake(canonical, taskRef);
    if (injected && !preExisting) {
      await this.auditInjection(created, injected);
    }
    return created;
  }

  /**
   * A task NUMBER without a sysId is not addressable, so the ref is keyed on
   * the sysId alone — 1001's own resolver returns both or neither.
   */
  private taskRef(dto: N8nFlatIntakeDto): IntakeTaskRef | undefined {
    const sysId = dto.serviceNowTaskSysId?.trim();
    if (!sysId) return undefined;
    return { sysId, number: dto.serviceNowTaskNumber?.trim() || null };
  }

  // ── default SKU injection (ADR-0020) ─────────────────────────

  /**
   * ADR-0020 D1/D2 — when ServiceNow carried NO licence line at all, add the
   * configured default so the operator has something to act on.
   *
   * 🔴 Only when the list is completely empty. A request that already carries
   * an E3 gets no E5: ServiceNow said what it wanted, and the platform does not
   * second-guess a stated choice (D2).
   *
   * The injected line has no RITM (`serviceNowSysId` stays null) because none
   * exists — nothing in ServiceNow asked for it. `assign.service` already
   * handles that shape: it falls back to a work note on the parent REQ.
   */
  private async applyDefaultSku(
    resolved: N8nIntakeRequestDto['lineItems'],
    requestNumber: string,
  ): Promise<{
    lineItems: N8nIntakeRequestDto['lineItems'];
    injected: DefaultSku | null;
  }> {
    if (resolved.length > 0) return { lineItems: resolved, injected: null };

    const skuId = await this.connectorConfig.resolve(
      'n8n-inbound',
      'defaultOnboardingSkuId',
    );
    /**
     * D6 — fail SOFT, deliberately breaking this service's own fail-closed
     * habit. Fail-closed exists here because a wrong GUESS assigns the wrong
     * product to a real person; nothing is being guessed when the default is
     * simply unset. Rejecting would hand n8n a 400 whose error handling we
     * cannot see, and a request that never arrives is worse than one an
     * operator can see is a line short.
     *
     * Logged, not audited: a missing setting is an ops event, not a business
     * one (same split as W41's unset APP_BASE_URL).
     */
    if (!skuId) {
      this.logger.warn(
        `REQ ${requestNumber.trim()} carried no licence line and no default onboarding SKU is configured — creating it with zero line items`,
      );
      return { lineItems: [], injected: null };
    }

    const sku = await this.prisma.skuCatalog.findUnique({
      where: { skuId },
      select: { id: true, skuId: true, skuPartNumber: true, active: true },
    });
    // Re-checked at use even though `kind: 'sku'` validates on write: a SKU can
    // be deactivated after it was configured, and intake must not create a line
    // against a dead catalogue row.
    if (!sku || !sku.active) {
      this.logger.warn(
        `REQ ${requestNumber.trim()} carried no licence line and the configured default SKU is ${
          sku ? 'inactive' : 'not in the catalogue'
        } — creating it with zero line items`,
      );
      return { lineItems: [], injected: null };
    }

    this.logger.log(
      `REQ ${requestNumber.trim()} carried no licence line — injecting default SKU ${sku.skuPartNumber}`,
    );
    // n8n models one RITM as one seat; the default follows the same convention.
    return {
      lineItems: [{ skuId: sku.skuId, quantity: 1 }],
      injected: {
        id: sku.id,
        skuId: sku.skuId,
        skuPartNumber: sku.skuPartNumber,
      },
    };
  }

  /**
   * ADR-0020 D7 — record that the platform authored this line.
   *
   * Every other line item mirrors an `sc_req_item`; this one does not, and
   * without a trail nobody can later tell the two apart on the same request.
   *
   * ⚠️ Not in the same transaction as the write it describes, which ADR-0009
   * Decision 8.1 would prefer: the request is created inside `IntakeService`'s
   * own nested write, and ADR-0020 D3 keeps that service untouched. The window
   * is a DB failure landing between the two calls — the same DB the request was
   * just written to, so it is narrow, but it is real and stated rather than
   * papered over.
   */
  private async auditInjection(
    created: { lineItems: { id: string; skuCatalogId: string }[] },
    sku: DefaultSku,
  ): Promise<void> {
    const line = created.lineItems.find((li) => li.skuCatalogId === sku.id);
    if (!line) return;
    await this.prisma.$transaction(async (tx) => {
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.INTAKE_DEFAULT_SKU,
        targetType: 'RequestLineItem',
        targetId: line.id,
        // m2m intake — there is no user actor to attribute this to.
        actorId: null,
        metadata: {
          reason: `default onboarding SKU injected: ${sku.skuPartNumber}`,
          source: 'n8n-intake',
        },
      });
    });
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
   * picking the first.
   *
   * ⚠️ Corrected W42. This used to say "E5" is unique only because the no-Teams
   * variant was never curated. That premise has since expired — the catalogue
   * now carries BOTH `SPE_E5` and `Microsoft_365_E5_(no_Teams)`, active. The
   * conclusion still holds, but for a different reason: the match is `equals`
   * rather than a contains, and only `SPE_E5` carries the `E5` businessAlias
   * that gets tried first.
   *
   * So the ambiguity guard below is no longer hypothetical protection against a
   * future curation — it is the only thing standing between a second E5 alias
   * and a licence assigned against the wrong variant.
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
    return this.emailOrUndefined(dto.request.source?.sender);
  }

  /**
   * Shared with the flat path (CH-020), which declares `requesterEmail` as a
   * plain string for the same reason: failing a whole onboarding over an
   * optional courtesy field would be the wrong trade. One copy of the rule —
   * two would drift, and only one of them would be visible from the other.
   */
  private emailOrUndefined(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return undefined;
    return value;
  }
}
