import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ServiceNowImportService } from './servicenow-import.service';
import {
  ImportFromServiceNowDto,
  LookupRequestView,
  ServiceNowLookupQueryDto,
} from './dto/servicenow-import.dto';

/**
 * CH-013 / ADR-0021 D1 — the user-authenticated import surface.
 *
 * 🔴 Its own controller, not two more methods on IntakeController. That one is
 * `@Public()` + IntakeKeyGuard for every route it owns, and ADR-0021 D2 keeps
 * it at diff = 0. More to the point: one controller holding two trust models is
 * the shape where someone eventually adds a route under the wrong one.
 *
 * ADMIN only (D3). Not widened to OPCO_IT, because a request's OpCo is derived
 * from ServiceNow and is therefore unknown until after the lookup — an
 * authorisation gate that needs an external round-trip before it can answer is
 * a gate that fails in interesting ways. Widening it means reopening the ADR.
 */
@ApiTags('fulfilment')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('requests')
export class ServiceNowImportController {
  constructor(private readonly imports: ServiceNowImportService) {}

  @Get('servicenow-lookup')
  @ApiOperation({
    summary:
      'REQ number → its RITMs and their active catalog task counts (read-only)',
  })
  @ApiOkResponse({ type: LookupRequestView })
  @ApiNotFoundResponse({
    description:
      'no such request — or one the integration account cannot see (row-level ACL); the Table API cannot tell them apart',
  })
  preview(
    @Query() query: ServiceNowLookupQueryDto,
  ): Promise<LookupRequestView> {
    return this.imports.preview(query.req);
  }

  @Post('import-from-servicenow')
  @ApiOperation({
    summary:
      'import selected RITMs of a real REQ as a platform request (canonical intake, named actor)',
  })
  @ApiOkResponse({ description: 'the created (or already-existing) request' })
  @ApiBadRequestResponse({
    description:
      'a RITM does not belong to the REQ, or has 0 / 2+ active catalog tasks — nothing is written',
  })
  import(@Body() dto: ImportFromServiceNowDto, @CurrentUser() user: AuthUser) {
    return this.imports.import(dto, user);
  }
}
