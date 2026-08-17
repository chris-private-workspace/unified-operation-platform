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
  CreateAgentProfileDto,
  UpdateAgentProfileDto,
} from './dto/agent-profile.dto';

/**
 * W47 F2 / `OQ-A` — the agent registry, **ADMIN only**.
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
