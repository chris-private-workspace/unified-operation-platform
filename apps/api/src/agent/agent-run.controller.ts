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
import { AiAssistService } from './ai-assist.service';
import { AgentRunDto, StartAgentRunDto } from './dto/agent-run.dto';

/**
 * AI-Assist runs (W46 F8 / ADR-0036).
 *
 * **ADMIN + REGIONAL**, matching the approval endpoint (plan OQ-2). Neither the
 * plan nor the ADR settles who may START a run, so this is the conservative
 * reading and the reason is stated rather than left to be inferred: a run costs
 * a model call and it creates work for whoever has to decide the proposal. The
 * tools themselves are safe at any width — they apply the STARTER's OpCo scope,
 * so an OPCO_IT run could only ever see its own OpCo — so widening this later is
 * a one-line change. Narrowing it after people rely on it is not.
 *
 * 🔴 This controller reaches no domain service. It calls `AiAssistService`,
 * which is inside the same module, and `agent.boundary.spec.ts` keeps that
 * true (ADR-0036 D0).
 */
@ApiTags('agent')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('agent/runs')
export class AgentRunController {
  constructor(private readonly aiAssist: AiAssistService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Start an AI-Assist run on a request. It stops for approval before proposing anything.',
  })
  start(@Body() dto: StartAgentRunDto, @CurrentUser() user: AuthUser) {
    return this.aiAssist.startRun(user, dto.requestId);
  }

  @Get()
  @ApiOperation({
    summary:
      'The most recent run on a request, or null. `requestId` is required.',
  })
  latest(@Query('requestId') requestId: string, @CurrentUser() user: AuthUser) {
    return this.aiAssist.findLatestForRequest(user, requestId);
  }

  @Get(':id')
  @ApiOkResponse({ type: AgentRunDto })
  @ApiOperation({ summary: 'One run: steps, transcript and proposals.' })
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.aiAssist.getRun(user, id);
  }

  @Post(':id/abort')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Stop a run that is still open, and reject any proposal still waiting on it.',
  })
  abort(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.aiAssist.abortRun(user, id);
  }
}
