import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationService,
  type NotificationMessage,
  type NotificationOutcome,
} from '../integration/email/notification.service';
import { OutboundFailureService } from './outbound-failure.service';
import { OUTBOUND_FAILURE_KINDS } from './outbound-failure-fields';

/**
 * CH-011 / ADR-0019 D3 — send a notification, and make a failure to send a
 * visible fact instead of a silent one.
 *
 * ## Why this sits in `fulfilment` and not next to the email service
 *
 * The failure queue (ADR-0011) lives here. If the integration-layer email
 * service recorded its own failures it would have to reach back into this
 * module, and `integration → fulfilment` is a cycle — this repo already
 * answered that question the other way: integration returns an outcome, the
 * caller records (CH-010's `direct-ticket.provider` does exactly this). So the
 * transport stays ignorant of the queue, and this thin service is the seam
 * between them.
 *
 * ## Why it never throws
 *
 * Same rule as the ServiceNow work note (ADR-0011 OD4): the caller's own flow
 * must not fail because a courtesy message did not go out. A password reset that
 * returns 500 because SMTP hiccuped is worse than one that returns 204 and
 * leaves a queue row an operator can see.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly failures: OutboundFailureService,
  ) {}

  /**
   * @returns the outcome, or null when the send threw. Never throws itself.
   */
  async send(
    message: NotificationMessage,
  ): Promise<NotificationOutcome | null> {
    try {
      const outcome = await this.notifications.send(message);

      if (outcome.status === 'not_configured') {
        // Queued too, deliberately. "Email is not set up" is a delivery failure
        // from the recipient's point of view, and an operator staring at a queue
        // row that says so will fix it faster than one staring at nothing. The
        // cost — noise on a deployment with no email configured — is bounded by
        // there being no caller unless a flow actually wants to send.
        await this.record(message, new Error(outcome.details));
      }
      return outcome;
    } catch (err) {
      // The message is already scrubbed by the transport (AcsEmailService), but
      // do not re-log it here: one log line per failure, at the layer that has
      // the vendor context.
      await this.record(message, err);
      this.logger.warn(
        `Notification '${message.template}' not delivered — queued for repair`,
      );
      return null;
    }
  }

  /**
   * H4: the recipient address reaches the queue (it has to — see the payload
   * whitelist note) but never a log line.
   */
  private async record(message: NotificationMessage, error: unknown) {
    await this.failures.record({
      kind: OUTBOUND_FAILURE_KINDS.NOTIFICATION_SEND,
      payload: { to: message.to, template: message.template },
      error,
    });
  }
}
