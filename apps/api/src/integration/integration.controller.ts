import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { IntegrationStatusService } from './integration-status.service';
import { IntegrationProbeService } from './integration-probe.service';
import { ConnectorConfigService } from './connector-config.service';
import { CONNECTOR_KEYS, PROBEABLE, type ConnectorKey } from './connectors';
import {
  ConnectorConfigDto,
  ConnectorStatusDto,
  ProbeResultDto,
  UpdateConnectorConfigDto,
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
    private readonly connectorConfig: ConnectorConfigService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [ConnectorStatusDto] })
  async list(): Promise<ConnectorStatusDto[]> {
    const rows = await this.status.list();
    // Built field by field on purpose — never a spread (D2).
    return Promise.all(
      rows.map(async (row) => ({
        key: row.key,
        label: row.label,
        state: row.state,
        lastSuccessAt: row.lastSuccessAt,
        lastSuccessNote: row.lastSuccessNote,
        lastProbe: this.probes.get(row.key),
        probeable: PROBEABLE[row.key] === null,
        probeNote: PROBEABLE[row.key],
        config: await this.connectorConfig.describe(row.key),
        // BUG-011 — this line is the whole bug's second half. The field-by-field
        // build above is a deliberate D2 safeguard, but it also means a new
        // field on the read-model reaches nobody until it is added HERE, and
        // neither the service tests nor the UI tests can see that gap.
        pendingRestart: row.pendingRestart,
      })),
    );
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

  /**
   * Update a connector's non-secret config (W34 / ADR-0013). ADMIN-only via the
   * controller-level @Roles. The service validates each field and rejects any
   * key that is not editable, so a secret can never be written; the change is
   * audited in the same transaction. Returns the refreshed config view.
   */
  @Patch(':key/config')
  @ApiOkResponse({ type: ConnectorConfigDto })
  async updateConfig(
    @CurrentUser() actor: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateConnectorConfigDto,
  ): Promise<ConnectorConfigDto> {
    if (!CONNECTOR_KEYS.includes(key as ConnectorKey)) {
      throw new BadRequestException(`Unknown connector: ${key}`);
    }
    const connector = key as ConnectorKey;
    await this.connectorConfig.update(connector, dto.values, actor.id);
    return this.connectorConfig.describe(connector);
  }
}
