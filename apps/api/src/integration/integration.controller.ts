import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { IntegrationStatusService } from './integration-status.service';
import { IntegrationProbeService } from './integration-probe.service';
import { CONNECTOR_KEYS, PROBEABLE, type ConnectorKey } from './connectors';
import {
  ConnectorStatusDto,
  ProbeResultDto,
} from './dto/integration-status.dto';

/**
 * Integration status + Test connection (W30 / ADR-0010 item 4). ADMIN-only:
 * it describes how the platform is wired to its vendors, which is operator
 * information, and the probe reaches out to real systems.
 *
 * The response carries NO config value (D2) — see the DTO for the allow-list.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/integrations')
export class IntegrationController {
  constructor(
    private readonly status: IntegrationStatusService,
    private readonly probes: IntegrationProbeService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [ConnectorStatusDto] })
  async list(): Promise<ConnectorStatusDto[]> {
    const rows = await this.status.list();
    // Built field by field on purpose — never a spread (D2).
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      state: row.state,
      lastSuccessAt: row.lastSuccessAt,
      lastSuccessNote: row.lastSuccessNote,
      lastProbe: this.probes.get(row.key),
      probeable: PROBEABLE[row.key] === null,
      probeNote: PROBEABLE[row.key],
    }));
  }

  /**
   * Run one read-only probe. User-triggered only — there is no scheduled
   * variant, so the platform never generates background vendor traffic
   * (ADR-0010 D5 obligation), and a per-connector cooldown stops repeat clicks
   * from turning into a burst.
   */
  @Post(':key/test')
  @HttpCode(HttpStatus.OK) // a probe creates nothing — 201 would be a lie
  @ApiOkResponse({ type: ProbeResultDto })
  async test(@Param('key') key: string): Promise<ProbeResultDto> {
    if (!CONNECTOR_KEYS.includes(key as ConnectorKey)) {
      throw new BadRequestException(`Unknown connector: ${key}`);
    }
    const connector = key as ConnectorKey;

    const cooldown = this.probes.cooldownRemainingMs(connector, Date.now());
    if (cooldown > 0) {
      throw new HttpException(
        `Too many attempts — retry in ${Math.ceil(cooldown / 1000)}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.probes.run(connector, Date.now());
  }
}
