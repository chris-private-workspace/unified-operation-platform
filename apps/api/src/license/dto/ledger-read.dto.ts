import { ApiProperty } from '@nestjs/swagger';

/** OpCo reference embedded in a ledger row. */
export class LedgerOpcoRefDto {
  @ApiProperty({ example: 'RHK' }) code!: string;
  @ApiProperty() displayName!: string;
}

/** SKU reference embedded in a ledger row. */
export class LedgerSkuRefDto {
  @ApiProperty() skuId!: string;
  @ApiProperty({ example: 'SPE_E3' }) skuPartNumber!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, required: false }) category!: string | null;
}

/**
 * One per-OpCo per-SKU ledger row (GET /license/ledger). Two-layer numbers per
 * DESIGN §5: allocatedQuantity = owned/budget, assignedQuantity = baseline
 * assigned. headroom / overAllocated are derived; utilization % is left to the
 * display layer (allocated can be 0 → the backend avoids the divide).
 */
export class LedgerRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() opcoId!: string;
  @ApiProperty() skuCatalogId!: string;
  @ApiProperty({ description: 'owned / budget (OpCo-managed, from import)' })
  allocatedQuantity!: number;
  @ApiProperty({ description: 'baseline assigned (+1 on assign)' })
  assignedQuantity!: number;
  @ApiProperty({ description: 'allocatedQuantity - assignedQuantity' })
  headroom!: number;
  @ApiProperty({ description: 'assignedQuantity > allocatedQuantity' })
  overAllocated!: boolean;
  @ApiProperty({ type: LedgerOpcoRefDto }) opco!: LedgerOpcoRefDto;
  @ApiProperty({ type: LedgerSkuRefDto }) sku!: LedgerSkuRefDto;
}

/** Scoped aggregate for the Overview seat KPIs (GET /license/ledger/stats). */
export class LedgerStatsDto {
  @ApiProperty() totalAllocated!: number;
  @ApiProperty() totalAssigned!: number;
  @ApiProperty({ description: 'totalAllocated - totalAssigned' })
  totalHeadroom!: number;
  @ApiProperty({ description: 'distinct SKUs with a ledger row' })
  skusTracked!: number;
  @ApiProperty({ description: 'distinct OpCos with a ledger row' })
  opcosTracked!: number;
  @ApiProperty({ description: 'rows where assigned > allocated' })
  overAllocatedCount!: number;
}
