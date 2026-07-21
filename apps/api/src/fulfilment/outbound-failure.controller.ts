import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { OutboundFailureService } from './outbound-failure.service';
import { OutboundRetryService } from './outbound-retry.service';
import {
  OUTBOUND_FAILURE_PAGE_MAX,
  OutboundFailurePageDto,
  OutboundFailureQueryDto,
} from './dto/outbound-failure-query.dto';
import type {
  OutboundFailureKind,
  OutboundFailureStatus,
} from './outbound-failure-fields';

/**
 * Outbound failure queue (W31 F3 / ADR-0011).
 *
 * ADMIN + REGIONAL (Decision 4): an outbound failure is an OPERATIONS problem,
 * not an audit one, and REGIONAL is the operator who actually chases it. This
 * is deliberately wider than /admin/audit — that table carries account and
 * permission history and stays ADMIN-only (ADR-0009 Decision 7). The PII here
 * (targetUpn) is already visible to REGIONAL on the request itself.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('admin/outbound-failures')
export class OutboundFailureController {
  constructor(
    private readonly failures: OutboundFailureService,
    private readonly retryService: OutboundRetryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Outbound deliveries that failed, newest first' })
  @ApiOkResponse({ type: OutboundFailurePageDto })
  async list(@Query() query: OutboundFailureQueryDto) {
    // Re-clamp as defence in depth: the DTO already rejects limit > max, but an
    // internal caller bypassing the pipe must not widen the window.
    const limit = Math.min(query.limit ?? 50, OUTBOUND_FAILURE_PAGE_MAX);
    return this.failures.list({
      status: query.status as OutboundFailureStatus | undefined,
      kind: query.kind as OutboundFailureKind | undefined,
      limit,
      offset: query.offset ?? 0,
    });
  }

  /**
   * Repair it. The action taken depends on `kind` — this is NOT a generic
   * "send it again" (Decision 2): a request.mirror repair writes local rows
   * only and must never reach ServiceNow (Decision 3).
   */
  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Repair a failed outbound delivery (action depends on its kind)',
  })
  retry(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.retryService.retry(id, user);
  }

  @Post(':id/abandon')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record that no repair will be attempted' })
  abandon(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.retryService.abandon(id, user);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Undo an abandon — put it back in the queue' })
  reopen(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.retryService.reopen(id, user);
  }
}
