import { ApiProperty } from '@nestjs/swagger';

/** SKU reference embedded in a tenant-SKU row. */
export class TenantSkuRefDto {
  @ApiProperty() skuId!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, required: false }) category!: string | null;
}

/**
 * One tenant-level per-SKU row (GET /license/tenant-skus). Three layers per
 * DESIGN §5: owned (M365 prepaidUnits.enabled) → allocatedToOpcos (Σ OpCo
 * budget) → assignedToUsers (Σ assigned). owned / tenantConsumed come from the
 * latest TenantSkuSnapshot; a SKU allocated but never synced from tenant has
 * owned=null — honest, since unallocated / overAllocated can't be derived
 * without the owned total.
 */
export class TenantSkuRowDto {
  @ApiProperty() skuCatalogId!: string;
  @ApiProperty({ type: TenantSkuRefDto }) sku!: TenantSkuRefDto;
  @ApiProperty({
    nullable: true,
    description:
      'M365 prepaidUnits.enabled (latest snapshot); null if never synced',
  })
  owned!: number | null;
  @ApiProperty({
    nullable: true,
    description: 'M365 consumedUnits (latest snapshot); null if never synced',
  })
  tenantConsumed!: number | null;
  @ApiProperty({ description: 'Σ OpCo allocatedQuantity for this SKU' })
  allocatedToOpcos!: number;
  @ApiProperty({ description: 'Σ OpCo assignedQuantity for this SKU' })
  assignedToUsers!: number;
  @ApiProperty({
    nullable: true,
    description: 'owned - allocatedToOpcos; null if owned unknown',
  })
  unallocated!: number | null;
  @ApiProperty({
    description: 'allocatedToOpcos > owned (over-committed to OpCos)',
  })
  overAllocated!: boolean;
}

/** Tenant aggregate for the Platform recon tiles (GET /license/tenant-skus/stats). */
export class TenantSkuStatsDto {
  @ApiProperty() totalOwned!: number;
  @ApiProperty() totalAllocated!: number;
  @ApiProperty() totalAssigned!: number;
  @ApiProperty({ description: 'totalOwned - totalAllocated (can be negative)' })
  totalUnallocated!: number;
  @ApiProperty({ description: 'rows where allocatedToOpcos > owned' })
  skusOverAllocated!: number;
}
