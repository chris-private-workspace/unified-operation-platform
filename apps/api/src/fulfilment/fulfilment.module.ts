import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { RequestService } from './request.service';
import { StageService } from './stage.service';
import { AssignService } from './assign.service';
import { FulfilmentController } from './fulfilment.controller';

/**
 * Module D — onboarding request lifecycle.
 *   D-1: intake → triage → stage advance (RequestService / StageService)
 *   D-2: sync gate → assign → ledger → SN write-back (AssignService)
 * GraphService + ServiceNowService come from IntegrationModule; Prisma from
 * the @Global PrismaModule.
 */
@Module({
  imports: [IntegrationModule], // GraphService + ServiceNowService
  controllers: [FulfilmentController],
  providers: [RequestService, StageService, AssignService],
  exports: [RequestService, StageService, AssignService],
})
export class FulfilmentModule {}
