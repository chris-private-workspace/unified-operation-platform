import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookie';

// Verifies the transport wiring: tokens go out as httpOnly cookies, the body only
// carries the identity, and refresh / logout clear cookies on the right paths.
function fakeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

const GRANT = {
  accessToken: 'access.tok',
  refresh: { rawToken: 'refresh.raw', expiresAt: new Date(Date.now() + 1000) },
  user: {
    id: 'u1',
    email: 'a@x',
    displayName: 'A',
    role: 'ADMIN',
    opcoScopeId: null,
    opcoScope: null,
    mustChangePassword: false,
  },
};

describe('AuthController', () => {
  describe('POST /auth/login', () => {
    it('sets both auth cookies (httpOnly) and returns only the identity', async () => {
      const auth = {
        login: jest.fn().mockResolvedValue(GRANT),
      } as unknown as AuthService;
      const res = fakeRes();

      const out = await new AuthController(auth).login(
        { email: 'a@x', password: 'pw' },
        res as never,
      );

      expect(out).toEqual({ user: GRANT.user });
      const names = res.cookie.mock.calls.map((c) => c[0]);
      expect(names).toEqual([ACCESS_COOKIE, REFRESH_COOKIE]);
      expect(res.cookie).toHaveBeenCalledWith(
        ACCESS_COOKIE,
        'access.tok',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        'refresh.raw',
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  describe('POST /auth/refresh', () => {
    it('401 + clears cookies when no refresh cookie is present', async () => {
      const auth = { refreshSession: jest.fn() } as unknown as AuthService;
      const res = fakeRes();
      await expect(
        new AuthController(auth).refresh(
          { cookies: {} } as never,
          res as never,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.refreshSession).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('rotates and re-sets both cookies on a valid refresh cookie', async () => {
      const auth = {
        refreshSession: jest.fn().mockResolvedValue(GRANT),
      } as unknown as AuthService;
      const res = fakeRes();

      const out = await new AuthController(auth).refresh(
        { cookies: { [REFRESH_COOKIE]: 'r.raw' } } as never,
        res as never,
      );

      expect(auth.refreshSession).toHaveBeenCalledWith('r.raw');
      expect(out).toEqual({ user: GRANT.user });
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });

    it('clears cookies and rethrows when the refresh token is invalid', async () => {
      const auth = {
        refreshSession: jest
          .fn()
          .mockRejectedValue(
            new UnauthorizedException('Invalid refresh token'),
          ),
      } as unknown as AuthService;
      const res = fakeRes();
      await expect(
        new AuthController(auth).refresh(
          { cookies: { [REFRESH_COOKIE]: 'bad' } } as never,
          res as never,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the presented refresh token and clears cookies', async () => {
      const auth = {
        logout: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuthService;
      const res = fakeRes();
      await new AuthController(auth).logout(
        { cookies: { [REFRESH_COOKIE]: 'r.raw' } } as never,
        res as never,
      );
      expect(auth.logout).toHaveBeenCalledWith('r.raw');
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('still clears cookies when there is no refresh cookie (idempotent)', async () => {
      const auth = {
        logout: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuthService;
      const res = fakeRes();
      await new AuthController(auth).logout(
        { cookies: {} } as never,
        res as never,
      );
      expect(auth.logout).toHaveBeenCalledWith(undefined);
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });
});
