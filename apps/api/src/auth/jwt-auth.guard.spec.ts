import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

// jwks-rsa must open no network in tests; jsonwebtoken.verify is stubbed per-case.
jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(() => ({ getSigningKey: jest.fn() })),
}));
jest.mock('jsonwebtoken');

const ADMIN = {
  id: 'u-admin',
  entraOid: 'oid-seed-admin',
  email: 'chris.lai@rapo.com.hk',
  displayName: 'Chris Lai',
  role: 'ADMIN',
  opcoScopeId: null,
  active: true,
} as never;

function reflectorFor(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? isPublic : undefined,
    ),
  } as unknown as Reflector;
}

function ctxWith(req: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => null,
    getClass: () => null,
  } as never;
}

function config(values: Record<string, string>): ConfigService {
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (values[k] === undefined) throw new Error(`missing ${k}`);
      return values[k];
    },
  } as unknown as ConfigService;
}

const PROD_CFG = {
  ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  ENTRA_API_AUDIENCE: 'api://uop',
};

describe('JwtAuthGuard', () => {
  afterEach(() => jest.clearAllMocks());

  describe('AUTH_DEV_BYPASS', () => {
    it('attaches the seed ADMIN and allows (no token needed)', async () => {
      const prisma = {
        appUser: { findFirst: jest.fn().mockResolvedValue(ADMIN) },
      } as unknown as PrismaService;
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prisma,
        config({ AUTH_DEV_BYPASS: 'true' }),
      );
      const req: Record<string, unknown> = { headers: {} };
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(req.user).toBe(ADMIN);
    });

    it('401 when bypass is on but no ADMIN exists', async () => {
      const prisma = {
        appUser: { findFirst: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prisma,
        config({ AUTH_DEV_BYPASS: 'true' }),
      );
      await expect(
        guard.canActivate(ctxWith({ headers: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('@Public', () => {
    it('skips validation for public routes', async () => {
      const guard = new JwtAuthGuard(
        reflectorFor(true),
        {} as PrismaService,
        config(PROD_CFG),
      );
      await expect(guard.canActivate(ctxWith({ headers: {} }))).resolves.toBe(
        true,
      );
    });
  });

  describe('prod token path', () => {
    const prismaWith = (upsert: jest.Mock) =>
      ({ appUser: { upsert } }) as unknown as PrismaService;

    it('401 when the bearer token is missing', async () => {
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        {} as PrismaService,
        config(PROD_CFG),
      );
      await expect(
        guard.canActivate(ctxWith({ headers: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('upserts the AppUser by oid and attaches it on a valid token', async () => {
      (jwt.verify as unknown as jest.Mock).mockImplementation(
        (_t, _k, _o, cb) =>
          cb(null, { oid: 'oid-123', email: 'jo@x', name: 'Jo' }),
      );
      const user = {
        id: 'u-jo',
        entraOid: 'oid-123',
        email: 'jo@x',
        displayName: 'Jo',
        role: 'REGIONAL',
        opcoScopeId: null,
        active: true,
      } as never;
      const upsert = jest.fn().mockResolvedValue(user);
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prismaWith(upsert),
        config(PROD_CFG),
      );
      const req: Record<string, unknown> = {
        headers: { authorization: 'Bearer good.token.here' },
      };
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entraOid: 'oid-123' } }),
      );
      expect(req.user).toBe(user);
    });

    it('401 when the token fails verification', async () => {
      (jwt.verify as unknown as jest.Mock).mockImplementation(
        (_t, _k, _o, cb) => cb(new Error('jwt expired')),
      );
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prismaWith(jest.fn()),
        config(PROD_CFG),
      );
      await expect(
        guard.canActivate(
          ctxWith({ headers: { authorization: 'Bearer bad.token' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('401 when a valid token carries no oid claim', async () => {
      (jwt.verify as unknown as jest.Mock).mockImplementation(
        (_t, _k, _o, cb) => cb(null, { email: 'no-oid@x' }),
      );
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prismaWith(jest.fn()),
        config(PROD_CFG),
      );
      await expect(
        guard.canActivate(
          ctxWith({ headers: { authorization: 'Bearer x.y.z' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
