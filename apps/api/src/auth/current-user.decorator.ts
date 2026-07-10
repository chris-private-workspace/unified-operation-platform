import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppUser } from '@prisma/client';

/** The authenticated operator resolved by JwtAuthGuard (real token or dev-bypass). */
export type AuthUser = AppUser;

/** Inject the authenticated AppUser attached to the request by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
