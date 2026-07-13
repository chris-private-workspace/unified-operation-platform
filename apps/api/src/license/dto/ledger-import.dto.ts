import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Allocation import request (ADR-0004). The CSV is the O365 `List` sheet
 * exported verbatim: row 1 = OpCo headers (=== Opco.code) + "Grand Total",
 * column A = SKU label (=== SkuCatalog.businessAlias), cells = owned seat count.
 * dryRun defaults on — only an explicit `false` writes to the ledger (OD4).
 */
export class LedgerImportRequestDto {
  @ApiProperty({ description: 'O365 List sheet exported as CSV text' })
  @IsString()
  @MinLength(1)
  csv!: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'true (default) = preview only; false = commit to ledger',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

/** One allocatedQuantity change (only cells where target !== current appear). */
export class LedgerImportChangeDto {
  @ApiProperty({ example: 'RHK' }) opcoCode!: string;
  @ApiProperty({ example: 'M365 E3 Unified Existing Customer Sub Per User' })
  skuBusinessAlias!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;
  @ApiProperty({
    description: 'current allocatedQuantity (0 if no ledger row)',
  })
  before!: number;
  @ApiProperty({ description: 'value from the CSV cell' }) target!: number;
  @ApiProperty({ description: 'target - before' }) delta!: number;
}

/** Counts summarising the parse + mapping outcome. */
export class LedgerImportSummaryDto {
  @ApiProperty({ description: 'OpCo header columns matched to Opco.code' })
  opcoColumns!: number;
  @ApiProperty({ description: 'SKU rows parsed from column A' })
  skuRows!: number;
  @ApiProperty({ description: 'SKU rows matched via businessAlias' })
  mappedSkuRows!: number;
  @ApiProperty({ description: 'allocatedQuantity cells that will change' })
  changes!: number;
}

/**
 * Import outcome — a dry-run preview or the result of a commit.
 * `skippedSkuLabels` are the uncurated / out-of-scope rows (curation-as-scope,
 * ADR-0004): D365 / Copilot Studio / Dataverse etc. never enter the ledger.
 */
export class LedgerImportResultDto {
  @ApiProperty({ description: 'true = nothing written (preview)' })
  dryRun!: boolean;
  @ApiProperty({
    description: 'allocatedQuantity cells written (0 if dry-run)',
  })
  committed!: number;
  @ApiProperty({ type: LedgerImportSummaryDto })
  summary!: LedgerImportSummaryDto;
  @ApiProperty({ type: [LedgerImportChangeDto] })
  changes!: LedgerImportChangeDto[];
  @ApiProperty({
    type: [String],
    description:
      'SKU labels with no businessAlias match — skipped (scope gate)',
  })
  skippedSkuLabels!: string[];
  @ApiProperty({
    type: [String],
    description: 'header columns matching no Opco.code (excl. Grand Total)',
  })
  unknownOpcoHeaders!: string[];
}
