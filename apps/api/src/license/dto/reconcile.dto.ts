import { ApiProperty } from '@nestjs/swagger';
import { DriftStatus } from '@prisma/client';

/** Minimal SKU reference embedded in a drift alert. */
export class DriftSkuRefDto {
  @ApiProperty() skuId!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;
  @ApiProperty() displayName!: string;
}

/** A total-level drift alert (sum of ledger assigned vs tenant consumed). */
export class DriftAlertDto {
  @ApiProperty() id!: string;
  @ApiProperty() skuCatalogId!: string;
  @ApiProperty({ description: 'sum(assignedQuantity) across OpCos' })
  ledgerAssignedSum!: number;
  @ApiProperty({ description: 'M365 consumedUnits at detection' })
  tenantConsumed!: number;
  @ApiProperty({ description: 'tenantConsumed - ledgerAssignedSum' })
  delta!: number;
  @ApiProperty({ enum: DriftStatus }) status!: DriftStatus;
  @ApiProperty({ nullable: true, required: false }) note!: string | null;
  @ApiProperty() detectedAt!: Date;
  @ApiProperty({ nullable: true, required: false }) resolvedAt!: Date | null;
  @ApiProperty({ type: DriftSkuRefDto }) sku!: DriftSkuRefDto;
}

/** Summary of a POST /license/reconcile run. */
export class ReconcileResultDto {
  @ApiProperty({
    description: 'active SKUs walked (includes the skipped ones)',
  })
  checked!: number;
  @ApiProperty() opened!: number;
  @ApiProperty() updated!: number;
  @ApiProperty({
    description:
      'alerts closed this run — the delta reached zero, or the SKU is unlimited (CH-029 / ADR-0034 D4)',
  })
  resolved!: number;
  /**
   * CH-029 / ADR-0034 D4. Declared here as well as on the service interface
   * because this DTO is the OpenAPI truth: a field the service returns but the
   * DTO never declares is invisible to every generated client, and BUG-011 is
   * the day that cost a bug fix (a new read-model field that no route ever
   * emitted, with three green test layers around it).
   */
  @ApiProperty({
    description:
      'active SKUs left out because seatModel is unlimited — they have no seat account to reconcile',
  })
  skippedUnlimited!: number;
  @ApiProperty({ description: 'OPEN drift alerts after this run' })
  drift!: number;
}
