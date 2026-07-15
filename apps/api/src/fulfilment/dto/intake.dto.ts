import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Body for POST /fulfilment/requests — create a request from a ticket / manual. */
export class IntakeRequestDto {
  @ApiProperty({ description: 'onboarding target UPN' })
  @IsString()
  @MinLength(1)
  targetUpn!: string;

  @ApiProperty({ description: 'OpCo id (cuid)' })
  @IsString()
  @MinLength(1)
  opcoId!: string;

  @ApiPropertyOptional({
    description:
      'ServiceNow reference number (REQ/RITM) — pulls mirror fields when present',
  })
  @IsOptional()
  @IsString()
  serviceNowNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDisplayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @ApiPropertyOptional({
    description:
      'free-text remark; NOT auto-parsed into line items (DESIGN §6)',
  })
  @IsOptional()
  @IsString()
  rawRequestText?: string;
}
