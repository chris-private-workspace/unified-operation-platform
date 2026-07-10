import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

function ctxWith(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null,
  } as never;
}

function guardWith(meta: { isPublic?: boolean; roles?: Role[] }): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY
        ? meta.isPublic
        : key === ROLES_KEY
          ? meta.roles
          : undefined,
    ),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a route with no @Roles (any authenticated user)', () => {
    const guard = guardWith({ roles: undefined });
    expect(guard.canActivate(ctxWith({ role: Role.OPCO_IT }))).toBe(true);
  });

  it('allows when the user role is permitted', () => {
    const guard = guardWith({ roles: [Role.ADMIN, Role.REGIONAL] });
    expect(guard.canActivate(ctxWith({ role: Role.REGIONAL }))).toBe(true);
  });

  it('403 when the user role is not permitted', () => {
    const guard = guardWith({ roles: [Role.ADMIN, Role.REGIONAL] });
    expect(() => guard.canActivate(ctxWith({ role: Role.OPCO_IT }))).toThrow(
      ForbiddenException,
    );
  });

  it('403 when there is no authenticated user', () => {
    const guard = guardWith({ roles: [Role.ADMIN] });
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('allows @Public routes without a role check', () => {
    const guard = guardWith({ isPublic: true, roles: [Role.ADMIN] });
    expect(guard.canActivate(ctxWith(undefined))).toBe(true);
  });
});
