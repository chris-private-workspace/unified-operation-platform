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
 * The four prepaidUnits buckets behind `owned`, plus Microsoft's own verdict on
 * the subscription (ADR-0033 D1/D2).
 *
 * 🔴 Declared here on purpose. BUG-011 showed the gap this closes: a field can
 * exist on the read-model, be returned by the service, and still never reach a
 * caller — while every test layer stays green, because an undeclared field is
 * perfectly legal TypeScript on the way out.
 */
export class TenantSkuOwnedBreakdownDto {
  @ApiProperty({ description: 'prepaidUnits.enabled — assignable now' })
  enabled!: number;
  @ApiProperty({
    description:
      'prepaidUnits.warning — subscription expired but inside the grace period; these seats still assign and ARE counted in owned',
  })
  warning!: number;
  @ApiProperty({
    description:
      'prepaidUnits.suspended — subscription cancelled; NOT counted in owned',
  })
  suspended!: number;
  @ApiProperty({
    description: 'prepaidUnits.lockedOut — locked; NOT counted in owned',
  })
  lockedOut!: number;
  @ApiProperty({
    example: 'Enabled',
    description:
      "Microsoft's capabilityStatus (Enabled | Warning | Suspended | LockedOut | Deleted) — read directly, never inferred from the counts above",
  })
  capabilityStatus!: string;
}

/**
 * One tenant-level per-SKU row (GET /license/tenant-skus). Three layers per
 * DESIGN §5: owned → allocatedToOpcos (Σ OpCo budget) → assignedToUsers
 * (Σ assigned). owned / tenantConsumed come from the latest TenantSkuSnapshot;
 * a SKU allocated but never synced from tenant has owned=null — honest, since
 * unallocated / overAllocated can't be derived without the owned total.
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
      'ASSIGNABLE seats (ADR-0033 D2): prepaidUnits.enabled + prepaidUnits.warning from the latest snapshot; null if never synced. Was enabled-only before CH-027 — see ownedBreakdown for why a number may have jumped',
  })
  owned!: number | null;
  @ApiProperty({
    type: TenantSkuOwnedBreakdownDto,
    nullable: true,
    description:
      'what owned is made of; null when never synced. Mandatory per ADR-0033 D2 — owned is a sum now, and a sum with no breakdown is unexplainable',
  })
  ownedBreakdown!: TenantSkuOwnedBreakdownDto | null;
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
      'derived, not curated (ADR-0032 D2, narrowed by ADR-0033 D5): 0 ASSIGNABLE seats but people using it — i.e. the subscription was cancelled, not merely expired. Read ownedBreakdown.capabilityStatus for the reason; do not infer it from suspended > 0',
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
