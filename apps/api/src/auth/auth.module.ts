import { Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { FulfilmentModule } from '../fulfilment/fulfilment.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { LocalJwtService } from './local-jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordResetService } from './password-reset.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { UserAdminService } from './user-admin.service';
import { UserAdminController } from './user-admin.controller';
import { PermissionsController } from './permissions.controller';

/**
 * Global auth (ADR-0002 + ADR-0005). Every request runs JwtAuthGuard (Entra JWT
 * or local JWT → AppUser, or dev-bypass) then RolesGuard (@Roles). `@Public()`
 * opts a route out. Order matters: JwtAuthGuard must run first so RolesGuard sees
 * request.user. LocalJwtService is shared by the guard (verify) and AuthService
 * (sign). PrismaService (@Global) + ConfigService (global) inject into both.
 */
@Module({
  // DiscoveryModule lets PermissionsController enumerate every registered
  // controller at runtime, so the matrix needs no hand-maintained list (W28).
  imports: [
    DiscoveryModule,
    /**
     * W41 — for NotificationDispatchService (the reset mail). The dependency
     * direction is auth → fulfilment, which reads backwards at first glance, but
     * it is the only one that does not create a cycle: the dispatcher has to sit
     * beside the outbound failure queue (CH-011), the queue lives in fulfilment,
     * and fulfilment imports only integration. Verified before wiring, not after.
     */
    FulfilmentModule,
  ],
  controllers: [
    MeController,
    AuthController,
    UserAdminController,
    PermissionsController,
  ],
  providers: [
    LocalJwtService,
    RefreshTokenService,
    // AUTH-4c-C — token lifecycle + the password write. It does NOT send the
    // mail: that stays with the caller (F3), which is what keeps the always-204
    // enumeration rule in one place at the HTTP edge.
    PasswordResetService,
    AuthService,
    UserAdminService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
