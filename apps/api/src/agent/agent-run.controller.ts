import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Observable, defer, switchMap } from 'rxjs';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AiAssistService } from './ai-assist.service';
import { AgentRunQueue, type AgentRunChangeMessage } from './agent-run.queue';
import {
  AgentRunDto,
  AgentRunListDto,
  ListAgentRunsDto,
  StartAgentRunDto,
} from './dto/agent-run.dto';

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
  constructor(
    private readonly aiAssist: AiAssistService,
    private readonly queue: AgentRunQueue,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Queue an AI-Assist run on a request. Returns immediately with status `running`; watch `/events` or refetch for the result.',
  })
  start(@Body() dto: StartAgentRunDto, @CurrentUser() user: AuthUser) {
    return this.aiAssist.startRun(user, dto.requestId, dto.profileId);
  }

  /**
   * W47 F4 — every run, newest first.
   *
   * 🔴 This took `GET /agent/runs`, which used to mean "the latest run on ONE
   * request" (now `/latest`). The alternative was to keep one path and branch on
   * whether `requestId` was supplied — two response shapes behind one URL, which
   * the OpenAPI document cannot describe and a client therefore has to guess at.
   * One caller existed and moved with it.
   */
  @Get()
  @ApiOkResponse({ type: AgentRunListDto })
  @ApiOperation({
    summary:
      'Runs, newest first. Cursor-paged; only runs whose request is in your OpCo scope.',
  })
  list(@Query() query: ListAgentRunsDto, @CurrentUser() user: AuthUser) {
    return this.aiAssist.listRuns(user, {
      status: query.status,
      profileId: query.profileId,
      // Validated as an ISO string by the DTO; parsed once, here, so the service
      // takes a Date and cannot be handed an unparsed one by a future caller.
      since: query.since ? new Date(query.since) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /**
   * ⚠️ Declared BEFORE `:id`. Nest matches in declaration order, so the reverse
   * order would make this reachable only as a run whose id is the word "latest".
   */
  @Get('latest')
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

  /**
   * 期二 G6 / ADR-0039 — server-sent events for one run.
   *
   * 🔴 The payload is `{ runId, type }` and carries no run CONTENT (F10). A
   * client treats it as "refetch now", and `GET /agent/runs/:id` above stays
   * the single source of truth — including its `select`, which is the thing
   * keeping `runState`'s unscrubbed model history off the wire.
   *
   * 🔴 `defer` rather than an `async` handler, and it is load-bearing: it makes
   * the permission check run on every SUBSCRIBE, inside the stream, so a 404 or
   * a scope violation propagates as a stream error instead of being decided
   * once when Nest set the route up. `getRun` applies OpCo scope against the
   * run's request — a run someone may not read is a run they may not watch.
   *
   * 🔴 Authentication rides the existing httpOnly cookie (F8). `EventSource`
   * sends no `Authorization` header, so the Bearer path (ADR-0002, still
   * supported) cannot use this endpoint. No caller needs it today, and adding a
   * second auth route for a read-only notification channel would be a poor
   * trade.
   */
  @Sse(':id/events')
  @ApiOperation({
    summary:
      'Live notifications that this run changed. Payload carries no content — refetch the run.',
  })
  events(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Observable<AgentRunChangeMessage> {
    return defer(() => this.aiAssist.getRun(user, id)).pipe(
      switchMap(() => this.queue.changes(id)),
    );
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

  /**
   * CH-031 / ADR-0040 — hide a finished run, or put it back.
   *
   * 🔴 `POST …/hide`, not `DELETE`, and the verb is doing real work here (D2).
   * Nothing is deleted: the row stays, and so do every step, message and
   * proposal under it. `DELETE` would describe an operation the platform
   * deliberately refused to build, and a verb is the first thing an API says
   * about what it does.
   *
   * 🔴 ADMIN only (D7) — narrower than this controller's class-level
   * ADMIN + REGIONAL, and the first method-level override on it. REGIONAL
   * decides proposals (plan OQ-2), but making a record disappear from other
   * people's screens is a different kind of power, and it belongs at the level
   * of the kill switch and the review stats.
   */
  @Post(':id/hide')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Take a finished run out of the request card. Nothing is deleted — GET /agent/runs/{id} still returns it.',
  })
  hide(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.aiAssist.hideRun(user, id);
  }

  @Post(':id/unhide')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Put a hidden run back on the request card.' })
  unhide(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.aiAssist.unhideRun(user, id);
  }
}
