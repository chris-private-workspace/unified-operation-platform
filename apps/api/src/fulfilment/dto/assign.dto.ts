import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

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

  /**
   * ADR-0016 D3 — ADMIN only. A non-admin supplying this gets 403, never a
   * silent no-op (that would let an OPCO_IT operator believe the override took
   * effect). It is a REASON rather than a boolean flag on purpose: `true` in an
   * audit trail tells a later reader nothing, "RHK urgent hire, budget tops up
   * next week" does. The length floor is friction against reflex overriding.
   */
  @ApiPropertyOptional({
    description:
      'ADMIN only — why the OpCo budget is being exceeded (audited). Non-admins get 403.',
    minLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  budgetOverrideReason?: string;
}
