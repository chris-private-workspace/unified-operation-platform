import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { dedupeRecipients } from './intake-notification-recipients';

/**
 * CH-021 — tell somebody that an onboarding landed.
 *
 * Until this existed, a request pushed in by n8n sat in the platform until a
 * human happened to open the Requests page. That was the one completely unbuilt
 * step of the nine-step end-to-end flow Chris walked through on 2026-08-09.
 *
 * ## Why it never throws
 *
 * Same rule as `NotificationDispatchService` and the ServiceNow work note
 * (ADR-0011 OD4, ADR-0020 D6): by the time this runs the Request is WRITTEN and
 * an operator can see it. Turning "the mail server hiccuped" into "the
 * onboarding 500'd and n8n will retry it" trades a recoverable problem for a
 * confusing one. Every failure below is either queued (transport — the dispatch
 * service does that) or logged (no recipients, no such request).
 *
 * 🔴 That means the caller does NOT need a try/catch, and must not add one that
 * changes the outcome. The guarantee lives here so there is one place to read it.
 */
@Injectable()
export class IntakeNotificationService {
  private readonly logger = new Logger(IntakeNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  /**
   * Call this ONLY when the intake actually created a request.
   *
   * 🔴 The idempotency lives at the CALL SITE, not here (CH-021 D1). Intake is
   * idempotent on `Request.serviceNowSysId`, so a repeat push from n8n returns
   * the existing request — and 1001 retries up to three times. A guard inside
   * this method would need its own "have I sent this already" state, which is
   * the `Request.notifiedAt` column D1 deliberately refused to add: the caller
   * already knows whether it wrote a row, and that answer is free.
   */
  async notifyNewIntake(requestId: string): Promise<void> {
    try {
      const request = await this.prisma.request.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          targetUpn: true,
          targetDisplayName: true,
          serviceNowNumber: true,
          opco: { select: { id: true, code: true } },
          lineItems: {
            select: {
              quantity: true,
              sku: { select: { skuPartNumber: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      });

      if (!request) {
        // Not reachable from the intake paths (they just wrote it), so if this
        // ever fires it is a caller bug and not a missing notification.
        this.logger.warn(
          `Cannot notify for request ${requestId} — it no longer exists`,
        );
        return;
      }

      const recipients = await this.resolveRecipients(request.opco.id);

      // CH-021 D3 / A4 — a real situation, not an error: 24 OpCos and the seed
      // only gives RHK an OPCO_IT user. The request still stands; what must not
      // happen is this passing silently, because then "notifications work" and
      // "nobody is reading them" look identical from the outside.
      if (recipients.length === 0) {
        this.logger.warn(
          `Onboarding intake ${request.id} (opco ${request.opco.code}) has nobody to notify — no active OPCO_IT user and OPS_NOTIFICATION_MAILBOX is unset`,
        );
        return;
      }

      const params = this.params(request);

      for (const to of recipients) {
        await this.dispatch.send({ to, template: 'onboarding-intake', params });
      }

      // H4 / A8: request id, OpCo code and a COUNT. Never an address, never the
      // target UPN — both of those are in the message body, where the reader is
      // known, and neither belongs in a log file, where they are not.
      this.logger.log(
        `Onboarding intake ${request.id} (opco ${request.opco.code}) notified ${recipients.length} recipient(s)`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not notify for onboarding intake ${requestId}: ${
          (err as Error)?.message
        }`,
      );
    }
  }

  /**
   * CH-021 §2.2 ② — the OpCo's own IT users plus the fixed ops mailbox.
   *
   * `active` is part of the query rather than a filter afterwards: a
   * deactivated account is somebody who has left, and mailing them is how a
   * notification quietly goes to nobody while the count says it went to two.
   */
  private async resolveRecipients(opcoId: string): Promise<string[]> {
    const opcoIt = await this.prisma.appUser.findMany({
      where: { role: Role.OPCO_IT, opcoScopeId: opcoId, active: true },
      select: { email: true },
      // Deterministic so a test can assert the array rather than sort it first.
      orderBy: { email: 'asc' },
    });

    // `get`, not `getOrThrow`: an optional feature being unconfigured must not
    // stop the application from booting (same rule as APP_BASE_URL — W41 — and
    // as BUG-008's entrypoint). The consequence of leaving it unset is one
    // fewer recipient, and D3 above makes that visible.
    const opsMailbox = this.config.get<string>('OPS_NOTIFICATION_MAILBOX');

    return dedupeRecipients([...opcoIt.map((u) => u.email), opsMailbox]);
  }

  /** All template inputs are strings (`NotificationMessage.params`). */
  private params(request: {
    id: string;
    targetUpn: string;
    targetDisplayName: string | null;
    serviceNowNumber: string | null;
    opco: { code: string };
    lineItems: { quantity: number; sku: { skuPartNumber: string } }[];
  }): Record<string, string> {
    return {
      displayName: request.targetDisplayName ?? '',
      targetUpn: request.targetUpn,
      opcoCode: request.opco.code,
      reqNumber: request.serviceNowNumber ?? '',
      lineItems: request.lineItems
        .map((l) => `${l.sku.skuPartNumber} × ${l.quantity}`)
        .join(', '),
      requestUrl: this.requestUrl(request.id),
    };
  }

  /**
   * Empty string when `APP_BASE_URL` is unset, and the template drops the link
   * rather than rendering a broken one.
   *
   * 🔴 Deliberately different from `password-reset`, which REFUSES to send at
   * all in the same situation (W41 / auth.controller). A reset mail without its
   * link is not a degraded message, it is a dead one; this message still says
   * the thing it exists to say. Logged as an ops fault either way.
   */
  private requestUrl(requestId: string): string {
    const baseUrl = this.config.get<string>('APP_BASE_URL');
    if (!baseUrl) {
      this.logger.warn(
        'APP_BASE_URL is not set — the onboarding notification will carry no link',
      );
      return '';
    }
    return `${baseUrl.replace(/\/+$/, '')}/requests/${requestId}`;
  }
}
