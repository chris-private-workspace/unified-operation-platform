import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** One requested license line. */
export class CreateRequestLineDto {
  @ApiProperty({ description: 'SkuCatalog.skuId GUID' })
  @IsString()
  @MinLength(1)
  skuId!: string;

  @ApiProperty({ description: 'seats requested', minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * Body for POST /requests — IT platform opens a standalone (non-onboarding)
 * M365/D365 license request (ADR-0008 D1 / Phase 乙). Creates a ServiceNow
 * ticket via the provider, then a local mirror. IT operator action — NOT an
 * end-user self-service form (D1 boundary).
 */
export class CreateRequestDto {
  @ApiProperty({ description: 'the user the licenses are for (target UPN)' })
  @IsString()
  @MinLength(1)
  targetUpn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDisplayName?: string;

  @ApiProperty({ description: 'OpCo code, e.g. "RHK" (Opco.code)' })
  @IsString()
  @MinLength(1)
  opcoCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @ApiPropertyOptional({
    description: 'free-text remark → sc_request comments',
  })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({
    type: [CreateRequestLineDto],
    description: 'requested SKUs (≥1)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequestLineDto)
  lineItems!: CreateRequestLineDto[];
}
