import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ActivityService } from './activity.service';
import {
  ACTIVITY_FEED_DEFAULT,
  ACTIVITY_FEED_MAX,
  ActivityEventDto,
  ActivityQueryDto,
} from './dto/activity-query.dto';

/**
 * Operational activity feed (CH-006).
 *
 * Its own controller rather than a route on FulfilmentController: that one owns
 * `@Get(':id')`, so a sibling `@Get('activity')` would depend on declaration
 * order to avoid being swallowed by the param route. Follows the same split as
 * OutboundFailureController (W31).
 *
 * Open to all three roles — unlike /admin/audit, which stays ADMIN-only because
 * its rows carry account and permission history (ADR-0009 Decision 7). This is
 * how non-admins get a feed: a separate, opco-scoped surface, NOT a widening of
 * that guard. OPCO_IT sees only its own OpCo's events.
 */
@ApiTags('fulfilment')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
@Controller('fulfilment/activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({
    summary: 'Recent request activity, newest first (opco-scoped)',
  })
  @ApiOkResponse({ type: [ActivityEventDto] })
  list(
    @Query() query: ActivityQueryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ActivityEventDto[]> {
    // Re-clamp as defence in depth: the DTO already rejects limit > max, but an
    // internal caller bypassing the pipe must not widen the window (W31 pattern).
    const limit = Math.min(
      query.limit ?? ACTIVITY_FEED_DEFAULT,
      ACTIVITY_FEED_MAX,
    );
    return this.activity.recent(actor, limit);
  }
}
