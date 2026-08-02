import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Ledger full reset request (CH-017 / ADR-0022).
 *
 * The difference from CH-016's allocation reset is one column and a whole risk
 * class: this also zeroes `assignedQuantity`, which the allocation import is
 * forbidden to write (ADR-0004 #5). So a bad allocation import is recoverable by
 * re-importing, and this is not — the only way back is ADR-0014's baseline
 * script or a per-cell PATCH. Hence `confirm`, which the allocation reset has no
 * need for.
 */
export class LedgerFullResetRequestDto {
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

  /**
   * Typed confirmation, checked only on commit. Must equal `opcoCode`, or the
   * literal 'ALL' when no OpCo was given.
   *
   * Not belt-and-braces on top of dryRun: dryRun stops an accidental *commit*,
   * this stops a deliberate commit aimed at the wrong scope. Retyping the target
   * is the only step that makes "all 24 OpCos" versus "just RHK" something the
   * operator has to state twice.
   */
  @ApiProperty({
    required: false,
    example: 'ALL',
    description:
      "Required when dryRun is false. Must equal opcoCode, or 'ALL' for every OpCo.",
  })
  @IsOptional()
  @IsString()
  confirm?: string;
}

/** One ledger cell that will be (or was) zeroed. */
export class LedgerFullResetRowDto {
  @ApiProperty({ example: 'RHK' }) opcoCode!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;

  @ApiProperty({ description: 'allocatedQuantity before the reset' })
  allocatedBefore!: number;

  @ApiProperty({ description: 'assignedQuantity before the reset' })
  assignedBefore!: number;

  /**
   * Only affects the ALLOCATED half. An inactive SKU's allocation cannot be
   * restored by re-importing (the import reads `active: true` only — CH-016
   * §2.5); the assigned half is unrestorable by import regardless of this flag.
   */
  @ApiProperty({
    description:
      'false = the SKU is inactive, so re-importing cannot even restore its allocation',
  })
  skuActive!: boolean;
}

export class LedgerFullResetResultDto {
  @ApiProperty({ description: 'true = nothing written (preview)' })
  dryRun!: boolean;

  @ApiProperty({
    description: 'ledger cells in scope with a non-zero number to clear',
  })
  affected!: number;

  @ApiProperty({
    example: 'all',
    description: "OpCo code the reset was limited to, or 'all'",
  })
  scope!: string;

  @ApiProperty({ description: 'cells whose allocatedQuantity is non-zero' })
  allocatedCells!: number;

  /**
   * The number that makes this operation different from CH-016. Every one of
   * these cells loses a figure that no import can put back, so it is surfaced
   * on its own rather than left for a caller to count from `rows`.
   */
  @ApiProperty({
    description:
      'cells whose assignedQuantity is non-zero — NONE of these are restorable by re-importing',
  })
  assignedCells!: number;

  /**
   * Subset of `allocatedCells` whose SKU is inactive (CH-016 §2.5). Named for
   * the allocated half specifically, because the assigned half is irreversible
   * for every row and would make an undifferentiated "irreversible" meaningless.
   */
  @ApiProperty({
    description:
      'subset of allocatedCells whose SKU is inactive — re-import cannot restore even their allocation',
  })
  irreversibleAllocated!: number;

  @ApiProperty({ type: [LedgerFullResetRowDto] })
  rows!: LedgerFullResetRowDto[];

  @ApiProperty({
    description:
      'Consequences of committing. Two distinct ones (ADR-0022 D7) — the assign-blocking mid-state, and the assigned baseline having no way back. Surfaced verbatim by the UI.',
  })
  warning!: string;
}
