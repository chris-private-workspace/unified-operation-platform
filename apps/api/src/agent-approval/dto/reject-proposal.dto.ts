import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body for POST /agent/proposals/:id/reject. */
export class RejectProposalDto {
  /**
   * Required, not optional, and with a length floor — the same reasoning as
   * `budgetOverrideReason` in ADR-0016 D3: a rejection with no reason tells a
   * later reader nothing, and it is also the text sent back to the model so it
   * can react rather than re-propose the same list. Both readers need words.
   */
  @ApiProperty({
    description:
      'Why this proposal is being rejected. Stored on the proposal and sent back to the agent.',
    minLength: 5,
    example: 'These are add-ons; the request only asks for the base licence.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
