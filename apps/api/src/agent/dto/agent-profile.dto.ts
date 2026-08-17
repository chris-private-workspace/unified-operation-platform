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
    description:
      'The Azure DEPLOYMENT name, not a model family (ADR-0037 E3).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  @ApiPropertyOptional({
    description:
      'System prompt. Omit to use the default that lives in code. 🔴 Every change is audited (W47 R1).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROMPT_LENGTH)
  prompt?: string;

  @ApiPropertyOptional({
    description: "Which agent this profile belongs to. Defaults to 'ai-assist'.",
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

  @ApiPropertyOptional({ description: '🔴 Audited with before/after (W47 R1).' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROMPT_LENGTH)
  prompt?: string;

  @ApiPropertyOptional({ description: 'false retires the profile.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
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
