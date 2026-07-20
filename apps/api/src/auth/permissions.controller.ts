import { Controller, Get } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from './roles.decorator';
import { derivePermissions } from './permissions';
import { PermissionEntryDto } from './dto/permissions.dto';

/**
 * W28 — the permission matrix, derived live from the @Roles decorators
 * (ADR-0009 Decision 8.5: no permission table, the decorator stays the single
 * source of truth). Answers the audit question "what can each role reach?"
 * without anyone maintaining a second list that would drift.
 *
 * ADMIN-only: it enumerates every route in the app, which is exactly the map
 * you would not hand to a lower-privileged account.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/permissions')
export class PermissionsController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  @ApiOperation({
    summary: 'Derived role × endpoint matrix (live from @Roles metadata)',
    description:
      'NOTE: this answers "which role may CALL which endpoint". It does NOT ' +
      'express row-level scope — OPCO_IT is additionally limited to its own ' +
      'OpCo by opco-scope.ts (AUTH-3a), which this matrix cannot show.',
  })
  @ApiOkResponse({ type: [PermissionEntryDto] })
  list(): PermissionEntryDto[] {
    const controllers = this.discovery
      .getControllers()
      .map((wrapper) => wrapper.metatype)
      .filter(Boolean);
    return derivePermissions(controllers);
  }
}
