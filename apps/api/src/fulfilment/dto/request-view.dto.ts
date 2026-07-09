import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemStage, RequestStatus } from '@prisma/client';

/** A per-SKU line item (stage lives here, not on the request). */
export class RequestLineItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty() skuCatalogId!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'triage: true = procurement path' })
  procurementRequired!: boolean;
  @ApiProperty({ enum: LineItemStage }) stage!: LineItemStage;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: Date;
}

/** An onboarding request (aggregate; ServiceNow fields are mirror only). */
export class RequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() targetUpn!: string;
  @ApiPropertyOptional({ nullable: true }) targetDisplayName!: string | null;
  @ApiProperty() opcoId!: string;
  @ApiProperty({ enum: RequestStatus }) status!: RequestStatus;
  @ApiPropertyOptional({ nullable: true }) serviceNowNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) requesterEmail!: string | null;
  @ApiProperty() createdAt!: Date;
}
