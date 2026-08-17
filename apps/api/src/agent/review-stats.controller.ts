import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import {
  AgentReviewStatsService,
  DEFAULT_WINDOW_DAYS,
} from './review-stats.service';
import {
  AgentReviewStatsDto,
  ReviewStatsQueryDto,
} from './dto/review-stats.dto';

/**
 * 期二 G7 / plan B7 — R13 monitoring.
 *
 * **ADMIN only**, and for the reason `/admin/audit` is ADMIN-only rather than a
 * general convenience: this describes named individuals' reviewing behaviour.
 * It is management information about colleagues, and ADR-0009 Decision 7 makes
 * that a standing obligation rather than a default someone can widen.
 *
 * 🔴 Reaches no domain service — it reads `AgentProposal` and resolves
 * `AppUser.displayName`, nothing more. `agent.boundary.spec.ts` keeps that true.
 */
@ApiTags('agent')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('agent/review-stats')
export class AgentReviewStatsController {
  constructor(private readonly stats: AgentReviewStatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Approval rate and review speed for agent proposals (R13)',
    description:
      'Rubber-stamping is what makes ADR-0036 D3 a formality, and nothing ' +
      'about the system looks different when it happens. `fastDecisions` is ' +
      'the signal — a proposal decided in seconds was not read. ' +
      '`medianSecondsToDecide` is context only: the clock starts when the ' +
      'proposal was created, so a long median may equally mean nobody was ' +
      'looking.',
  })
  @ApiOkResponse({ type: AgentReviewStatsDto })
  summary(@Query() query: ReviewStatsQueryDto): Promise<AgentReviewStatsDto> {
    return this.stats.summarise(query.days ?? DEFAULT_WINDOW_DAYS);
  }
}
