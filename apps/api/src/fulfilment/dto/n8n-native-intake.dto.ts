import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ADR-0017 D4 — the envelope n8n workflow 1001/1005 actually POST (node
 * `WF1 - Prepare UOP Intake`). It does NOT match the canonical intake contract
 * (W24 CONTRACT.md, LOCKED): different shape, licence NAME instead of skuId
 * GUID, Job Function instead of opcoCode, REQ number instead of REQ sysId.
 *
 * This DTO describes n8n's shape as-is; `IntakeAdapterService` resolves it into
 * the canonical DTO. The canonical route and contract are untouched — callers
 * that already speak it keep the stricter guarantees.
 */

/** The only event this endpoint accepts (fail-closed on anything else). */
export const N8N_INTAKE_EVENT = 'license_request_received';

export class N8nSourceEmailDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'requester email from the Outlook trigger',
  })
  @IsOptional()
  @IsString()
  sender?: string;
}

export class N8nRequestBlockDto {
  @ApiProperty({
    description:
      'ServiceNow sc_request NUMBER (e.g. REQ0043858) — NOT the sysId; the adapter reverse-looks-up the sysId',
  })
  @IsString()
  @MinLength(1)
  requestId!: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsString()
  openedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({
    description:
      'n8n Job Function (1004 form dropdown value) — resolved via OPCO_BY_JOB_FUNCTION',
  })
  @IsString()
  @MinLength(1)
  department!: string;

  @ApiPropertyOptional({ type: N8nSourceEmailDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => N8nSourceEmailDto)
  source?: N8nSourceEmailDto;
}

export class N8nTargetUserDto {
  @ApiPropertyOptional({ description: 'raw name text from the source request' })
  @IsOptional()
  @IsString()
  raw?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sAMAccountName?: string;

  @ApiProperty({
    description:
      'the created AD account UPN — becomes Request.targetUpn, so the Graph sync gate keys off it',
  })
  @IsString()
  @MinLength(1)
  email!: string;

  @ApiPropertyOptional({
    description:
      'n8n flag: were these values confirmed through the 1004 form? Recorded, not enforced (MAPPING.md §0 finding C)',
  })
  @IsOptional()
  @IsBoolean()
  validated?: boolean;
}

export class N8nLicenseItemDto {
  @ApiPropertyOptional({ description: 'e.g. RITM0012345' })
  @IsOptional()
  @IsString()
  ritmNumber?: string;

  @ApiPropertyOptional({ description: 'sc_req_item sysId' })
  @IsOptional()
  @IsString()
  ritmSysId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ritmTitle?: string;

  @ApiProperty({
    description:
      'ServiceNow catalog `License` variable — resolved to a skuId GUID against SkuCatalog (unique hit or reject)',
  })
  @IsString()
  @MinLength(1)
  licenseCode!: string;

  @ApiPropertyOptional({
    description:
      'raw ServiceNow catalog variables, carried for diagnostics only',
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class N8nNativeIntakeDto {
  @ApiProperty({ enum: [N8N_INTAKE_EVENT] })
  @IsIn([N8N_INTAKE_EVENT])
  event!: string;

  @ApiPropertyOptional({
    description:
      'n8n-side correlation id (usually the REQ number). Recorded for tracing; idempotency is still keyed on the resolved REQ sysId.',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsISO8601()
  sentAt?: string;

  @ApiProperty({ type: N8nRequestBlockDto })
  @ValidateNested()
  @Type(() => N8nRequestBlockDto)
  request!: N8nRequestBlockDto;

  @ApiProperty({ type: N8nTargetUserDto })
  @ValidateNested()
  @Type(() => N8nTargetUserDto)
  targetUser!: N8nTargetUserDto;

  /**
   * W42 / ADR-0020 D5 — an EMPTY array is legitimate here.
   *
   * It means "ServiceNow carried no licence line at all", and that is precisely
   * what triggers the default-SKU injection (D1/D2). Until W42 this DTO required
   * ≥1, so the one payload the business cares about was rejected at the DTO
   * layer and never reached the adapter.
   *
   * ⚠️ Only the NATIVE envelope allows this. The canonical contract
   * (`N8nIntakeRequestDto`, W24 CONTRACT.md, LOCKED) still requires ≥1 — callers
   * that speak it keep the stricter guarantee.
   *
   * `@ArrayMinSize(0)` is kept rather than dropped so that "empty is allowed" is
   * something this file states, not something it forgot to say.
   */
  @ApiProperty({
    type: [N8nLicenseItemDto],
    description:
      'curated licence lines. MAY BE EMPTY — an empty array means ServiceNow carried no licence line, which triggers the default onboarding SKU (ADR-0020)',
  })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => N8nLicenseItemDto)
  licenseItems!: N8nLicenseItemDto[];
}
