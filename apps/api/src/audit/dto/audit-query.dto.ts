import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AUDIT_ACTIONS, AUDIT_FIELD_WHITELIST } from '../audit-fields';

const ACTIONS = Object.values(AUDIT_ACTIONS);
const TARGET_TYPES = Object.keys(AUDIT_FIELD_WHITELIST);

/** Hard cap on a single page — nobody pulls the whole table in one call (plan F3). */
export const AUDIT_PAGE_MAX = 100;

/**
 * GET /admin/audit query (W29 F3). Every filter is optional; unfiltered reads
 * are still bounded by the page cap. `action` / `targetType` are validated
 * against the same constants the write path uses, so a typo'd filter fails
 * loudly instead of silently matching nothing.
 */
export class AuditQueryDto {
  @ApiProperty({ required: false, description: 'AppUser id of the actor' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiProperty({ required: false, enum: TARGET_TYPES })
  @IsOptional()
  @IsIn(TARGET_TYPES)
  targetType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiProperty({ required: false, enum: ACTIONS })
  @IsOptional()
  @IsIn(ACTIONS)
  action?: string;

  @ApiProperty({ required: false, description: 'createdAt >= (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false, description: 'createdAt <= (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiProperty({ required: false, default: 50, maximum: AUDIT_PAGE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUDIT_PAGE_MAX)
  limit?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Who did it — resolved for display so the frontend needn't join. ADMIN-only surface (P-B). */
export class AuditActorDto {
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
}

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() action!: string;
  @ApiProperty() targetType!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty({ nullable: true }) actorId!: string | null;
  @ApiProperty({ type: AuditActorDto, nullable: true })
  actor!: AuditActorDto | null;
  @ApiProperty({ enum: ['user', 'system', 'm2m'] }) actorType!: string;
  @ApiProperty({ nullable: true, description: 'whitelisted fields only' })
  before!: unknown;
  @ApiProperty({ nullable: true, description: 'whitelisted fields only' })
  after!: unknown;
  @ApiProperty({ nullable: true }) metadata!: unknown;
}

export class AuditPageDto {
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty({ type: [AuditEntryDto] }) entries!: AuditEntryDto[];
}
