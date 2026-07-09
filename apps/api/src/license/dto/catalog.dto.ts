import { ApiProperty } from '@nestjs/swagger';

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

/** Summary of a POST /license/catalog/sync run. */
export class CatalogSyncResultDto {
  @ApiProperty() created!: number;
  @ApiProperty() updated!: number;
  @ApiProperty({ description: 'SKUs soft-deactivated (no longer in tenant)' })
  deactivated!: number;
  @ApiProperty({ description: 'tenant snapshots written' }) snapshots!: number;
}
