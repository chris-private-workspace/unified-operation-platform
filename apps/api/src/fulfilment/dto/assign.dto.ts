import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/** Body for PATCH .../line-items/:lineItemId/assign — optional usageLocation. */
export class AssignLineItemDto {
  @ApiPropertyOptional({
    description: 'ISO 3166 alpha-2 country, applied if the user has none',
    example: 'HK',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  usageLocation?: string;
}
