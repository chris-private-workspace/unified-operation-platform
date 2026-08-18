import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
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
import { AgentConversationService } from './agent-conversation.service';
import {
  AddAgentTurnDto,
  AddAgentTurnResultDto,
  AgentConversationDto,
  CreateAgentConversationDto,
} from './dto/agent-conversation.dto';

/**
 * W48 F3 / ADR-0041 — conversations.
 *
 * 🔴 **ADMIN + REGIONAL**, matching `AgentRunController` exactly (D6). No new
 * predicate: a chat is not more dangerous than a run, because they share one
 * tool registry and one approval gate (D8). What a chat changes is how LIGHT it
 * feels to ask for something — which is a reason to keep the gate, not to
 * narrow who may talk.
 *
 * 🔴 The class-level role is not the whole answer. Every method below also
 * checks OWNERSHIP inside the service: a conversation may have no request, so
 * there is no OpCo to scope by, and the only honest bound left is who started
 * it. See `assertOwner`.
 *
 * 🔴 No `DELETE`. Archiving hides a thread and keeps every row (D7), following
 * `ADR-0040 D2` — a `DELETE` would describe an operation the platform
 * deliberately did not build.
 */
@ApiTags('agent')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('agent/conversations')
export class AgentConversationController {
  constructor(private readonly conversations: AgentConversationService) {}

  @Post()
  @HttpCode(201)
  @ApiOkResponse({ type: AgentConversationDto })
  @ApiOperation({
    summary:
      'Open a conversation. Omit requestId for one with no request context — its runs then get no request-scoped tools at all (ADR-0041 D3).',
  })
  create(
    @Body() dto: CreateAgentConversationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.create(user, dto);
  }

  @Get()
  @ApiOkResponse({ type: [AgentConversationDto] })
  @ApiOperation({
    summary:
      'Your conversations, most recently used first. Archived ones only with includeArchived=true.',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.conversations.list(user, includeArchived === 'true');
  }

  @Get(':id')
  @ApiOkResponse({ type: AgentConversationDto })
  @ApiOperation({
    summary: 'One conversation: its turns and the runs it started.',
  })
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.get(user, id);
  }

  /**
   * ⚠️ 201 with a `runId`, not the agent's answer. The run is queued and
   * executes off the request thread (ADR-0039 F1), exactly as
   * `POST /agent/runs` has since W46 — watch it, or refetch the conversation.
   */
  @Post(':id/turns')
  @HttpCode(201)
  @ApiOkResponse({ type: AddAgentTurnResultDto })
  @ApiOperation({
    summary:
      'Say something. Returns the stored line and the id of the run queued to answer it.',
  })
  addTurn(
    @Param('id') id: string,
    @Body() dto: AddAgentTurnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.addTurn(user, id, dto.content);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: AgentConversationDto })
  @ApiOperation({
    summary:
      'Put a conversation away. Nothing is deleted — its turns and runs all stay.',
  })
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.archive(user, id);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  @ApiOkResponse({ type: AgentConversationDto })
  @ApiOperation({ summary: 'Bring an archived conversation back.' })
  unarchive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.unarchive(user, id);
  }
}
