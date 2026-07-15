import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { OpcoService, OpcoOption } from './opco.service';

/**
 * Lightweight OpCo lookup for picker selectors (e.g. the outbound 開單 form,
 * Phase 乙). Read-only, active OpCos only. Open to ADMIN / REGIONAL / OPCO_IT —
 * unlike the ADMIN-only /admin/opcos (user-admin console). No scope filter: a
 * picker needs the full list, and code + displayName are not sensitive; write
 * endpoints enforce OpCo scope themselves (AUTH-3a).
 */
@ApiTags('opcos')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
@Controller('opcos')
export class OpcoController {
  constructor(private readonly opcos: OpcoService) {}

  @Get()
  @ApiOkResponse({ description: 'active OpCos for picker selectors' })
  list(): Promise<OpcoOption[]> {
    return this.opcos.listActive();
  }
}
