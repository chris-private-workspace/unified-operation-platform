import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { MeController } from './me.controller';

/**
 * Global auth (ADR-0002). Every request runs JwtAuthGuard (Entra JWT → AppUser,
 * or dev-bypass) then RolesGuard (@Roles). `@Public()` opts a route out.
 * Order matters: JwtAuthGuard must run first so RolesGuard sees request.user.
 * PrismaService (@Global) and ConfigService (global) are injected into the guards.
 */
@Module({
  controllers: [MeController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
