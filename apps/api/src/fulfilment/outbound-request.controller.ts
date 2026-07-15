import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { OutboundRequestService } from './outbound-request.service';
import { CreateRequestDto } from './dto/create-request.dto';

/**
 * ADR-0008 Phase 乙 — IT-facing outbound request creation. IT opens a standalone
 * license request → platform creates the ServiceNow ticket (provider) + local
 * mirror. User JWT + role + OpCo scope (unlike the m2m /requests/intake).
 * Distinct from /fulfilment/requests (W03, mirror-only — no SN create).
 * D1 boundary: this is an IT operator action, NOT an end-user self-service form.
 */
@ApiTags('requests')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
@Controller('requests')
export class OutboundRequestController {
  constructor(private readonly outbound: OutboundRequestService) {}

  @Post()
  @ApiOperation({
    summary:
      'IT open a standalone license request → create ServiceNow ticket + local mirror',
  })
  @ApiOkResponse({
    description: 'the created request (with SN REQ/RITM linkage)',
  })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.outbound.create(dto, user);
  }
}
