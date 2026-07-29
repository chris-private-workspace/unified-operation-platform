import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationModule } from '../integration/integration.module';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { RequestService } from './request.service';
import { StageService } from './stage.service';
import { AssignService } from './assign.service';
import { FulfilmentController } from './fulfilment.controller';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { IntakeAdapterService } from './intake-adapter.service';
import { IntakeKeyGuard } from './intake-key.guard';
import { OutboundRequestController } from './outbound-request.controller';
import { OutboundRequestService } from './outbound-request.service';
import { RequestSubmissionProvider } from './request-submission.provider';
import { DirectServiceNowProvider } from './direct-servicenow.provider';
import { N8nWorkflowProvider } from './n8n-workflow.provider';
import { OutboundFailureService } from './outbound-failure.service';
import { OutboundRetryService } from './outbound-retry.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { OutboundFailureController } from './outbound-failure.controller';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { SyncSweepService } from './sync-sweep.service';

/**
 * ADR-0008 D3 / Phase 丙 (W26, Fork 3 = config 單選): pick the outbound
 * write-integration by env — REQUEST_SUBMISSION_PROVIDER=n8n → webhook, anything
 * else (incl. unset) → Direct (Table API), so the default never changes existing
 * behaviour. Only the selected impl is constructed, so n8n env (URL/key) is
 * required only when n8n is actually chosen. Exported so the selection is unit-
 * testable without compiling the whole module.
 */
export async function requestSubmissionProviderFactory(
  config: ConfigService,
  snow: ServiceNowService,
  connectorConfig: ConnectorConfigService,
): Promise<RequestSubmissionProvider> {
  // Provider selection is non-secret and resolved DB-then-env (C2 / ADR-0013):
  // unset → direct, so existing behaviour never changes.
  const provider =
    (await connectorConfig.resolve(
      'n8n-outbound',
      'requestSubmissionProvider',
    )) ?? 'direct';
  if (provider !== 'n8n') return new DirectServiceNowProvider(snow);

  // n8n selected: the webhook URL is non-secret (DB-then-env); the key stays in
  // env (getOrThrow inside the provider). A missing URL fails the boot.
  const url = await connectorConfig.resolve(
    'n8n-outbound',
    'n8nOutboundWebhookUrl',
  );
  if (!url) {
    throw new Error(
      'n8n outbound is selected but its webhook URL is not configured',
    );
  }
  return new N8nWorkflowProvider(config, url);
}

/**
 * Module D — onboarding request lifecycle.
 *   D-1: intake → triage → stage advance (RequestService / StageService)
 *   D-2: sync gate → assign → ledger → SN write-back (AssignService)
 *   n8n inbound intake (ADR-0008 Phase 甲): IntakeController + IntakeService,
 *     m2m-guarded by IntakeKeyGuard (route-level, @Public bypasses JWT/Roles).
 *   outbound create (ADR-0008 Phase 乙/丙): OutboundRequestController + Service;
 *     RequestSubmissionProvider is picked by env (Direct Table API / n8n webhook).
 * GraphService + ServiceNowService come from IntegrationModule; Prisma from
 * the @Global PrismaModule.
 */
@Module({
  imports: [IntegrationModule], // GraphService + ServiceNowService
  controllers: [
    FulfilmentController,
    IntakeController,
    OutboundRequestController,
    OutboundFailureController,
    ActivityController,
  ],
  providers: [
    RequestService,
    StageService,
    AssignService,
    IntakeService,
    IntakeAdapterService, // ADR-0017 D4 — n8n native envelope → canonical intake
    IntakeKeyGuard,
    OutboundRequestService,
    OutboundFailureService, // ADR-0011 — outbound failure queue
    OutboundRetryService,
    // CH-011 / ADR-0019 — send + record-on-failure. Lives here rather than in
    // the integration layer so the transport never has to reach back into the
    // failure queue (that would be an integration → fulfilment cycle).
    NotificationDispatchService,
    ActivityService, // CH-006 — cross-request activity feed (read-only)
    // W37 / ADR-0015 — the platform's first @Cron. No controller: it is driven
    // by the scheduler, not by a request.
    SyncSweepService,
    // ADR-0008 D3 / Phase 丙 (W26): outbound provider picked by the connector
    // config resolver (DB-then-env since W34 / ADR-0013) — see
    // requestSubmissionProviderFactory above.
    //
    // BUG-005: this comment used to say "picked by env". It went stale the day
    // the resolver landed, and the same stale assumption was living in
    // IntegrationStatusService, where it actually mattered.
    {
      provide: RequestSubmissionProvider,
      useFactory: requestSubmissionProviderFactory,
      inject: [ConfigService, ServiceNowService, ConnectorConfigService],
    },
  ],
  exports: [
    RequestService,
    StageService,
    AssignService,
    NotificationDispatchService,
  ],
})
export class FulfilmentModule {}
