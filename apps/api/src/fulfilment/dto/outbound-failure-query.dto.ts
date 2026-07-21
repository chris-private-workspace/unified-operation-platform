import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  OUTBOUND_FAILURE_KINDS,
  OUTBOUND_FAILURE_STATUS,
} from '../outbound-failure-fields';

const KINDS = Object.values(OUTBOUND_FAILURE_KINDS);
const STATUSES = Object.values(OUTBOUND_FAILURE_STATUS);

/** Hard cap on a single page — same posture as the audit trail (W29 F3). */
export const OUTBOUND_FAILURE_PAGE_MAX = 100;

/**
 * GET /admin/outbound-failures query (W31 F3). Filters validate against the
 * same constants the write path uses, so a typo'd filter fails loudly instead
 * of silently matching nothing.
 */
export class OutboundFailureQueryDto {
  @ApiProperty({ required: false, enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @ApiProperty({ required: false, enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: string;

  @ApiProperty({
    required: false,
    default: 50,
    maximum: OUTBOUND_FAILURE_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(OUTBOUND_FAILURE_PAGE_MAX)
  limit?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class OutboundFailureDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: KINDS }) kind!: string;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty({ description: 'whitelisted retry inputs — never credentials' })
  payload!: unknown;
  @ApiProperty({
    nullable: true,
    description:
      'side-effects that already happened. Present on request.mirror only — its presence is exactly why that kind must not be re-submitted (ADR-0011 D3).',
  })
  externalRef!: unknown;
  @ApiProperty({ description: 'message text only — never a raw vendor body' })
  lastError!: string;
  @ApiProperty() attemptCount!: number;
  @ApiProperty() lastAttemptAt!: Date;
  @ApiProperty({ nullable: true }) requestId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true }) resolvedAt!: Date | null;
  @ApiProperty({ nullable: true }) resolvedById!: string | null;
}

export class OutboundFailurePageDto {
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty({ type: [OutboundFailureDto] }) entries!: OutboundFailureDto[];
}
