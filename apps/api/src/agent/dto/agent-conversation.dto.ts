import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_TURN_LENGTH } from '../agent-conversation.service';

/**
 * W48 F3 / ADR-0041 — the conversation's wire shapes.
 *
 * 🔴 `role` appears on the RESPONSE and never on a request. Who said a line is
 * the platform's fact, not the caller's: a client able to post
 * `role: 'assistant'` could write the agent's side of a transcript, and the
 * transcript is what a person reads before approving something.
 */

export class CreateAgentConversationDto {
  /**
   * 🔴 The security-relevant field of this phase (ADR-0041 D3).
   *
   * Omitted or `null` means the conversation has NO request context, and the
   * consequence is structural rather than cosmetic: request-scoped tools do not
   * exist for its runs (`AgentToolRegistry.list`). Supplying one is checked
   * against the caller's OpCo scope like any other read — the frontend sending
   * a request id is a HINT, never an authorisation (Tier 2 `D-CTX`).
   */
  @ApiPropertyOptional({
    description:
      'Optional request to reason about. Omit for a conversation with no request context — its runs then get no request-scoped tools at all (ADR-0041 D3).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  requestId?: string | null;

  @ApiPropertyOptional({
    description:
      'Which agent profile answers. Omitted uses the single active profile, or 400 if several exist.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profileId?: string;
}

export class AddAgentTurnDto {
  @ApiProperty({
    description: 'What the person says. The agent replies on its own run.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TURN_LENGTH)
  content!: string;
}

export class AgentChatTurnDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['user', 'assistant'] }) role!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
}

/** One run this conversation started — enough to fetch it, never its content. */
export class AgentConversationRunDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() startedAt!: Date;
}

export class AgentConversationDto {
  @ApiProperty() id!: string;
  @ApiProperty() startedById!: string;
  @ApiPropertyOptional({ nullable: true }) requestId?: string | null;
  @ApiPropertyOptional({ nullable: true }) profileId?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Set when archived. The rows stay — nothing is deleted (D7).',
  })
  archivedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  /** Present on `GET /:id` only — a list does not carry transcripts. */
  @ApiPropertyOptional({ type: [AgentChatTurnDto] })
  turns?: AgentChatTurnDto[];

  @ApiPropertyOptional({ type: [AgentConversationRunDto] })
  runs?: AgentConversationRunDto[];
}

/** What `POST /:id/turns` answers with: the line stored, and the run watching it. */
export class AddAgentTurnResultDto {
  @ApiProperty({ type: AgentChatTurnDto }) turn!: AgentChatTurnDto;
  @ApiProperty({
    description:
      'The run queued to answer. Watch it, or refetch the conversation.',
  })
  runId!: string;
}
