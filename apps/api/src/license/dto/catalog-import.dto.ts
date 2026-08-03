import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * POST /license/catalog/import — bulk curation of the SKU dictionary
 * (CH-019 / ADR-0023). Body is the CH-018 export, edited: SKUs are matched on
 * `SkuId` (GUID) and only the three curated columns are writable.
 */
export class CatalogImportRequestDto {
  @ApiProperty({
    description:
      'CSV text — the SKU Catalog export with alias / category / base edited',
  })
  @IsString()
  @IsNotEmpty()
  csv!: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'preview only; send false to write (ADR-0023 D4)',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    required: false,
    description:
      'required to commit when the file clears any business alias — clearing removes the SKU from import scope while its ledger allocation stays frozen at the old value (ADR-0023 D6)',
  })
  @IsOptional()
  @IsBoolean()
  confirmClears?: boolean;
}

export class CatalogTextChangeDto {
  @ApiProperty({ nullable: true }) before!: string | null;
  @ApiProperty({ nullable: true }) after!: string | null;
}

export class CatalogFlagChangeDto {
  @ApiProperty() before!: boolean;
  @ApiProperty() after!: boolean;
}

/** One SKU with at least one changed field. Unchanged fields are omitted. */
export class CatalogImportChangeDto {
  @ApiProperty() skuId!: string;
  @ApiProperty() skuPartNumber!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: CatalogTextChangeDto, required: false })
  alias?: CatalogTextChangeDto;
  @ApiProperty({ type: CatalogTextChangeDto, required: false })
  category?: CatalogTextChangeDto;
  @ApiProperty({ type: CatalogFlagChangeDto, required: false })
  isBaseLicense?: CatalogFlagChangeDto;
  @ApiProperty({
    description:
      'alias goes from a value to none — the one change whose consequence is invisible in this screen',
  })
  clearsAlias!: boolean;
}

export class CatalogImportSummaryDto {
  @ApiProperty({ description: 'non-blank data rows in the file' })
  rows!: number;
  @ApiProperty({ description: 'rows resolved to an active catalog entry' })
  matched!: number;
  @ApiProperty({ description: 'SKUs with at least one changed field' })
  changes!: number;
  @ApiProperty({ description: 'of those, how many clear a business alias' })
  aliasClears!: number;
}

export class CatalogImportResultDto {
  @ApiProperty() dryRun!: boolean;
  @ApiProperty({ description: 'SKUs actually written (0 on a dry run)' })
  committed!: number;
  @ApiProperty({ type: CatalogImportSummaryDto })
  summary!: CatalogImportSummaryDto;
  @ApiProperty({ type: [CatalogImportChangeDto] })
  changes!: CatalogImportChangeDto[];
  @ApiProperty({
    type: [String],
    description: 'SkuIds in the file matching no active catalog entry',
  })
  skippedSkuIds!: string[];
  @ApiProperty({
    type: [String],
    description: 'headers accepted but never written (system-owned columns)',
  })
  unknownColumns!: string[];
}
