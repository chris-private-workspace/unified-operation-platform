import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AgentProfileService } from './agent-profile.service';
import {
  AgentProfileDto,
  AgentProfileOptionDto,
  CreateAgentProfileDto,
  UpdateAgentProfileDto,
} from './dto/agent-profile.dto';

/**
 * W47 F2 / `OQ-A` — the agent registry. **Managing profiles is ADMIN only.**
 *
 * 🔴 Narrower than `AgentRunController` (ADMIN + REGIONAL), and deliberately so.
 * Starting a run costs a model call; editing a profile changes what EVERY future
 * run does, including runs other people start. `OQ-A` settled it at ADMIN
 * because widening a permission later is a one-line change and narrowing one
 * after people rely on it is not — the same reasoning `AgentRunController`
 * records for its own choice.
 *
 * 🔴 No DELETE. A profile is retired with `active: false`, because historical
 * runs point at it to say what they ran on.
 *
 * 🔴 W48 `F5-8` — ONE route here is wider (`GET options`, ADMIN + REGIONAL), and
 * the split is deliberate. `OQ-A`'s argument is about CHANGING what every future
 * run does; being unable to see which agents exist is a different thing, and it
 * had a real cost: with two active profiles and no default (by design), every
 * REGIONAL conversation refused at its first turn with no way to answer the
 * refusal. Reading three columns is not managing a registry.
 */
@ApiTags('agent')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('agent/profiles')
export class AgentProfileController {
  constructor(private readonly profiles: AgentProfileService) {}

  @Get()
  @ApiOkResponse({ type: [AgentProfileDto] })
  @ApiOperation({
    summary:
      'Every agent profile. Retired ones only with includeInactive=true.',
  })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.profiles.list(includeInactive === 'true');
  }

  /**
   * W48 `F5-8` — the profiles a person can start a conversation on.
   *
   * 🔴 `@Roles` here OVERRIDES the class (`RolesGuard` reads
   * `getAllAndOverride([handler, class])`), so this is ADMIN + REGIONAL while
   * everything else on this controller stays ADMIN. Matches
   * `AgentConversationController` exactly — the people who may talk are the
   * people who need to know who they are talking to.
   *
   * ⚠️ Route order: this must stay ABOVE any future `@Get(':id')`, or the param
   * route swallows `/options`.
   */
  @Get('options')
  @Roles(Role.ADMIN, Role.REGIONAL)
  @ApiOkResponse({ type: [AgentProfileOptionDto] })
  @ApiOperation({
    summary:
      'Active profiles, with just enough to pick one. Carries no prompt (G5).',
  })
  options() {
    return this.profiles.listOptions();
  }

  @Post()
  @ApiOkResponse({ type: AgentProfileDto })
  @ApiOperation({ summary: 'Add a model / prompt combination.' })
  create(@Body() dto: CreateAgentProfileDto, @CurrentUser() user: AuthUser) {
    return this.profiles.create(dto, user);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AgentProfileDto })
  @ApiOperation({
    summary:
      'Edit a profile, or retire it with active=false. Every change is audited.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.profiles.update(id, dto, user);
  }
}
