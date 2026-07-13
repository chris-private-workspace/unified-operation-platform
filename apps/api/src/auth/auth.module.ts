import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { LocalJwtService } from './local-jwt.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';

/**
 * Global auth (ADR-0002 + ADR-0005). Every request runs JwtAuthGuard (Entra JWT
 * or local JWT → AppUser, or dev-bypass) then RolesGuard (@Roles). `@Public()`
 * opts a route out. Order matters: JwtAuthGuard must run first so RolesGuard sees
 * request.user. LocalJwtService is shared by the guard (verify) and AuthService
 * (sign). PrismaService (@Global) + ConfigService (global) inject into both.
 */
@Module({
  controllers: [MeController, AuthController],
  providers: [
    LocalJwtService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
