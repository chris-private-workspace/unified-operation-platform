import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * PATCH /fulfilment/requests/:id — edit a request header (CH-007).
 *
 * What is NOT here is the load-bearing part of this DTO:
 *   - serviceNowNumber / serviceNowSysId / serviceNowStatus — the sync keys back
 *     to ServiceNow (D4). Change one and the platform can no longer mirror the
 *     ticket. The global whitelist ValidationPipe STRIPS any of these if sent,
 *     so this is defence in depth, not just documentation (see C3 test).
 *   - opcoId (D3) — changing it re-attributes the request across an AUTH-3a scope
 *     boundary and re-homes its ledger. Not editable; not here.
 *   - origin — set once at creation; it decides the whole lock model (§1.1).
 *
 * targetUpn IS here but is gated in the service: editable only while the account
 * has not synced (D2), because after sync it is the key the assign flow resolves
 * the M365 user by.
 */
export class UpdateRequestDto {
  @ApiPropertyOptional({
    description: 'the M365 user being onboarded — sync-gated (D2)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  targetUpn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetDisplayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  requesterEmail?: string;

  @ApiPropertyOptional({
    description: 'free-text remark / interpretation source',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rawRequestText?: string;
}
