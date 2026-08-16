import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReviewStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Window in days (1–365). Default 30.',
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class ReviewerStatsDto {
  @ApiProperty({ type: String, nullable: true })
  approverId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Null when the account no longer exists, or on the one path that ' +
      'records a decision without an approver id. The decisions still count.',
  })
  displayName!: string | null;

  @ApiProperty() decided!: number;
  @ApiProperty() approved!: number;
  @ApiProperty() rejected!: number;

  @ApiProperty({ type: Number, nullable: true })
  approvalRate!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  medianSecondsToDecide!: number | null;

  @ApiProperty() fastDecisions!: number;
}

/**
 * 期二 G7 / plan B7 — R13 monitoring.
 *
 * 🔴 **How to read these numbers, because one half of them is evidence and the
 * other half is not.**
 *
 * `fastDecisions` is the signal. A proposal decided seconds after it appeared
 * was not read, and that conclusion needs no assumptions.
 *
 * `medianSecondsToDecide` is context, NOT evidence of care. The clock starts
 * when the proposal was created, not when a person first saw it — so a long
 * median may mean careful review, or may mean nobody was at their desk until
 * after lunch. The two are indistinguishable from here, and a dashboard that
 * presented a slow median as diligence would be inventing the reassuring
 * reading.
 *
 * `approvalRate` on its own is likewise not a verdict: an agent whose proposals
 * are usually right SHOULD have a high one. What it is for is comparison —
 * between reviewers, and against itself over time.
 */
export class AgentReviewStatsDto {
  @ApiProperty() windowDays!: number;
  @ApiProperty() since!: Date;

  @ApiProperty({ description: 'Proposals a PERSON decided in the window.' })
  decided!: number;

  @ApiProperty({
    description:
      'The approver said yes. Includes proposals the platform then refused ' +
      '(期二 G1): the question here is what the human decided.',
  })
  approved!: number;

  @ApiProperty() rejected!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null when nothing was decided — never 0.',
  })
  approvalRate!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Median seconds from proposal created to decided. Context, not ' +
      'evidence of care — the clock includes time nobody was looking.',
  })
  medianSecondsToDecide!: number | null;

  @ApiProperty({
    description:
      'Decided in under `fastReviewSeconds`. THIS is the rubber-stamp signal.',
  })
  fastDecisions!: number;

  @ApiProperty() fastReviewSeconds!: number;

  @ApiProperty({ description: 'Still waiting on a person, at any age.' })
  pending!: number;

  @ApiProperty({ type: [ReviewerStatsDto] })
  byReviewer!: ReviewerStatsDto[];
}
