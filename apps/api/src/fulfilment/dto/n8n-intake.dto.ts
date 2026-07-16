import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One onboarding license line — maps to a RequestLineItem + its sc_req_item
 * (RITM). ADR-0008 D6 / CONTRACT §4 two-level: Request = REQ, line item = RITM.
 */
export class N8nIntakeLineItemDto {
  @ApiProperty({
    description: 'M365/D365 SKU GUID (SkuCatalog.skuId) — AGENDA B1',
  })
  @IsString()
  @MinLength(1)
  skuId!: string;

  @ApiProperty({ description: 'seats to fulfil', minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'sc_req_item (RITM) sysId for this line',
  })
  @IsOptional()
  @IsString()
  serviceNowRitmSysId?: string;

  @ApiPropertyOptional({ description: 'e.g. RITM0012345' })
  @IsOptional()
  @IsString()
  serviceNowRitmNumber?: string;
}

/**
 * Body for POST /requests/intake — n8n onboarding push (m2m, IntakeKeyGuard).
 * One call carries the full onboarding SKU list + ServiceNow REQ + sync gate.
 * Distinct from the user-facing POST /fulfilment/requests (CONTRACT §1):
 * m2m (no user token), one-shot line items, sync gate carried inline.
 */
export class N8nIntakeRequestDto {
  @ApiProperty({ description: 'the new user being onboarded (target UPN)' })
  @IsString()
  @MinLength(1)
  targetUpn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDisplayName?: string;

  @ApiProperty({ description: 'OpCo code, e.g. "RHK" (Opco.code) — AGENDA B2' })
  @IsString()
  @MinLength(1)
  opcoCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @ApiPropertyOptional({
    description:
      'free-text remark; NOT auto-parsed into line items (DESIGN §6)',
  })
  @IsOptional()
  @IsString()
  rawRequestText?: string;

  // ── ServiceNow sc_request (REQ) — required; doubles as idempotency key (B3/B5) ──
  @ApiProperty({
    description:
      'sc_request (REQ) sysId — @unique idempotency key (upsert-or-skip)',
  })
  @IsString()
  @MinLength(1)
  serviceNowSysId!: string;

  @ApiPropertyOptional({ description: 'e.g. REQ0012345' })
  @IsOptional()
  @IsString()
  serviceNowNumber?: string;

  // ── Phase 1 sync gate (AGENDA A4/B4) ──
  // azureSyncedAt = n8n-claimed synced; on-prem AD→Entra Connect has lag, so it is
  // NOT proof Graph can see the user — assign still gates on a real findUser hit (RISK R3).
  @ApiPropertyOptional({ description: 'AD account created (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  accountCreatedAt?: string;

  @ApiPropertyOptional({
    description:
      'n8n-claimed AD→Entra synced (ISO 8601); ≠ Graph-visible (RISK R3)',
  })
  @IsOptional()
  @IsDateString()
  azureSyncedAt?: string;

  @ApiProperty({
    type: [N8nIntakeLineItemDto],
    description: 'full onboarding SKU list (≥1)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => N8nIntakeLineItemDto)
  lineItems!: N8nIntakeLineItemDto[];
}
