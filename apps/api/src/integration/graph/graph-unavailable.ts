import { Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Wrap a raw Microsoft Graph failure as a clean 503.
 *
 * A raw MSAL / Graph error is not an HttpException and carries an invalid status
 * (-1) that crashes the Nest process when it reaches the exception filter
 * (BUG-002). This shared helper lets every Graph caller — assign, reconcile,
 * catalog sync (BE-graph-harden) — fail the same clean way.
 *
 * H4: never log the target UPN or any secret; the action + message is enough to
 * triage.
 */
export function graphUnavailable(
  logger: Logger,
  action: string,
  err: unknown,
): ServiceUnavailableException {
  logger.error(
    `Microsoft Graph unavailable while trying to ${action}: ${
      (err as Error)?.message
    }`,
  );
  return new ServiceUnavailableException(
    `Microsoft Graph is unavailable — could not ${action}. Please retry.`,
  );
}
