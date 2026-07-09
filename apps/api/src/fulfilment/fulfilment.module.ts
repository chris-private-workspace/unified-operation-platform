import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { RequestService } from './request.service';
import { StageService } from './stage.service';
import { FulfilmentController } from './fulfilment.controller';

/**
 * Module D-1 — onboarding request lifecycle skeleton (intake → triage → stage
 * advance). Consumes ServiceNow tickets (mirror) via ServiceNowService; Prisma
 * comes from the @Global PrismaModule. Assign / ledger / SN write-back = D-2.
 */
@Module({
  imports: [IntegrationModule], // ServiceNowService
  controllers: [FulfilmentController],
  providers: [RequestService, StageService],
  exports: [RequestService, StageService],
})
export class FulfilmentModule {}
