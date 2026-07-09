import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { IntegrationModule } from './integration/integration.module';
import { LicenseModule } from './license/license.module';
import { FulfilmentModule } from './fulfilment/fulfilment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Graph / ServiceNow / DB env
    ScheduleModule.forRoot(), // enables @Cron (sync sweep + daily reconcile)
    PrismaModule, // @Global — PrismaService everywhere
    IntegrationModule, // Graph + ServiceNow clients
    LicenseModule, // (C) catalog + reconciliation + ledger
    FulfilmentModule, // (D) request lifecycle
  ],
})
export class AppModule {}
