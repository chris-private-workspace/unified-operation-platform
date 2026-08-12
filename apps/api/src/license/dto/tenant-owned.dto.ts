import { ApiProperty } from '@nestjs/swagger';
import { SEAT_MODELS } from '../seat-model';

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
    enum: SEAT_MODELS,
    description:
      "curated (ADR-0032 D1): 'unlimited' means owned is a Graph sentinel, not a purchased seat count",
  })
  seatModel!: string;
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
    description:
      'owned - allocatedToOpcos; null if owned unknown OR seatModel is unlimited (no denominator to subtract from)',
  })
  unallocated!: number | null;
  @ApiProperty({
    description:
      'allocatedToOpcos > owned (over-committed to OpCos); always false for unlimited',
  })
  overAllocated!: boolean;
  @ApiProperty({
    description:
      'derived, not curated (ADR-0032 D2): a prepaid SKU with 0 owned but people using it — the tenant seat gate refuses these, and "no seats left" is the wrong reason',
  })
  noPrepaidSeats!: boolean;
}

/** Tenant aggregate for the Platform recon tiles (GET /license/tenant-skus/stats). */
export class TenantSkuStatsDto {
  @ApiProperty({
    description:
      'Σ owned across PREPAID SKUs only (ADR-0032 D3) — sentinels would otherwise dominate it',
  })
  totalOwned!: number;
  @ApiProperty({
    description: 'Σ allocatedQuantity across ALL SKUs (real on unlimited too)',
  })
  totalAllocated!: number;
  @ApiProperty({
    description: 'Σ assignedQuantity across ALL SKUs (real on unlimited too)',
  })
  totalAssigned!: number;
  @ApiProperty({
    description:
      'totalOwned - Σ allocated across PREPAID SKUs (can be negative); the prepaid-only scope matches totalOwned, NOT totalAllocated',
  })
  totalUnallocated!: number;
  @ApiProperty({ description: 'rows where allocatedToOpcos > owned' })
  skusOverAllocated!: number;
  @ApiProperty({
    description:
      'how many rows are excluded from totalOwned / totalUnallocated — without it the prepaid-only scope is a silent one',
  })
  unlimitedSkus!: number;
}
