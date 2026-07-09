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
  @ApiProperty({ description: 'active SKUs checked' }) checked!: number;
  @ApiProperty() opened!: number;
  @ApiProperty() updated!: number;
  @ApiProperty() resolved!: number;
  @ApiProperty({ description: 'OPEN drift alerts after this run' })
  drift!: number;
}
