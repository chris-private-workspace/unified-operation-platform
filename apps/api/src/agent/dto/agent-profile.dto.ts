import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_PROMPT_LENGTH } from '../agent-profile.service';

/**
 * W47 F2 — the agent registry's wire shapes.
 *
 * 🔴 `MAX_PROMPT_LENGTH` is imported from the service rather than repeated, and
 * the service checks it AGAIN on its own. Two enforcement points for one rule
 * looks redundant until you ask which one is load-bearing: the cap is what makes
 * `prompt` configuration rather than content, and that claim is what the audit
 * whitelist entry for `prompt` was argued on (`audit-fields.ts`). A cap that
 * lives only at the HTTP edge stops being true the moment anything else writes.
 */

export class CreateAgentProfileDto {
  @ApiProperty({ description: "Human-facing, e.g. 'ai-assist (gpt-4o)'." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    description: 'The Azure DEPLOYMENT name, not a model family (ADR-0037 E3).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  /**
   * 🔴 `string | null`, and the null half is load-bearing rather than tidy
   * typing: `null` is how a caller says "use the built-in instructions", which
   * is a different statement from omitting the field (leave whatever is there).
   * `@IsOptional()` already skips validation for null, so this only makes the
   * OpenAPI document match what the endpoint has always accepted — the same
   * gap `F2-7` found on the response side, on the request side.
   */
  @ApiPropertyOptional({
    description:
      'System prompt. `null` or omitted uses the default that lives in code. 🔴 Every change is audited (W47 R1).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROMPT_LENGTH)
  prompt?: string | null;

  @ApiPropertyOptional({
    description:
      "Which agent this profile belongs to. Defaults to 'ai-assist'.",
  })
  @IsOptional()
  @IsString()
  principalName?: string;
}

/**
 * ⚠️ Every field optional, and `active` is how a profile is retired — there is
 * no DELETE. Historical runs point at a profile to say what they ran on, and
 * that answer has to survive somebody tidying up the list.
 */
export class UpdateAgentProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model?: string;

  /** 🔴 `null` clears it back to the built-in instructions. See CreateAgentProfileDto. */
  @ApiPropertyOptional({
    description:
      '🔴 Audited with before/after (W47 R1). `null` restores the built-in instructions.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROMPT_LENGTH)
  prompt?: string | null;

  @ApiPropertyOptional({ description: 'false retires the profile.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * W48 `F5-8` — one line of the "which agent am I talking to" picker.
 *
 * 🔴 Three fields, and the absence of `prompt` is the point. This is the shape
 * `PROFILE_OPTION_SELECT` produces, and the pair is pinned by a spec so a later
 * widening of one without the other cannot make the OpenAPI document describe a
 * response the API does not send — the gap BUG-011 fell through.
 */
export class AgentProfileOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ai-assist (gpt-4o)' }) name!: string;
  @ApiProperty({ description: 'Azure deployment name (ADR-0037 E3).' })
  model!: string;
}

/** The owning agent, as `list()` joins it — name only, never the runtime. */
export class AgentProfilePrincipalDto {
  @ApiProperty({ example: 'ai-assist' }) name!: string;
}

export class AgentProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() principalId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() model!: string;
  @ApiPropertyOptional() prompt?: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  /**
   * 🔴 Added because `agent-profile.controller.spec.ts` caught it missing, not
   * because anyone noticed while writing the endpoint.
   *
   * `list()` joins the principal so the screen can say which agent a profile
   * belongs to; `create` and `update` return the row without it. Optional here
   * for that reason — and documented rather than left off, because a response
   * field the contract never mentions is a field the frontend has to discover by
   * reading the server's source. That is BUG-011 mirrored: there the controller
   * dropped a field the read-model had; here it sent one the DTO never admitted
   * to.
   */
  @ApiPropertyOptional({ type: AgentProfilePrincipalDto })
  principal?: AgentProfilePrincipalDto;
}
