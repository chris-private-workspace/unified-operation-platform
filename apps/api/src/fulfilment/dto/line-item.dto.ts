import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/** Body for POST /fulfilment/requests/:id/line-items — author a per-SKU line item. */
export class AddLineItemDto {
  @ApiProperty({ description: 'SkuCatalog id (cuid)' })
  @IsString()
  @MinLength(1)
  skuCatalogId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'triage: true = procurement path, false = short path',
  })
  @IsOptional()
  @IsBoolean()
  procurementRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
