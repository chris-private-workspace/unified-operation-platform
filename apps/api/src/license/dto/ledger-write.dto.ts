import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * PATCH /license/ledger/:id — manual correction of a single ledger row
 * (ADR-0007 / W23-A). Sets the ABSOLUTE value of allocatedQuantity and/or
 * assignedQuantity; at least one must be supplied (enforced in the service).
 * Non-negative ints only (matches import `toQuantity`); over-allocation is a
 * displayed flag, NOT a write-blocking gate (ADR-0007 §6).
 */
export class UpdateLedgerDto {
  @ApiProperty({
    required: false,
    minimum: 0,
    description: 'new absolute allocated quantity (OpCo budget / owned)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  allocatedQuantity?: number;

  @ApiProperty({
    required: false,
    minimum: 0,
    description: 'new absolute assigned quantity (manual correction / 對回)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  assignedQuantity?: number;

  @ApiProperty({
    required: false,
    description: 'why this manual adjustment (recorded in LedgerAdjustment)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
