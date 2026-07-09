import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphService } from './graph/graph.service';
import { ServiceNowService } from './servicenow/servicenow.service';

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
  providers: [GraphService, ServiceNowService],
  exports: [GraphService, ServiceNowService],
})
export class IntegrationModule {}
