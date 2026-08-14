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
import {
  RequestSubmissionProvider,
  SubmitLineItem,
  SubmittedRequest,
} from './request-submission.provider';
import { OutboundFailureService } from './outbound-failure.service';
import { OUTBOUND_FAILURE_KINDS } from './outbound-failure-fields';
import { IntakeNotificationService } from './intake-notification.service';

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
 *
 * ── What this class is NOW, which is wider than its name ────────────────────
 * 🔴 It stopped being only a translator. ADR-0025 D2 added a side effect
 * (raise the licence request), CH-021 added another (notify the OpCo's IT), and
 * CH-021 A3 routed the canonical contract through here too — a path that needs
 * NO translation at all. What it actually owns today is: every intake side
 * effect, in one file, so "what happens when an onboarding arrives" is one
 * thing to read rather than three. It is not renamed because the name is
 * quoted by ADR-0017 D4 and by every commit that touched it.
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
    // ADR-0025 D2 — the platform now raises its own licence request in
    // ServiceNow after taking an onboarding in.
    private readonly submission: RequestSubmissionProvider,
    private readonly failures: OutboundFailureService,
    // CH-021 — tell the OpCo's IT people an onboarding landed. Never throws.
    private readonly notifications: IntakeNotificationService,
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
    // Native path does not raise a licence request (ADR-0025 D2 lives on the
    // flat path only), so `openedBySysId` has no consumer here.
    const { sysId: serviceNowSysId } = await this.resolveReqSysId(
      dto.request.requestId,
    );

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
     *
     * 🔴 CH-021 D1 made this UNCONDITIONAL. It used to be asked only when
     * something was injected; the notification needs the same answer for every
     * push, and asking twice would be two ways of deciding one thing (the
     * pattern this repo has now been bitten by six times). Cost is one indexed
     * `findUnique` — the alternative D1 rejected was a `Request.notifiedAt`
     * column, which is a Prisma schema change, so H1.
     */
    const preExisting = await this.prisma.request.findUnique({
      where: { serviceNowSysId },
      select: { id: true },
    });

    const created = await this.intake.intake(canonical);
    if (injected && !preExisting) {
      await this.auditInjection(created, injected);
    }
    if (!preExisting) await this.notifications.notifyNewIntake(created.id);
    return created;
  }

  /**
   * CH-021 A3 — the canonical (LOCKED) contract, which until now went straight
   * from the controller into `IntakeService`.
   *
   * 🔴 It is routed through here for ONE reason: so that all three intake paths
   * have their side effects in the same file. The alternative was a
   * `preExisting` check and a notify call in `IntakeController`, which would
   * have put a Prisma query in a controller AND created a second place that
   * decides when an intake is new. CH-021 D2 keeps it out of `IntakeService`
   * because that writer has a second caller (`ServiceNowImportService`, CH-013)
   * which is out of this change's scope.
   *
   * Nothing about the canonical contract itself moves — no validation, no
   * translation, no new field. This method wraps; it does not interpret.
   */
  async intakeCanonical(dto: N8nIntakeRequestDto) {
    const preExisting = await this.prisma.request.findUnique({
      where: { serviceNowSysId: dto.serviceNowSysId },
      select: { id: true },
    });

    const created = await this.intake.intake(dto);
    if (!preExisting) await this.notifications.notifyNewIntake(created.id);
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
    const { sysId: serviceNowSysId, openedBySysId } =
      await this.resolveReqSysId(dto.requestId);

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

    // Same reasoning as intakeNative, including CH-021 D1 making it
    // unconditional: one question, one answer, two consumers.
    const preExisting = await this.prisma.request.findUnique({
      where: { serviceNowSysId },
      select: { id: true },
    });

    const created = await this.intake.intake(canonical, taskRef);
    if (injected && !preExisting) {
      await this.auditInjection(created, injected);
    }
    // ADR-0025 D2 — the licence request the platform owns, raised immediately
    // (Chris 2026-08-04). Fail-soft and once-only; see the method.
    await this.raiseLicenceRequest(created.id, canonical, openedBySysId);
    // CH-021 — last, and after the ticket on purpose: the mail says "go and
    // look at this request", so everything the reader will find should already
    // be there. Fail-soft is guaranteed inside the service, not here.
    if (!preExisting) await this.notifications.notifyNewIntake(created.id);
    return created;
  }

  /**
   * ADR-0025 D2 — open the `O365 User License Maintenance Request` this
   * onboarding needs, and record its RITM on the line it belongs to.
   *
   * 🔴 ONCE per request, and the guard matters more than it looks. `intakeFlat`
   * is idempotent BY DESIGN — a repeat push from n8n returns the existing
   * Request rather than creating a second one — so without a guard here every
   * re-push would open another REAL ticket for the same joiner. The guard is the
   * line items' own RITM: on this route they always arrive null (1001 sends no
   * RITM), and this method is the only thing that ever fills them.
   *
   * 🔴 FAIL-SOFT, deliberately. By the time we get here the Request is written
   * and an operator can see it. Throwing would turn "ServiceNow was briefly
   * unavailable" into "the onboarding vanished", which is strictly worse — the
   * ticket is recoverable from the failure queue, a lost intake is not. Same
   * reasoning as ADR-0020 D6.
   *
   * The two failure kinds are NOT interchangeable (ADR-0011 D3): a refused
   * submit changed nothing outside, so its repair re-submits; a submit that
   * succeeded but could not be recorded means a real ticket EXISTS, and
   * `request.mirror` must never re-submit or it opens a second one.
   */
  private async raiseLicenceRequest(
    requestId: string,
    canonical: N8nIntakeRequestDto,
    requesterSysId: string,
  ): Promise<void> {
    const lines = await this.prisma.requestLineItem.findMany({
      where: { requestId },
      select: {
        id: true,
        quantity: true,
        serviceNowSysId: true,
        sku: { select: { skuId: true, skuPartNumber: true } },
      },
      orderBy: { id: 'asc' },
    });

    // No lines at all: ADR-0020's default SKU is unconfigured, so there is
    // nothing to ask ServiceNow for. Not an error — D6 keeps that fail-soft.
    if (lines.length === 0) return;

    // Already raised. This is the repeat-push path and it must stay silent:
    // logging a warning here would make a correct no-op look like a problem.
    if (lines.some((l) => l.serviceNowSysId)) return;

    const submitLines: SubmitLineItem[] = lines.map((l) => ({
      skuId: l.sku.skuId,
      skuPartNumber: l.sku.skuPartNumber,
      quantity: l.quantity,
    }));
    const payload = {
      targetUpn: canonical.targetUpn,
      targetDisplayName: canonical.targetDisplayName,
      opcoCode: canonical.opcoCode,
      requesterEmail: canonical.requesterEmail,
      // ADR-0030 D1 — the REQ's own `opened_by`. Kept alongside requesterEmail
      // rather than replacing it: the address stays useful for display and
      // audit, it just no longer decides whether a ticket can be raised.
      requesterSysId,
      lineItems: submitLines,
    };

    let submitted;
    try {
      submitted = await this.submission.submit(payload);
    } catch (err) {
      // H4: the action and the message, never the target UPN.
      this.logger.warn(
        `Could not raise the ServiceNow licence request for ${requestId}: ${
          (err as Error)?.message
        }`,
      );
      await this.failures.record({
        kind: OUTBOUND_FAILURE_KINDS.REQUEST_SUBMIT,
        payload,
        error: err,
        requestId,
      });
      return;
    }

    try {
      // Zipped by index: the provider returns one entry per line in the order it
      // was given, and fails closed rather than returning a different count.
      await this.prisma.$transaction([
        ...submitted.lineItems.map((item, i) =>
          this.prisma.requestLineItem.update({
            where: { id: lines[i].id },
            data: {
              serviceNowSysId: item.serviceNowSysId,
              serviceNowNumber: item.serviceNowNumber ?? null,
            },
          }),
        ),
        // ADR-0035 D3 — the parent REQ, in the SAME transaction as its RITMs.
        // Not a separate write: the two are one fact ("this is the ticket the
        // platform raised"), and a half-written version of it is the state that
        // sends someone looking for a REQ whose items are recorded elsewhere.
        //
        // Keyed on `id`, never on the new column itself (D2).
        this.prisma.request.update({
          where: { id: requestId },
          data: {
            serviceNowLicenceReqNumber: submitted.serviceNowNumber ?? null,
          },
        }),
      ]);
    } catch (err) {
      this.logger.warn(
        `ServiceNow request ${
          submitted.serviceNowNumber ?? submitted.serviceNowSysId
        } was raised but could not be recorded on ${requestId}: ${
          (err as Error)?.message
        }`,
      );
      // 🔴 externalRef carries the ids so the repair writes the local rows
      // WITHOUT calling ServiceNow again (ADR-0011 D3).
      await this.failures.record({
        kind: OUTBOUND_FAILURE_KINDS.REQUEST_MIRROR,
        payload,
        externalRef: {
          serviceNowSysId: submitted.serviceNowSysId,
          serviceNowNumber: submitted.serviceNowNumber,
          lineItems: submitted.lineItems,
        },
        error: err,
        requestId,
      });
      return;
    }

    // H4: REQ number + count only.
    this.logger.log(
      `Raised ServiceNow licence request ${
        submitted.serviceNowNumber ?? submitted.serviceNowSysId
      } for ${requestId} (${submitted.lineItems.length} RITM)`,
    );

    await this.recordLicenceRequestEvent(requestId, submitted);
  }

  /**
   * CH-024 C — put the ticket the platform just raised on the request's own
   * timeline.
   *
   * 🔴 This is the ONLY place the platform's own parent REQ number survives.
   * `RequestLineItem` keeps each RITM, but the REQ above them deliberately has
   * nowhere on `Request` to live (`schema.prisma`: a second candidate
   * idempotency key is worse than a lost reference), so before this change it
   * existed in one log line and nowhere else. An operator asking "which ticket
   * did the platform open for this joiner" had no way to find out.
   *
   * 🔴 FAIL-SOFT, and for a sharper reason than usual: by the time we are here
   * the ticket is REAL and the line items already carry it. Throwing would
   * unwind nothing external and would turn a bookkeeping miss into a failed
   * intake. Same reasoning as CH-023 P1.
   *
   * Once-only comes free: the caller returns early when any line already has a
   * RITM, so this is unreachable on a repeat push (guarded by a test, because
   * "comes free" is exactly the kind of claim that stops being true).
   *
   * H4: the REQ / RITM numbers are not PII; the target's UPN is, and is not
   * here — matching the log line above it.
   */
  private async recordLicenceRequestEvent(
    requestId: string,
    submitted: SubmittedRequest,
  ): Promise<void> {
    const ref = submitted.serviceNowNumber ?? submitted.serviceNowSysId;
    const ritms = submitted.lineItems
      .map((l) => l.serviceNowNumber)
      .filter((n): n is string => Boolean(n));
    try {
      await this.prisma.requestEvent.create({
        data: {
          requestId,
          type: 'NOTE',
          // actorId stays null: nobody pressed anything. The intake arrived and
          // the platform raised this on its own initiative.
          message: `Licence request ${ref} raised in ServiceNow by the platform${
            ritms.length ? ` (${ritms.join(', ')})` : ''
          }`,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Licence request ${ref} was raised for ${requestId} but the timeline entry could not be written: ${
          (err as Error)?.message
        }`,
      );
    }
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
  private async resolveReqSysId(
    requestNumber: string,
  ): Promise<{ sysId: string; openedBySysId: string }> {
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
    /**
     * ADR-0030 D1 — the requester for the licence request this onboarding will
     * need. `getRecordByNumber` puts no `sysparm_fields` on the query, so the
     * whole REQ record is already in hand and `opened_by` has simply never been
     * read.
     *
     * Reference fields come back as `{ link, value }` unless display values were
     * asked for, so the sysId lives on `.value` — reading the field itself gives
     * an object, not an id.
     *
     * 🔴 Fail-loud instead of falling back to the e-mail lookup. That lookup is
     * the path W44 measured at 0%: n8n sends the Outlook trigger's sender as
     * `requesterEmail`, which is not a ServiceNow user, so three consecutive
     * intakes died in it while every response still looked fine. Reviving it
     * behind a miss would hide the next failure the same way (ADR-0030 D3).
     */
    const openedByRaw = (record as Record<string, unknown> | null)?.opened_by;
    const openedByValue =
      typeof openedByRaw === 'string'
        ? openedByRaw
        : (openedByRaw as { value?: unknown } | undefined)?.value;
    if (typeof openedByValue !== 'string' || !openedByValue) {
      throw new BadRequestException(
        `ServiceNow request '${number}' carries no opened_by, so no requester can be attached to the licence request`,
      );
    }

    return { sysId, openedBySysId: openedByValue };
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
