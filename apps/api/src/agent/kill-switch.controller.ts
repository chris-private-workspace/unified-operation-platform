import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AgentKillSwitchService } from './kill-switch.service';
import {
  AgentKillSwitchStatusDto,
  SetAgentKillSwitchDto,
} from './dto/kill-switch.dto';

/**
 * 期二 G3 / plan B5 — the kill switch.
 *
 * **ADMIN only**, and narrower than the run and approval surfaces (which are
 * ADMIN + REGIONAL) on purpose: those decide what happens to one request, this
 * decides whether the capability exists at all. The same reasoning
 * `ServiceNowImportController` gives for being the narrowest of the
 * request-creating surfaces — widening later is a line, narrowing after people
 * rely on it is not.
 *
 * ⚠️ A REGIONAL operator who meets the refusal does not need this endpoint to
 * understand it: `assertEnabled`'s message says the agent is switched off and
 * that an admin turns it back on.
 *
 * 🔴 Reaches no domain service. It touches the `Agent*` tables and the audit
 * trail, and `agent.boundary.spec.ts` keeps that true (ADR-0036 D0).
 */
@ApiTags('agent')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('agent/kill-switch')
export class AgentKillSwitchController {
  constructor(private readonly killSwitch: AgentKillSwitchService) {}

  @Get()
  @ApiOperation({
    summary:
      'Is the AI-Assist agent switched on, and is anything still in flight?',
    description:
      'Two separate facts. `enabled` is the switch; `settled` is whether ' +
      'anything agent-originated remains. Switching off does not remove runs ' +
      'already parked for approval — they become inert, and live again when ' +
      'the switch does.',
  })
  @ApiOkResponse({ type: AgentKillSwitchStatusDto })
  status(): Promise<AgentKillSwitchStatusDto> {
    return this.killSwitch.status();
  }

  @Patch()
  @ApiOperation({
    summary: 'Switch the AI-Assist agent off, or back on',
    description:
      'Off refuses new runs, resumes AND approvals of existing proposals. It ' +
      'does NOT refuse rejections: stopping the agent must not stop people ' +
      'clearing up after it. Audited as agent.kill_switch_set.',
  })
  @ApiOkResponse({ type: AgentKillSwitchStatusDto })
  set(
    @Body() dto: SetAgentKillSwitchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AgentKillSwitchStatusDto> {
    return this.killSwitch.set(dto.enabled, user, dto.reason);
  }
}
