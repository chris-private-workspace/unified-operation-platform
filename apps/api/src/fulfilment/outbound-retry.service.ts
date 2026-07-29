import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type AppUser,
  LineItemStage,
  type OutboundFailure,
  RequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { TicketUpdateProvider } from '../integration/ticket-update/ticket-update.provider';
import { NotificationService } from '../integration/email/notification.service';
import {
  REPLAYABLE_TEMPLATES,
  TEMPLATES,
  type TemplateKey,
} from '../integration/email/templates';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { RequestSubmissionProvider } from './request-submission.provider';
import { OutboundFailureService } from './outbound-failure.service';
import {
  OUTBOUND_FAILURE_KINDS,
  OUTBOUND_FAILURE_STATUS,
  TICKET_TRANSITIONS,
} from './outbound-failure-fields';

type Bag = Record<string, unknown>;

interface MirrorRefs {
  serviceNowSysId: string;
  serviceNowNumber: string | null;
  lineItems: { serviceNowSysId: string; serviceNowNumber: string | null }[];
}

/**
 * Human-triggered repair of a queued outbound failure (ADR-0011 D2/D3/D8).
 *
 * The whole reason this is not a single generic `retry()` is Decision 3: the
 * three kinds need three DIFFERENT actions, and one of them must never touch
 * ServiceNow. Dispatch is on `kind`, and `repairMirror` is deliberately written
 * so that no code path in it can reach the provider — see the G2 test.
 */
@Injectable()
export class OutboundRetryService {
  private readonly logger = new Logger(OutboundRetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly failures: OutboundFailureService,
    private readonly provider: RequestSubmissionProvider,
    private readonly snow: ServiceNowService,
    // W40 seam ④. A ticket-state repair MUST go through the seam: the failure
    // was produced by whichever provider is configured, and replaying it
    // directly would repair an n8n close by calling the Table API.
    private readonly tickets: TicketUpdateProvider,
    // CH-011. Injected as the abstract class, like every other integration
    // dependency here — this file must not know ACS exists.
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async retry(id: string, actor: AppUser) {
    const failure = await this.requireOpen(id);

    try {
      switch (failure.kind) {
        case OUTBOUND_FAILURE_KINDS.REQUEST_SUBMIT:
          await this.repairSubmit(failure);
          break;
        case OUTBOUND_FAILURE_KINDS.REQUEST_MIRROR:
          await this.repairMirror(failure);
          break;
        case OUTBOUND_FAILURE_KINDS.SERVICENOW_WORKNOTE:
          await this.repairWorkNote(failure);
          break;
        case OUTBOUND_FAILURE_KINDS.SERVICENOW_TICKET_UPDATE:
          await this.repairTicketUpdate(failure);
          break;
        case OUTBOUND_FAILURE_KINDS.NOTIFICATION_SEND:
          await this.repairNotification(failure);
          break;
        default:
          throw new BadRequestException(
            `Unknown failure kind '${failure.kind}' — cannot repair`,
          );
      }
    } catch (err) {
      // I2: a failed repair must not look like progress. The row stays open and
      // the attempt count climbs, because "tried 6 times, still failing" is the
      // fact ADR-0010 D8 wanted visible.
      await this.failures.markAttemptFailed(id, err);
      this.logger.warn(
        `Repair of ${failure.kind} failure ${id} failed: ${
          (err as Error)?.message
        }`,
      );
      throw err;
    }

    const resolved = await this.failures.markResolved(id, actor.id);
    await this.auditAction(
      AUDIT_ACTIONS.OUTBOUND_RETRY,
      failure,
      actor,
      `repaired ${failure.kind} after ${failure.attemptCount} failed attempt(s)`,
    );
    return resolved;
  }

  /** Operator judged no repair is needed. Reversible (I3). */
  async abandon(id: string, actor: AppUser) {
    const failure = await this.requireOpen(id);
    const updated = await this.failures.markAbandoned(id, actor.id);
    await this.auditAction(
      AUDIT_ACTIONS.OUTBOUND_ABANDON,
      failure,
      actor,
      `abandoned ${failure.kind} without repair`,
    );
    return updated;
  }

  /** Undo an abandon — back into the queue (I3). */
  async reopen(id: string, actor: AppUser) {
    const failure = await this.failures.findById(id);
    if (!failure) throw new NotFoundException(`Failure ${id} not found`);
    if (failure.status !== OUTBOUND_FAILURE_STATUS.ABANDONED) {
      throw new BadRequestException(
        'Only an abandoned failure can be reopened',
      );
    }
    const updated = await this.failures.reopen(id);
    await this.auditAction(
      AUDIT_ACTIONS.OUTBOUND_RETRY,
      failure,
      actor,
      `reopened ${failure.kind}`,
    );
    return updated;
  }

  // ── repairs ─────────────────────────────────────────────────────────

  /**
   * Nothing was created externally when this failed, so submitting again is the
   * correct — and safe — action.
   */
  private async repairSubmit(failure: OutboundFailure) {
    const payload = (failure.payload ?? {}) as Bag;
    const lines = this.payloadLines(payload);

    const submitted = await this.provider.submit({
      targetUpn: String(payload.targetUpn ?? ''),
      opcoCode: String(payload.opcoCode ?? ''),
      requesterEmail: payload.requesterEmail as string | undefined,
      remark: payload.remark as string | undefined,
      lineItems: lines.map((l) => ({
        skuId: l.skuId,
        skuPartNumber: l.skuPartNumber,
        quantity: l.quantity,
      })),
    });

    await this.writeMirror(failure, payload, {
      serviceNowSysId: submitted.serviceNowSysId,
      serviceNowNumber: submitted.serviceNowNumber ?? null,
      lineItems: submitted.lineItems.map((li) => ({
        serviceNowSysId: li.serviceNowSysId,
        serviceNowNumber: li.serviceNowNumber ?? null,
      })),
    });
  }

  /**
   * 🔴 Decision 3 — the ticket ALREADY EXISTS in ServiceNow. This repair writes
   * the local rows from the sysIds captured at failure time and MUST NOT reach
   * the provider: re-submitting would open a second real ticket that nobody
   * asked for and the platform could not tell apart from the first.
   *
   * There is no provider call anywhere in this path. The G2 test asserts it.
   */
  private async repairMirror(failure: OutboundFailure) {
    const payload = (failure.payload ?? {}) as Bag;
    const refs = failure.externalRef as unknown as MirrorRefs | null;
    if (!refs?.serviceNowSysId) {
      throw new BadRequestException(
        'This mirror failure has no recorded ServiceNow reference — repairing it would risk creating a duplicate ticket. Reconcile manually.',
      );
    }
    await this.writeMirror(failure, payload, refs);
  }

  /**
   * W40 — replay a RITM state change THROUGH THE SEAM.
   *
   * Safe to replay, unlike `request.mirror`: setting a ticket to the state it is
   * already in is idempotent on ServiceNow's side and creates nothing. What is
   * NOT safe is replaying the wrong transition — closing a ticket that was only
   * meant to be put on hold is not recoverable — so an unrecognised value fails
   * loudly instead of defaulting to either one.
   */
  private async repairTicketUpdate(failure: OutboundFailure) {
    const payload = (failure.payload ?? {}) as Bag;
    const transition = payload.transition;
    const sysId = String(payload.snTarget ?? '');
    const note = String(payload.note ?? '');
    if (!sysId) {
      throw new BadRequestException(
        'This ticket failure has no recorded RITM sys_id — nothing to repair.',
      );
    }

    let outcome;
    if (transition === TICKET_TRANSITIONS.CLOSE) {
      outcome = await this.tickets.closeComplete(sysId, note);
    } else if (transition === TICKET_TRANSITIONS.HOLD) {
      outcome = await this.tickets.markInProgress(sysId, note);
    } else {
      throw new BadRequestException(
        `Unknown ticket transition '${String(transition)}' — cannot repair`,
      );
    }

    // The provider answered but the ticket did not move (e.g. ServiceNow
    // refused the PATCH). That is still a failed repair — I2: it must not be
    // marked resolved.
    if (outcome.status !== 'updated') {
      throw new BadRequestException(outcome.details);
    }
  }

  /**
   * CH-011 — re-send a notification that did not go out.
   *
   * 🔴 Two guards, both about the same thing: the queue row does NOT carry the
   * template's parameters (see `PAYLOAD_WHITELIST['notification.send']`), so a
   * repair can only re-render templates that need none.
   *
   *  - an unknown template fails loudly rather than picking a default;
   *  - a known template that is not in `REPLAYABLE_TEMPLATES` is refused, with
   *    the reason, so the operator is told to have the user request it again.
   *
   * Without the second guard AUTH-4c-C's reset mail would be replayable, and
   * "replay" there means mailing somebody a link whose token no longer works.
   */
  private async repairNotification(failure: OutboundFailure) {
    const payload = (failure.payload ?? {}) as Bag;
    const to = String(payload.to ?? '');
    const template = String(payload.template ?? '') as TemplateKey;

    if (!to) {
      throw new BadRequestException(
        'This notification failure has no recorded recipient — nothing to repair.',
      );
    }
    if (!(template in TEMPLATES)) {
      throw new BadRequestException(
        `Unknown notification template '${template}' — cannot repair`,
      );
    }
    if (!REPLAYABLE_TEMPLATES.includes(template)) {
      throw new BadRequestException(
        `'${template}' cannot be re-sent from the queue because its contents are single-use. Ask the recipient to request it again.`,
      );
    }

    const outcome = await this.notifications.send({ to, template });

    // I2 again: "email is still not configured" is not a repair.
    if (outcome.status !== 'sent') {
      throw new BadRequestException(outcome.details);
    }
  }

  /** Re-sending a work note is idempotent — a duplicate note is harmless. */
  private async repairWorkNote(failure: OutboundFailure) {
    const payload = (failure.payload ?? {}) as Bag;
    await this.snow.addWorkNote(
      String(payload.snTarget ?? ''),
      String(payload.note ?? ''),
      String(payload.table ?? 'sc_req_item'),
    );
  }

  // ── shared ──────────────────────────────────────────────────────────

  /**
   * Build the local Request + line items from a payload and a set of SN refs.
   * Shared by both request kinds — the ONLY difference between them is where
   * the refs came from (a fresh submit vs. ones recorded at failure time).
   */
  private async writeMirror(
    failure: OutboundFailure,
    payload: Bag,
    refs: MirrorRefs,
  ) {
    const opcoCode = String(payload.opcoCode ?? '');
    const opco = await this.prisma.opco.findUnique({
      where: { code: opcoCode },
    });
    if (!opco) throw new BadRequestException(`OpCo '${opcoCode}' not found`);

    // Idempotence guard: serviceNowSysId is @unique, so a mirror written by an
    // earlier repair (or a concurrent one) would blow up with a constraint
    // error. Detect it and treat it as already-repaired instead.
    const existing = await this.prisma.request.findUnique({
      where: { serviceNowSysId: refs.serviceNowSysId },
    });
    if (existing) {
      this.logger.log(
        `Mirror for ${refs.serviceNowSysId} already exists (request ${existing.id}) — nothing to write`,
      );
      return existing;
    }

    const lines = this.payloadLines(payload);
    const resolved = [];
    for (const line of lines) {
      const sku = await this.prisma.skuCatalog.findUnique({
        where: { skuId: line.skuId },
      });
      if (!sku) throw new BadRequestException(`SKU '${line.skuId}' not found`);
      resolved.push({ skuCatalogId: sku.id, quantity: line.quantity });
    }

    return this.prisma.request.create({
      data: {
        targetUpn: String(payload.targetUpn ?? ''),
        targetDisplayName: (payload.targetDisplayName as string) ?? null,
        opcoId: opco.id,
        requesterEmail: (payload.requesterEmail as string) ?? null,
        rawRequestText: (payload.remark as string) ?? null,
        status: RequestStatus.OPEN,
        origin: 'platform-created',
        handledById: null,
        serviceNowSysId: refs.serviceNowSysId,
        serviceNowNumber: refs.serviceNowNumber,
        lineItems: {
          create: resolved.map((r, i) => ({
            skuCatalogId: r.skuCatalogId,
            quantity: r.quantity,
            stage: LineItemStage.REQUESTED,
            serviceNowSysId: refs.lineItems?.[i]?.serviceNowSysId ?? null,
            serviceNowNumber: refs.lineItems?.[i]?.serviceNowNumber ?? null,
          })),
        },
      },
      include: { lineItems: true },
    });
  }

  private payloadLines(payload: Bag) {
    const raw = Array.isArray(payload.lineItems) ? payload.lineItems : [];
    return raw.map((l) => {
      const line = (l ?? {}) as Bag;
      return {
        skuId: String(line.skuId ?? ''),
        skuPartNumber: String(line.skuPartNumber ?? ''),
        quantity: Number(line.quantity ?? 1),
      };
    });
  }

  private async requireOpen(id: string): Promise<OutboundFailure> {
    const failure = await this.failures.findById(id);
    if (!failure) throw new NotFoundException(`Failure ${id} not found`);
    if (failure.status === OUTBOUND_FAILURE_STATUS.RESOLVED) {
      throw new BadRequestException('This failure is already resolved');
    }
    return failure;
  }

  /**
   * Audit runs OUTSIDE the repair (D8 + D6): the repair's own writes are not in
   * a transaction this could join, and a repair that succeeded must not be
   * undone by an audit hiccup.
   */
  private async auditAction(
    action: string,
    failure: OutboundFailure,
    actor: AppUser,
    reason: string,
  ) {
    await this.audit.log(this.prisma, {
      action: action as never,
      targetType: 'OutboundFailure',
      targetId: failure.id,
      actorId: actor.id,
      metadata: { reason },
    });
  }
}
