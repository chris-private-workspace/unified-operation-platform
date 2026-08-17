import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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

  /**
   * W47 F3-1 — which model / prompt combination to run on.
   *
   * ⚠️ Optional on the wire, but omitting it is NOT "use the default": there is
   * no default. It is resolved by `AgentProfileService.resolveForRun`, which
   * uses the single active profile when there is exactly one and refuses with a
   * 400 when the answer is genuinely ambiguous — several active profiles, or
   * none. Omitting it is how the existing AI-Assist card keeps working
   * unchanged while there is only one profile to pick.
   */
  @ApiPropertyOptional({
    description:
      'Profile to run on. Omit while only one is active; a 400 says so if the choice is ambiguous.',
  })
  @IsOptional()
  @IsString()
  profileId?: string;
}

/**
 * Query for GET /agent/runs — W47 F4.
 *
 * 🔴 `limit` is capped in the SERVICE as well as here. A ceiling that lives only
 * at the HTTP edge stops being true the first time anything else calls
 * `listRuns`, and the ceiling is the whole of `R5`'s mitigation.
 */
export class ListAgentRunsDto {
  @ApiPropertyOptional({
    description: 'running | awaiting_approval | completed | failed | aborted …',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Only runs that used this profile.' })
  @IsOptional()
  @IsString()
  profileId?: string;

  @ApiPropertyOptional({
    description: 'ISO date-time. Only runs started at or after it.',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ description: '1–100, default 25.' })
  @IsOptional()
  // Query values arrive as strings; without this the validator sees '25' and
  // `@IsInt` rejects every request that sets it.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'The `nextCursor` from the previous page.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
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

/**
 * The run's profile, as the run detail carries it — W47 F3-4.
 *
 * 🔴 No `prompt`. It can be 8000 characters and it belongs to the registry
 * screen; putting it on every run response would ship the agent's instructions
 * to anyone who can read a run, on every poll.
 */
export class AgentRunProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() model!: string;
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
  @ApiPropertyOptional({
    description:
      'CH-031 / ADR-0040 — set when an admin took this run out of the request card. Not a delete: steps, transcript and proposals are all still here, and this endpoint still returns the run.',
  })
  hiddenAt?: Date | null;
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

  /**
   * W47 F3-4 / `OQ-D` — which profile this run used, `null` before the registry.
   *
   * 🔴 Null is a real, permanent answer, not a gap waiting to be back-filled.
   * Runs started before W47 ran on whatever the environment said at the time,
   * and asserting a profile for them would claim a fact that never existed. The
   * screen shows those as "(before W47)" rather than hiding them: hiding turns
   * "how many runs predate the registry" into an unanswerable question, and that
   * is precisely the number a new list is easiest to be wrong about.
   */
  @ApiPropertyOptional() profileId?: string | null;
  @ApiPropertyOptional({ type: AgentRunProfileDto })
  profile?: AgentRunProfileDto | null;
}

/**
 * One row of GET /agent/runs — W47 F4.
 *
 * 🔴 A SEPARATE class from `AgentRunDto`, not an omission of it. Reusing the
 * detail shape would put `steps`, `messages` and `proposals` in the OpenAPI
 * document for a response that does not carry them — and the temptation to
 * "just include them" is exactly how a list ends up loading every transcript on
 * the platform to render a table.
 */
export class AgentRunSummaryDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() requestId?: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() startedById!: string;
  @ApiProperty() startedAt!: Date;
  @ApiPropertyOptional() endedAt?: Date | null;
  @ApiPropertyOptional() profileId?: string | null;
  @ApiPropertyOptional({ type: AgentRunProfileDto })
  profile?: AgentRunProfileDto | null;
}

export class AgentRunListDto {
  @ApiProperty({ type: [AgentRunSummaryDto] })
  items!: AgentRunSummaryDto[];

  @ApiPropertyOptional({
    description:
      'Pass as `cursor` for the next page. `null` means this is the last one.',
    nullable: true,
  })
  nextCursor!: string | null;
}
