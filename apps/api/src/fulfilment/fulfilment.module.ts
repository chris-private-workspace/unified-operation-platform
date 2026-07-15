import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
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

/**
 * Module D — onboarding request lifecycle.
 *   D-1: intake → triage → stage advance (RequestService / StageService)
 *   D-2: sync gate → assign → ledger → SN write-back (AssignService)
 *   n8n inbound intake (ADR-0008 Phase 甲): IntakeController + IntakeService,
 *     m2m-guarded by IntakeKeyGuard (route-level, @Public bypasses JWT/Roles).
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
    // ADR-0008 D3: pluggable write-integration → Direct (Table API) impl now;
    // N8nWorkflowProvider (Phase 丙) swaps at this binding.
    { provide: RequestSubmissionProvider, useClass: DirectServiceNowProvider },
  ],
  exports: [RequestService, StageService, AssignService],
})
export class FulfilmentModule {}
