import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * W46 F8 — what the agent screens read.
 *
 * 🔴 `AgentRun.runState` is ABSENT from every shape here, and that is a rule
 * rather than an omission: it is the SDK's serialised state and it carries the
 * model's message history verbatim, unscrubbed. The redacted copy is
 * `AgentMessage` (D6). Anything that adds `runState` to a response has undone
 * that, silently.
 */

/** Body for POST /agent/runs. */
export class StartAgentRunDto {
  @ApiProperty({ description: 'The request the agent should read.' })
  @IsString()
  requestId!: string;
}

export class AgentStepDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: "Tool name, or 'start' / 'proposal' / 'abort'." })
  key!: string;
  @ApiProperty({
    description:
      "ok | failed | skipped. `skipped` is NOT a flavour of ok (ADR-0029's rule, reused).",
  })
  status!: string;
  @ApiPropertyOptional({ description: 'Already scrubbed of PII.' })
  detail?: string | null;
  @ApiPropertyOptional() retryable?: boolean | null;
  @ApiPropertyOptional() whoFixes?: string | null;
  @ApiProperty() createdAt!: Date;
}

export class AgentMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'user | assistant | thinking | tool_call | tool_result | unknown',
  })
  role!: string;
  @ApiProperty({
    description:
      '⚠️ What the AGENT said. Scrubbed, permanently retained, and NOT audit truth — the steps are (ADR-0036 D4).',
  })
  content!: string;
  @ApiProperty() createdAt!: Date;
}

export class AgentProposalDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: "'line_items'" }) kind!: string;
  @ApiProperty({
    description: 'pending | approved | rejected | executed | failed',
  })
  status!: string;
  @ApiProperty({
    description:
      "⚠️ The model's own arguments, unvalidated. Re-checked when the proposal is carried out.",
  })
  payload!: unknown;
  @ApiPropertyOptional() approvedById?: string | null;
  @ApiPropertyOptional() rejectedReason?: string | null;
  @ApiPropertyOptional() decidedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class AgentRunDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() requestId?: string | null;
  @ApiProperty({
    description:
      'running | awaiting_approval | approved | rejected | completed | failed | aborted',
  })
  status!: string;
  @ApiProperty({ description: 'AppUser id whose OpCo scope the run applies.' })
  startedById!: string;
  @ApiProperty() startedAt!: Date;
  @ApiPropertyOptional() endedAt?: Date | null;
  @ApiProperty({
    type: [AgentStepDto],
    description: '🟢 Written by the PLATFORM. This is the audit truth.',
  })
  steps!: AgentStepDto[];
  @ApiProperty({
    type: [AgentMessageDto],
    description: '⚠️ Written by the AGENT. A narrative, not evidence.',
  })
  messages!: AgentMessageDto[];
  @ApiProperty({ type: [AgentProposalDto] })
  proposals!: AgentProposalDto[];
}
