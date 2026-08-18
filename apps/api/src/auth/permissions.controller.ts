import { Controller, Get } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AgentToolRegistry } from '../agent/tool-registry';
import { Roles } from './roles.decorator';
import { derivePermissions } from './permissions';
import { PermissionEntryDto } from './dto/permissions.dto';

/**
 * W28 — the permission matrix, derived live from the @Roles decorators
 * (ADR-0009 Decision 8.5: no permission table, the decorator stays the single
 * source of truth). Answers the audit question "what can each actor reach?"
 * without anyone maintaining a second list that would drift.
 *
 * W46 G2 — "each actor" now means two kinds. The agent's half is derived from
 * `AgentToolRegistry` for the identical reason the human half is derived from
 * decorators: it is read off the same object the runtime executes, so the
 * document cannot describe a platform that does not exist (ADR-0036 D7).
 *
 * ADMIN-only: it enumerates every route in the app, which is exactly the map
 * you would not hand to a lower-privileged account.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/permissions')
export class PermissionsController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly tools: AgentToolRegistry,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Derived actor × surface matrix (live from @Roles + tool registry)',
    description:
      'NOTE: this answers "which role may CALL which endpoint". It does NOT ' +
      'express row-level scope — OPCO_IT is additionally limited to its own ' +
      'OpCo by opco-scope.ts (AUTH-3a), which this matrix cannot show. The ' +
      'same caveat covers the agent rows: every tool applies the OpCo scope ' +
      'of the person who started the run (ADR-0036 D7), which is row-level ' +
      'and therefore also invisible here.',
  })
  @ApiOkResponse({ type: [PermissionEntryDto] })
  list(): PermissionEntryDto[] {
    const controllers = this.discovery
      .getControllers()
      .map((wrapper) => wrapper.metatype)
      .filter(Boolean);
    /**
     * 🔴 W48 F3-4 — `all()`, deliberately, and this is the one caller where the
     * WIDER list is the correct answer.
     *
     * The matrix describes what the platform has built, not what one run may
     * reach. Handing it a context-filtered list would make the answer depend on
     * whose run happened to be asked about — and W28's drift test compares this
     * matrix against a locked snapshot, so tools would silently drop out of the
     * permission record without a single assertion moving.
     */
    return derivePermissions(controllers, this.tools.all());
  }
}
