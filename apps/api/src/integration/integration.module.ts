import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphService } from './graph/graph.service';
import { ServiceNowService } from './servicenow/servicenow.service';
import { IntegrationController } from './integration.controller';
import { IntegrationStatusService } from './integration-status.service';
import { IntegrationProbeService } from './integration-probe.service';
import { ConnectorConfigService } from './connector-config.service';
import { LicenseOperationsProvider } from './license-ops/license-ops.provider';
import { GraphLicenseProvider } from './license-ops/graph-license.provider';

/**
 * Integration layer — the platform's outbound edge.
 * Everything that talks to an external system goes through here, so the
 * domain/orchestration layers stay free of vendor SDK details.
 *
 * Assumes ConfigModule.forRoot({ isGlobal: true }) in AppModule; the import
 * below is harmless if config is already global.
 */
@Module({
  imports: [ConfigModule],
  // W30: the first controller here — a read-only status surface + user-triggered
  // probes (ADR-0010 item 4). Prisma comes from the @Global PrismaModule.
  controllers: [IntegrationController],
  providers: [
    GraphService,
    ServiceNowService,
    IntegrationStatusService,
    IntegrationProbeService,
    ConnectorConfigService,
    // ADR-0017 seam ② (W38). Default = Graph, which is the behaviour that has
    // always been there; 庚 adds N8nLicenseProvider and this one line becomes
    // the switch. Consumers inject the abstract class, never the concrete one.
    { provide: LicenseOperationsProvider, useClass: GraphLicenseProvider },
  ],
  exports: [
    GraphService,
    ServiceNowService,
    ConnectorConfigService,
    LicenseOperationsProvider,
  ],
})
export class IntegrationModule {}
