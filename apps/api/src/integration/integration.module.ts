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
import { N8nLicenseProvider } from './license-ops/n8n-license.provider';
import { TicketUpdateProvider } from './ticket-update/ticket-update.provider';
import { DirectTicketProvider } from './ticket-update/direct-ticket.provider';
import { N8nTicketProvider } from './ticket-update/n8n-ticket.provider';
import { NotificationService } from './email/notification.service';
import { AcsEmailService } from './email/acs-email.service';

/**
 * W39 — the switch for seam ② (ADR-0017 D1: one per seam; ADR-0013 C2: read
 * once at boot, a change takes effect on restart).
 *
 * Anything other than the exact string 'n8n' resolves to Graph. That asymmetry
 * is deliberate: unset, a typo, or a half-finished config must all land on the
 * behaviour that has always been there, never on the one that routes real
 * licence assignments through a third party.
 *
 * Exported as of the W40 follow-up. It was written inline, which meant the one
 * property worth testing — the fail-safe direction — had no test at all, while
 * the identical switch for seam ④ did. Two switches guarding the same class of
 * mistake should not have two different levels of proof.
 */
export async function licenseOpsProviderFactory(
  graph: GraphLicenseProvider,
  n8n: N8nLicenseProvider,
  connectorConfig: ConnectorConfigService,
): Promise<LicenseOperationsProvider> {
  const choice = await connectorConfig.resolve(
    'n8n-license',
    'licenseOpsProvider',
  );
  return choice === 'n8n' ? n8n : graph;
}

/**
 * W40 — the switch for seam ④ (ADR-0017 D1: one per seam; ADR-0013 C2: read
 * once at boot, a change takes effect on restart).
 *
 * Anything other than the exact string 'n8n' resolves to Direct. Unset, a typo
 * and a half-finished config must all land on the behaviour that has always
 * been there — never on the one that lets a third party close a customer's
 * ticket.
 *
 * Exported so that fail-safe direction can be asserted directly. It is the one
 * property here worth a test: getting it backwards would not break anything
 * visibly, it would just quietly start routing real ticket closures through
 * n8n.
 *
 * No webhook-URL check at boot, deliberately: N8nTicketProvider resolves the
 * URL per call and reports a missing one as a configuration problem rather than
 * an outage. Checking it here as well would be a second place maintaining the
 * same fact.
 */
export async function ticketUpdateProviderFactory(
  direct: DirectTicketProvider,
  n8n: N8nTicketProvider,
  connectorConfig: ConnectorConfigService,
): Promise<TicketUpdateProvider> {
  const choice = await connectorConfig.resolve(
    'n8n-ticket',
    'ticketUpdateProvider',
  );
  return choice === 'n8n' ? n8n : direct;
}

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
    // ADR-0017 seam ② — both implementations are instantiable; the factory
    // below picks one. Consumers inject the abstract class, never a concrete
    // one, so nothing downstream can tell which it got (D0).
    GraphLicenseProvider,
    N8nLicenseProvider,
    {
      provide: LicenseOperationsProvider,
      useFactory: licenseOpsProviderFactory,
      inject: [
        GraphLicenseProvider,
        N8nLicenseProvider,
        ConnectorConfigService,
      ],
    },
    // ADR-0017 seam ④ — same arrangement as seam ② above. Consumers inject the
    // abstract class only, so nothing downstream can tell which one it got.
    DirectTicketProvider,
    N8nTicketProvider,
    {
      provide: TicketUpdateProvider,
      useFactory: ticketUpdateProviderFactory,
      inject: [DirectTicketProvider, N8nTicketProvider, ConnectorConfigService],
    },
    // CH-011 / ADR-0019 — NOT a seam. There is one transport, so this is a plain
    // alias rather than a factory: consumers depend on the abstract class purely
    // to keep the ACS SDK inside src/integration/email/ (D1/D2).
    { provide: NotificationService, useClass: AcsEmailService },
  ],
  exports: [
    GraphService,
    ServiceNowService,
    ConnectorConfigService,
    LicenseOperationsProvider,
    TicketUpdateProvider,
    NotificationService,
  ],
})
export class IntegrationModule {}
