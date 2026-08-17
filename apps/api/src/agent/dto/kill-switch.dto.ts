import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** 期二 G3 — flip the AI-Assist kill switch. */
export class SetAgentKillSwitchDto {
  @ApiProperty({
    description:
      'true = the agent may run; false = nothing agent-originated runs, ' +
      'including approvals of proposals that already exist.',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description:
      'Why. Stored on the audit row — the one field that makes the entry ' +
      'answer "what was going on" six months later.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * 🔴 The response reports TWO facts, and the second is the point (plan B5).
 *
 * `enabled` is the switch. `settled` is whether anything agent-originated is
 * still in the system. An operator who flips the switch during an incident will
 * read the first as the second unless the platform is explicit — and a run
 * parked at `awaiting_approval` becomes live again the moment the switch does.
 */
export class AgentKillSwitchStatusDto {
  @ApiProperty({ example: 'ai-assist' })
  principal!: string;

  @ApiProperty({
    description:
      'The switch itself (AgentPrincipal.active). true when no principal row ' +
      'exists yet — "never used" is not "switched off".',
  })
  enabled!: boolean;

  @ApiProperty({
    description:
      'Runs that have not finished (running / awaiting_approval / approved).',
  })
  liveRuns!: number;

  @ApiProperty({ description: 'Proposals still waiting for a decision.' })
  pendingProposals!: number;

  @ApiProperty({
    description:
      'Switched off AND nothing left in flight. NOT the same as !enabled: ' +
      'switching off leaves parked runs and pending proposals in place, inert ' +
      'until somebody switches it back on.',
  })
  settled!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'When the principal was first created; null until first use.',
  })
  updatedAt!: Date | null;
}
