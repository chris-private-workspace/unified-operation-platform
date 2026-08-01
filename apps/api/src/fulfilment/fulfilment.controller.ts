import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { RequestService } from './request.service';
import { StageService } from './stage.service';
import { AssignService } from './assign.service';
import { SyncCheckService } from './sync-check.service';
import { IntakeRequestDto } from './dto/intake.dto';
import { AddLineItemDto } from './dto/line-item.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { AdvanceStageDto } from './dto/advance-stage.dto';
import { AssignLineItemDto } from './dto/assign.dto';
import { RequestDto, RequestLineItemDto } from './dto/request-view.dto';
import { SyncCheckResultDto } from './dto/sync-check.dto';

/**
 * Module D-1 surface — request lifecycle (no assign / ledger / SN write-back).
 * Stage advance rejects ASSIGNED; that flow lands in D-2 (W04).
 * Guarded to ADMIN / REGIONAL / OPCO_IT; OPCO_IT is scoped to its own OpCo by the
 * services via @CurrentUser (AUTH-3a) — REGIONAL / ADMIN see everything.
 */
@ApiTags('fulfilment')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
@Controller('fulfilment/requests')
export class FulfilmentController {
  constructor(
    private readonly requests: RequestService,
    private readonly stage: StageService,
    private readonly assign: AssignService,
    private readonly syncCheckService: SyncCheckService,
  ) {}

  @Post()
  @ApiOkResponse({ type: RequestDto })
  intake(
    @Body() dto: IntakeRequestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestDto> {
    return this.requests.intake(dto, user);
  }

  @Get()
  @ApiOkResponse({ type: [RequestDto] })
  list(@CurrentUser() user: AuthUser): Promise<RequestDto[]> {
    return this.requests.listRequests(user);
  }

  @Get(':id')
  @ApiOkResponse({ type: RequestDto })
  detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestDto> {
    return this.requests.getRequestDetail(id, user);
  }

  @Patch(':id')
  @ApiOkResponse({ type: RequestDto })
  updateHeader(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestDto> {
    return this.requests.updateHeader(id, dto, user);
  }

  @Post(':id/line-items')
  @ApiOkResponse({ type: RequestLineItemDto })
  addLineItem(
    @Param('id') id: string,
    @Body() dto: AddLineItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestLineItemDto> {
    return this.requests.addLineItem(id, dto, user);
  }

  @Delete(':id/line-items/:lineItemId')
  removeLineItem(
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.removeLineItem(id, lineItemId, user);
  }

  @Patch(':id/line-items/:lineItemId/stage')
  @ApiOkResponse({ type: RequestLineItemDto })
  advanceStage(
    @Param('lineItemId') lineItemId: string,
    @Body() dto: AdvanceStageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestLineItemDto> {
    return this.stage.advanceStage(lineItemId, dto.toStage, user);
  }

  // ── Module D-2 (assign flow) ──

  @Patch(':id/sync')
  @ApiOkResponse({ type: RequestDto })
  markSynced(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestDto> {
    return this.assign.markSynced(id, user);
  }

  /**
   * CH-015 — ask Graph now, instead of waiting for the ADR-0015 sweep.
   * POST, not PATCH: the request may well be unchanged afterwards (a miss
   * writes nothing) — what is being asked for is the check, not an edit.
   */
  @Post(':id/sync-check')
  // 200, not Nest's default 201: on a miss or a throttle this creates nothing
  // at all, and even on a hit what changed is an existing request, not a new
  // resource. A 201 would have API consumers looking for a Location header.
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SyncCheckResultDto })
  syncCheck(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SyncCheckResultDto> {
    return this.syncCheckService.check(id, user);
  }

  @Patch(':id/line-items/:lineItemId/assign')
  @ApiOkResponse({ type: RequestLineItemDto })
  assignLineItem(
    @Param('lineItemId') lineItemId: string,
    @Body() dto: AssignLineItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RequestLineItemDto> {
    return this.assign.assignLineItem(
      lineItemId,
      dto.usageLocation,
      user,
      dto.budgetOverrideReason,
    );
  }
}
