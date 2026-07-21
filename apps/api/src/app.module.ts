import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { IntegrationModule } from './integration/integration.module';
import { AuthModule } from './auth/auth.module';
import { LicenseModule } from './license/license.module';
import { FulfilmentModule } from './fulfilment/fulfilment.module';
import { OpcoModule } from './opco/opco.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Graph / ServiceNow / DB env
    ScheduleModule.forRoot(), // enables @Cron (sync sweep + daily reconcile)
    PrismaModule, // @Global — PrismaService everywhere
    AuditModule, // @Global — audit trail, cuts across every write module (ADR-0009)
    IntegrationModule, // Graph + ServiceNow clients
    AuthModule, // global APP_GUARD: JwtAuthGuard → RolesGuard (ADR-0002)
    LicenseModule, // (C) catalog + reconciliation + ledger
    FulfilmentModule, // (D) request lifecycle
    OpcoModule, // OpCo lookup for picker selectors (GET /opcos)
  ],
})
export class AppModule {}
