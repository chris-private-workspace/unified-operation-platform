import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { EventType, LineItemStage } from '@prisma/client';

/** Overview shows a tail, not a log — /requests is where history is browsed. */
export const ACTIVITY_FEED_DEFAULT = 6;
export const ACTIVITY_FEED_MAX = 50;

export class ActivityQueryDto {
  @ApiProperty({
    required: false,
    default: ACTIVITY_FEED_DEFAULT,
    maximum: ACTIVITY_FEED_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACTIVITY_FEED_MAX)
  limit?: number;
}

/**
 * One row of the operational feed (CH-006).
 *
 * H4: the field list is a WHITELIST, and the service builds it with a Prisma
 * `select` rather than an `include` so the shape is enforced at the query — not
 * trimmed afterwards. Deliberately absent: Request.targetUpn / requesterEmail /
 * targetDisplayName. This endpoint is open to OPCO_IT, and an onboarding
 * subject's address has no business travelling with a feed row that only needs
 * to say what happened. See the negative assertion in activity.service.spec.ts.
 */
export class ActivityEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: EventType }) type!: EventType;
  @ApiProperty({ nullable: true, enum: LineItemStage })
  fromStage!: LineItemStage | null;
  @ApiProperty({ nullable: true, enum: LineItemStage })
  toStage!: LineItemStage | null;
  @ApiProperty({ nullable: true }) message!: string | null;
  @ApiProperty() createdAt!: Date;

  @ApiProperty({
    nullable: true,
    description:
      'operator who caused it — null for system events (SYNC / NOTE)',
  })
  actorName!: string | null;

  @ApiProperty({ description: 'for linking the row to its request' })
  requestId!: string;

  @ApiProperty({
    description:
      'human-readable request handle — the ServiceNow number when the request has one, else a short id tail',
  })
  requestRef!: string;
}
