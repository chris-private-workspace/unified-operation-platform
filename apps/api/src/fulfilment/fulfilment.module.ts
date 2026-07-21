import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationModule } from '../integration/integration.module';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { RequestService } from './request.service';
import { StageService } from './stage.service';
import { AssignService } from './assign.service';
import { FulfilmentController } from './fulfilment.controller';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { IntakeKeyGuard } from './intake-key.guard';
import { OutboundRequestController } from './outbound-request.controller';
import { OutboundRequestService } from './outbound-request.service';
import { RequestSubmissionProvider } from './request-submission.provider';
import { DirectServiceNowProvider } from './direct-servicenow.provider';
import { N8nWorkflowProvider } from './n8n-workflow.provider';
import { OutboundFailureService } from './outbound-failure.service';

/**
 * ADR-0008 D3 / Phase 丙 (W26, Fork 3 = config 單選): pick the outbound
 * write-integration by env — REQUEST_SUBMISSION_PROVIDER=n8n → webhook, anything
 * else (incl. unset) → Direct (Table API), so the default never changes existing
 * behaviour. Only the selected impl is constructed, so n8n env (URL/key) is
 * required only when n8n is actually chosen. Exported so the selection is unit-
 * testable without compiling the whole module.
 */
export function requestSubmissionProviderFactory(
  config: ConfigService,
  snow: ServiceNowService,
): RequestSubmissionProvider {
  return config.get<string>('REQUEST_SUBMISSION_PROVIDER') === 'n8n'
    ? new N8nWorkflowProvider(config)
    : new DirectServiceNowProvider(snow);
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
  ],
  providers: [
    RequestService,
    StageService,
    AssignService,
    IntakeService,
    IntakeKeyGuard,
    OutboundRequestService,
    OutboundFailureService, // ADR-0011 — outbound failure queue
    // ADR-0008 D3 / Phase 丙 (W26): outbound provider picked by env — see
    // requestSubmissionProviderFactory above.
    {
      provide: RequestSubmissionProvider,
      useFactory: requestSubmissionProviderFactory,
      inject: [ConfigService, ServiceNowService],
    },
  ],
  exports: [RequestService, StageService, AssignService],
})
export class FulfilmentModule {}
