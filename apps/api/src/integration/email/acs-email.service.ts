import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';
import { scrubPii } from '../scrub-pii';
import { ConnectorConfigService } from '../connector-config.service';
import {
  NotificationService,
  type NotificationMessage,
  type NotificationOutcome,
} from './notification.service';
import { TEMPLATES } from './templates';

/**
 * CH-011 / ADR-0019 — the ACS transport. The ONLY file in the repo allowed to
 * import `@azure/communication-email` (CLAUDE.md §3.1, ADR-0019 D2); an
 * `email.boundary.spec.ts` asserts that.
 *
 * ## Why nothing here is read at boot
 *
 * ADR-0019 D4: email is OPTIONAL. Config is resolved per call and a missing
 * value comes back as `not_configured`, never as a thrown startup error. Using
 * `getOrThrow` would turn "somebody mistyped the sender address" into "the whole
 * platform will not boot" — a convenience feature must not be able to do that.
 * It is also what makes A9 provable: with no ACS_* env at all, the app starts and
 * every existing test still passes.
 */
@Injectable()
export class AcsEmailService extends NotificationService {
  private readonly logger = new Logger(AcsEmailService.name);

  /**
   * Built on first use and reused. Lazy rather than in the constructor for the
   * same reason as `ServiceNowService.getIntegrationUserSysId` (CH-010): boot
   * must not depend on an optional integration being well-formed.
   */
  private client?: EmailClient;

  constructor(
    private readonly config: ConfigService,
    private readonly connectorConfig: ConnectorConfigService,
  ) {
    super();
  }

  async send(message: NotificationMessage): Promise<NotificationOutcome> {
    const sender = await this.connectorConfig.resolve(
      'email',
      'acsSenderAddress',
    );
    if (!sender) {
      return {
        status: 'not_configured',
        details:
          'No sender address configured (ACS_SENDER_ADDRESS, or the acsSenderAddress override)',
      };
    }

    const client = this.resolveClient();
    if (!client) {
      return {
        status: 'not_configured',
        details: 'ACS_CONNECTION_STRING is not set',
      };
    }

    const rendered = TEMPLATES[message.template](message.params ?? {});

    try {
      const poller = await client.beginSend({
        senderAddress: sender,
        recipients: { to: [{ address: message.to }] },
        content: {
          subject: rendered.subject,
          plainText: rendered.text,
          html: rendered.html,
        },
      });
      const result = await poller.pollUntilDone();

      if (result.status !== 'Succeeded') {
        // ACS answered, and the answer was "no". A transport-level refusal, so
        // it throws (ADR-0017 W38 OQ-4: config problems are outcomes, transport
        // failures throw) and the caller records it.
        throw new Error(
          `Azure Communication Services reported status '${result.status}'`,
        );
      }

      // 🔴 What is being logged: the TEMPLATE, never the recipient. The address
      // is PII (H4) and RISK R5 exists because "this particular string is
      // harmless" has been wrong three times (BUG-001 / 004 / 007).
      this.logger.log(
        `Sent '${message.template}' via ACS (operation ${result.id})`,
      );
      return { status: 'sent', messageId: result.id };
    } catch (err) {
      // The vendor's own text is foreign input: it routinely quotes the request,
      // and the request contains the recipient address. Scrub before it reaches
      // a log line OR an exception message — BUG-004 hid for 18 days precisely
      // because the exception was clean while the log line was not.
      const detail = scrubPii((err as Error)?.message) || 'unknown error';
      this.logger.warn(`ACS send failed for '${message.template}': ${detail}`);
      throw new Error(`Email send failed: ${detail}`);
    }
  }

  /**
   * The connection string is a SECRET: env-only, never a ConnectorConfig column,
   * never returned by the admin API, never logged (ADR-0013 D2/D5, ADR-0019 D6).
   * Note what is *not* in the catch below — the string itself, not even a
   * fragment, because a malformed one tends to appear verbatim in the error.
   */
  private resolveClient(): EmailClient | undefined {
    if (this.client) return this.client;
    const connectionString = this.config.get<string>('ACS_CONNECTION_STRING');
    if (!connectionString) return undefined;
    try {
      this.client = new EmailClient(connectionString);
      return this.client;
    } catch {
      this.logger.error(
        'ACS_CONNECTION_STRING is set but malformed — email is disabled',
      );
      return undefined;
    }
  }
}
