import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequestService } from './request.service';
import { StageService } from './stage.service';
import { IntakeRequestDto } from './dto/intake.dto';
import { AddLineItemDto } from './dto/line-item.dto';
import { AdvanceStageDto } from './dto/advance-stage.dto';
import { RequestDto, RequestLineItemDto } from './dto/request-view.dto';

/**
 * Module D-1 surface — request lifecycle (no assign / ledger / SN write-back).
 * Stage advance rejects ASSIGNED; that flow lands in D-2 (W04).
 */
// TODO(auth): @Roles(ADMIN, REGIONAL) — guard deferred to the AUTH phase (BACKLOG: AUTH).
@ApiTags('fulfilment')
@Controller('fulfilment/requests')
export class FulfilmentController {
  constructor(
    private readonly requests: RequestService,
    private readonly stage: StageService,
  ) {}

  @Post()
  @ApiOkResponse({ type: RequestDto })
  intake(@Body() dto: IntakeRequestDto): Promise<RequestDto> {
    return this.requests.intake(dto);
  }

  @Get()
  @ApiOkResponse({ type: [RequestDto] })
  list(): Promise<RequestDto[]> {
    return this.requests.listRequests();
  }

  @Get(':id')
  @ApiOkResponse({ type: RequestDto })
  detail(@Param('id') id: string): Promise<RequestDto> {
    return this.requests.getRequestDetail(id);
  }

  @Post(':id/line-items')
  @ApiOkResponse({ type: RequestLineItemDto })
  addLineItem(
    @Param('id') id: string,
    @Body() dto: AddLineItemDto,
  ): Promise<RequestLineItemDto> {
    return this.requests.addLineItem(id, dto);
  }

  @Patch(':id/line-items/:lineItemId/stage')
  @ApiOkResponse({ type: RequestLineItemDto })
  advanceStage(
    @Param('lineItemId') lineItemId: string,
    @Body() dto: AdvanceStageDto,
  ): Promise<RequestLineItemDto> {
    return this.stage.advanceStage(lineItemId, dto.toStage);
  }
}
