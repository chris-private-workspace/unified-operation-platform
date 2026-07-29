import type { TemplateKey } from './templates';

/**
 * CH-011 / ADR-0019 — the notification base layer's one interface.
 *
 * ## Why there is no seam here
 *
 * ADR-0017's three seams exist because two executors genuinely exist for each.
 * Email has one (ACS). Building a switch now would be the abstraction-without-a-
 * second-implementation that W38 (5 methods → 3) and W40 (`addWorkNote` kept out
 * of the interface) both deliberately refused. If a second transport ever lands,
 * add the switch then, following ADR-0017 D1 — not before (ADR-0019 D1).
 *
 * This abstract class still earns its place for a different reason: it is what
 * keeps `@azure/communication-email` inside `src/integration/email/`. Callers
 * depend on this type, never on `EmailClient` (CLAUDE.md §3.1, ADR-0019 D2).
 */

/**
 * A message to send.
 *
 * 🔴 `to` is an explicit address, supplied by the caller — there is deliberately
 * no resolution from role / OpCo / subscription preferences (ADR-0019 D3, OQ-2
 * approved by Chris 2026-07-29). The policy such a resolver would need — who
 * receives which class of notification — does not exist anywhere in this
 * codebase, so building the resolver would mean inventing the policy inside it.
 * AUTH-4c-C's recipient is `AppUser.email`: one field, nothing to resolve.
 */
export interface NotificationMessage {
  /** Recipient address. PII — never log it raw (H4, RISK R5). */
  to: string;
  template: TemplateKey;
  /** Template inputs. See the payload note in `outbound-failure-fields.ts`. */
  params?: Record<string, string>;
}

/**
 * What a send attempt produced.
 *
 * Split the same way seam ② was (ADR-0017 W38 OQ-4): a CONFIGURATION problem is
 * an outcome, a TRANSPORT failure throws. The distinction matters to whoever
 * reads the failure queue — "nobody set a sender address" and "Azure is down"
 * lead to different actions, and collapsing them into one string makes the
 * operator go and check the wrong system first.
 */
export type NotificationOutcome =
  | {
      status: 'sent';
      /**
       * ACS operation id.
       *
       * 🔴 Read this as "ACS accepted and processed the message", NOT as
       * "the recipient received it". With a custom sender domain (rci-t.com)
       * the DNS side can drop delivery silently while this still says
       * Succeeded — that is CH-011 R1, and it is why A11 is written as "以
       * 收件人真係收到為準" rather than "API returned success".
       */
      messageId: string;
    }
  | {
      /** No connection string, or no sender address. Nothing was attempted. */
      status: 'not_configured';
      details: string;
    };

export abstract class NotificationService {
  abstract send(message: NotificationMessage): Promise<NotificationOutcome>;
}
