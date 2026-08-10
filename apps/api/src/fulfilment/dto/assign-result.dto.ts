import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ASSIGN_OUTCOMES,
  ASSIGN_STEP_KEYS,
  ASSIGN_STEP_OWNERS,
  ASSIGN_STEP_STATUSES,
  type AssignOutcome,
  type AssignResult,
  type AssignStep,
  type AssignStepKey,
  type AssignStepOwner,
  type AssignStepStatus,
} from '../assign-step';
import { RequestLineItemDto } from './request-view.dto';

/**
 * ADR-0029 — the OpenAPI face of the assign step contract.
 *
 * Response-only: nothing here is ever parsed off the wire, so there are no
 * class-validator decorators. They would read as validation that runs, and it
 * does not.
 *
 * Every `enum:` spreads the const array from `assign-step.ts` rather than
 * repeating the literals. A second hand-written list is the failure mode this
 * avoids: it compiles, it publishes, and it silently disagrees with the type.
 *
 * 🔴 NOT wired to the controller yet. Declaring the shape and returning it are
 * separate steps on purpose — returning it changes the response contract AND
 * the 400 body, which is where the real risk sits (a frontend `onError` that
 * still reads `message` renders an empty error). See W45 progress.
 */
export class AssignStepDto implements AssignStep {
  @ApiProperty({ enum: [...ASSIGN_STEP_KEYS] })
  key!: AssignStepKey;

  @ApiProperty({ enum: [...ASSIGN_STEP_STATUSES] })
  status!: AssignStepStatus;

  /**
   * 🔴 Scrubbed before it gets here. The `directory` and `sync-*` steps carry
   * vendor errors that can embed the target UPN (BUG-004 shape). The scrubbing
   * belongs in the service and needs its own test — a schema cannot enforce it.
   */
  @ApiPropertyOptional({
    description:
      'Human-readable detail. PII-scrubbed; never carries the target UPN.',
  })
  detail?: string;

  @ApiPropertyOptional({
    description: 'Only meaningful when status is "failed".',
  })
  retryable?: boolean;

  @ApiPropertyOptional({
    enum: [...ASSIGN_STEP_OWNERS],
    description:
      'Who unblocks this. Only meaningful when status is "failed". Present so callers never infer the owner from message text.',
  })
  whoFixes?: AssignStepOwner;
}

export class AssignResultDto implements AssignResult {
  @ApiProperty({
    enum: [...ASSIGN_OUTCOMES],
    description:
      '"blocked" = a gate refused and nothing was attempted; "failed" = something broke partway. Not the same axis as retryable.',
  })
  outcome!: AssignOutcome;

  @ApiPropertyOptional({
    enum: [...ASSIGN_STEP_KEYS],
    description: 'The first non-ok step. Absent when outcome is "assigned".',
  })
  failedAt?: AssignStepKey;

  @ApiProperty({
    type: [AssignStepDto],
    description:
      'Every step reached, in run order. Steps after a failure are absent rather than reported as skipped — they were never evaluated.',
  })
  steps!: AssignStepDto[];

  /**
   * The assigned line item, kept ALONGSIDE the ADR-0029 shape rather than
   * replaced by it. Callers that read the line item keep working, so no moment
   * exists where this response is well-formed but useless to them.
   *
   * Absent on a blocked/failed outcome — nothing was assigned.
   */
  @ApiPropertyOptional({ type: RequestLineItemDto })
  lineItem?: RequestLineItemDto;
}
