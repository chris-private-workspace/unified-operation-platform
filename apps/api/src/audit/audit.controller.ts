import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';
import { AuditPageDto, AuditQueryDto } from './dto/audit-query.dto';

/**
 * Audit trail read surface (W29 F3). ADMIN-only and NOT to be widened: the
 * table stores P-B whitelisted PII (email / displayName in before/after), and
 * ADR-0009 Decision 7 makes ADMIN-only read access a standing obligation of
 * that choice — loosening this guard requires reopening the ADR.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit')
  @ApiOkResponse({ type: AuditPageDto })
  list(@Query() query: AuditQueryDto): Promise<AuditPageDto> {
    return this.audit.find(query);
  }
}
