import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { scrubPii } from '../scrub-pii';

/**
 * Wrap a raw Microsoft Graph failure as a clean 503.
 *
 * A raw MSAL / Graph error is not an HttpException and carries an invalid status
 * (-1) that crashes the Nest process when it reaches the exception filter
 * (BUG-002). This shared helper lets every Graph caller — assign, reconcile,
 * catalog sync (BE-graph-harden) — fail the same clean way.
 *
 * H4: never log the target UPN or any secret.
 *
 * BUG-004 — that line used to be a claim this function did not honour. It
 * interpolated Graph's message verbatim, and Graph quotes the request path in
 * its 404s, so the UPN went straight into the log. The message is still worth
 * keeping (AADSTS codes and HTTP statuses are how you tell an expired secret
 * from a missing permission), so it goes through scrubPii rather than being
 * dropped — see that file for what the net does and does not catch.
 */
export function graphUnavailable(
  logger: Logger,
  action: string,
  err: unknown,
): ServiceUnavailableException {
  logger.error(
    `Microsoft Graph unavailable while trying to ${action}: ${scrubPii(
      (err as Error)?.message,
    )}`,
  );
  return new ServiceUnavailableException(
    `Microsoft Graph is unavailable — could not ${action}. Please retry.`,
  );
}
