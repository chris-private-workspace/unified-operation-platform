import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Allocation reset request (CH-016).
 *
 * Exists because the import is upsert-only: a cell that appeared in a bad CSV
 * but NOT in the corrected one can never be cleared. This is the way to zero it.
 *
 * `dryRun` defaults on, exactly like the import (ADR-0004 OD4) — one habit for
 * both destructive ledger operations, not two.
 */
export class AllocationResetRequestDto {
  @ApiProperty({
    required: false,
    default: true,
    description: 'true (default) = preview only; false = write zeros',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    required: false,
    example: 'RHK',
    description: 'Limit to one OpCo (Opco.code). Omit = every OpCo.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  opcoCode?: string;
}

/** One ledger cell that will be (or was) zeroed. */
export class AllocationResetRowDto {
  @ApiProperty({ example: 'RHK' }) opcoCode!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;
  @ApiProperty({ description: 'allocatedQuantity before the reset' })
  before!: number;

  /**
   * CH-016 §2.5 — false means this cell CANNOT be restored by re-importing.
   * The import only reads `active: true` catalog entries, so a deactivated
   * SKU's cell is unreachable to it; the only way back is a per-row PATCH.
   */
  @ApiProperty({
    description:
      'false = the SKU is inactive, so re-importing cannot restore this cell',
  })
  skuActive!: boolean;
}

export class AllocationResetResultDto {
  @ApiProperty({ description: 'true = nothing written (preview)' })
  dryRun!: boolean;

  @ApiProperty({
    description:
      'ledger cells with a non-zero allocatedQuantity that are in scope',
  })
  affected!: number;

  @ApiProperty({
    example: 'all',
    description: "OpCo code the reset was limited to, or 'all'",
  })
  scope!: string;

  /**
   * CH-016 §2.5 — how many of `affected` belong to an inactive SKU and are
   * therefore NOT recoverable by re-importing. Surfaced as its own number
   * rather than left for the UI to count, so the warning text and the figure
   * can never disagree.
   */
  @ApiProperty({
    description:
      'subset of `affected` whose SKU is inactive — re-import cannot restore these',
  })
  irreversible!: number;

  @ApiProperty({ type: [AllocationResetRowDto] })
  rows!: AllocationResetRowDto[];

  @ApiProperty({
    description:
      'Consequences of committing this reset. Surfaced verbatim by the UI — the mid-state it describes is real (spec §2.4).',
  })
  warning!: string;
}
