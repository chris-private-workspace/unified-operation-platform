import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** One SKU dictionary entry (skuId GUID is the source-of-truth key). */
export class SkuCatalogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'M365 GUID — source of truth' }) skuId!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, required: false }) businessAlias!:
    string | null;
  @ApiProperty({ nullable: true, required: false }) category!: string | null;
  @ApiProperty() isBaseLicense!: boolean;
  @ApiProperty() active!: boolean;
  @ApiProperty({ nullable: true, required: false }) lastSyncedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

/**
 * PATCH /license/catalog/:id — human curation of a SKU dictionary entry
 * (CH-003). Only the curated columns are editable; skuId / skuPartNumber /
 * displayName / active are system-owned (set by tenant sync) and never touched
 * here. All fields optional — omit to leave unchanged; send "" to clear
 * alias/category to null. businessAlias feeds allocation-import matching
 * (ADR-0004 curation); isBaseLicense is a UI hint, not a hard gate.
 */
export class UpdateSkuCatalogDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'human curation label (mapping / reconciliation); "" clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessAlias?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'asset-list grouping (e.g. Base, Add-on); "" clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @ApiProperty({
    required: false,
    description: 'base bundle (E3/F3) vs add-on — UI default hint, not a gate',
  })
  @IsOptional()
  @IsBoolean()
  isBaseLicense?: boolean;
}

/** Summary of a POST /license/catalog/sync run. */
export class CatalogSyncResultDto {
  @ApiProperty() created!: number;
  @ApiProperty() updated!: number;
  @ApiProperty({ description: 'SKUs soft-deactivated (no longer in tenant)' })
  deactivated!: number;
  @ApiProperty({ description: 'tenant snapshots written' }) snapshots!: number;
}
