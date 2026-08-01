import { ApiProperty } from '@nestjs/swagger';
import { RequestDto } from './request-view.dto';

/**
 * CH-015 — three states, deliberately NOT three HTTP statuses.
 *
 * "we asked Graph and it has not got the account yet" and "we did not ask Graph
 * because you just asked" are completely different facts, and putting the second
 * one on the error path (429) is how it ends up rendered as the first. Both are
 * successful calls; the difference belongs in the body.
 */
export const SYNC_CHECK_STATUS = {
  /** Graph has the account (or the gate was already open). Gate is open. */
  FOUND: 'FOUND',
  /** Graph answered 404 — not synced yet. NOTHING was written. */
  NOT_FOUND: 'NOT_FOUND',
  /** Inside the cooldown — no Graph call was made, nothing was written. */
  THROTTLED: 'THROTTLED',
} as const;

export type SyncCheckStatus =
  (typeof SYNC_CHECK_STATUS)[keyof typeof SYNC_CHECK_STATUS];

export class SyncCheckResultDto {
  @ApiProperty({
    enum: Object.values(SYNC_CHECK_STATUS),
    description:
      'FOUND = gate is open · NOT_FOUND = Graph has not got the account yet (nothing written) · THROTTLED = inside the cooldown, no Graph call made',
  })
  status!: SyncCheckStatus;

  @ApiProperty({
    description:
      'Seconds before another check is worth making. 0 when the gate is open.',
  })
  retryAfterSeconds!: number;

  @ApiProperty({
    type: RequestDto,
    description: 'The request as it stands after the check.',
  })
  request!: RequestDto;
}
