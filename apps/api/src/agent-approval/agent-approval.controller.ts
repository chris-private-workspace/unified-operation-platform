import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AgentApprovalService } from './agent-approval.service';
import { RejectProposalDto } from './dto/reject-proposal.dto';

/**
 * Human decisions on agent proposals (W46 F6 / ADR-0036 D3).
 *
 * ADMIN + REGIONAL (plan OQ-2), following ADR-0011 D4's precedent for the
 * outbound failure queue: this is an OPERATIONS decision on a request, and
 * REGIONAL is already the operator who owns those requests. Narrowing it to
 * ADMIN would mean the person who understands the request cannot act on it.
 *
 * 🔴 Approving does NOT bypass anything. The line items are created through
 * `RequestService.addLineItem`, with every check it already carries, and a
 * `propose_assign` approval in 期二 will run all 8 assign gates — so an approved
 * proposal can still be refused. That is correct and it is counter-intuitive,
 * which is why F8 has to say it on the screen: what a person approves is
 * whether this SHOULD happen, never whether it may skip the checks.
 */
@ApiTags('agent')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('agent/proposals')
export class AgentApprovalController {
  constructor(private readonly approvals: AgentApprovalService) {}

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Approve an agent proposal — the platform does the work, then the run continues',
  })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.approvals.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject an agent proposal — nothing is created, the run continues',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectProposalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.reject(id, dto.reason, user);
  }
}
