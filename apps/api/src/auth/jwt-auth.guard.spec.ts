import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalJwtService } from './local-jwt.service';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ACCESS_COOKIE } from './cookie';

// jwks-rsa must open no network in tests; jsonwebtoken.verify is stubbed (Entra path).
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

const OPCO_IT = {
  id: 'u-opco',
  entraOid: 'dev-opco-it-rhk',
  email: 'opco.it.rhk@rapo.com.hk',
  displayName: 'RHK OpCo IT',
  role: 'OPCO_IT',
  opcoScopeId: 'rhk-id',
  active: true,
} as never;

const LOCAL_ADMIN = {
  id: 'u-local',
  entraOid: null,
  email: 'admin@uop.local',
  displayName: 'Local Admin',
  role: 'ADMIN',
  opcoScopeId: null,
  active: true,
  authProvider: 'local',
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

// LocalJwtService stub: verify() returns `claims`, or throws 401 when null.
function localJwt(
  claims: { sub: string; role: string } | null,
): LocalJwtService {
  return {
    sign: jest.fn(),
    verify: jest.fn(() => {
      if (!claims) throw new UnauthorizedException('Invalid or expired token');
      return claims;
    }),
  } as unknown as LocalJwtService;
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
        localJwt(null),
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
        localJwt(null),
        config({ AUTH_DEV_BYPASS: 'true' }),
      );
      await expect(
        guard.canActivate(ctxWith({ headers: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // AUTH-3a dev run-as: AUTH_DEV_USER_EMAIL picks a specific seeded user so
    // local dev can exercise OPCO_IT scope without SSO.
    it('runs as the AUTH_DEV_USER_EMAIL user when it exists', async () => {
      const findFirst = jest.fn().mockResolvedValue(OPCO_IT);
      const prisma = { appUser: { findFirst } } as unknown as PrismaService;
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prisma,
        localJwt(null),
        config({
          AUTH_DEV_BYPASS: 'true',
          AUTH_DEV_USER_EMAIL: 'opco.it.rhk@rapo.com.hk',
        }),
      );
      const req: Record<string, unknown> = { headers: {} };
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(req.user).toBe(OPCO_IT);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'opco.it.rhk@rapo.com.hk', active: true },
        }),
      );
    });

    it('falls back to seed ADMIN when AUTH_DEV_USER_EMAIL has no match', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(null) // email lookup misses
        .mockResolvedValueOnce(ADMIN); // ADMIN fallback
      const prisma = { appUser: { findFirst } } as unknown as PrismaService;
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prisma,
        localJwt(null),
        config({
          AUTH_DEV_BYPASS: 'true',
          AUTH_DEV_USER_EMAIL: 'ghost@nowhere',
        }),
      );
      const req: Record<string, unknown> = { headers: {} };
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(req.user).toBe(ADMIN);
    });
  });

  describe('@Public', () => {
    it('skips validation for public routes', async () => {
      const guard = new JwtAuthGuard(
        reflectorFor(true),
        {} as PrismaService,
        localJwt(null),
        config(PROD_CFG),
      );
      await expect(guard.canActivate(ctxWith({ headers: {} }))).resolves.toBe(
        true,
      );
    });
  });

  describe('local cookie path (ADR-0006 §7)', () => {
    it('resolves the uop_access cookie by sub (authProvider=local, active)', async () => {
      const findFirst = jest.fn().mockResolvedValue(LOCAL_ADMIN);
      const prisma = { appUser: { findFirst } } as unknown as PrismaService;
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prisma,
        localJwt({ sub: 'u-local', role: 'ADMIN' }),
        config(PROD_CFG),
      );
      const req: Record<string, unknown> = {
        cookies: { [ACCESS_COOKIE]: 'local.tok' },
        headers: {},
      };
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-local', active: true, authProvider: 'local' },
        }),
      );
      expect(req.user).toBe(LOCAL_ADMIN);
    });

    it('401 when the access cookie fails verification', async () => {
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        {} as PrismaService,
        localJwt(null), // verify throws
        config(PROD_CFG),
      );
      await expect(
        guard.canActivate(
          ctxWith({ cookies: { [ACCESS_COOKIE]: 'bad.local' }, headers: {} }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // Force-change gate (ADR-0006 §5): a mustChangePassword local account may only
    // hit PATCH /me/password until it sets its own password.
    describe('force-change gate', () => {
      const mustChange = {
        id: 'u-local',
        email: 'admin@uop.local',
        role: 'ADMIN',
        active: true,
        authProvider: 'local',
        mustChangePassword: true,
      } as never;
      const guardFor = () => {
        const prisma = {
          appUser: { findFirst: jest.fn().mockResolvedValue(mustChange) },
        } as unknown as PrismaService;
        return new JwtAuthGuard(
          reflectorFor(false),
          prisma,
          localJwt({ sub: 'u-local', role: 'ADMIN' }),
          config(PROD_CFG),
        );
      };

      it('403 on any route other than the change-password route', async () => {
        await expect(
          guardFor().canActivate(
            ctxWith({
              method: 'GET',
              url: '/license/catalog',
              cookies: { [ACCESS_COOKIE]: 'local.tok' },
              headers: {},
            }),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('allows PATCH /me/password', async () => {
        const req: Record<string, unknown> = {
          method: 'PATCH',
          url: '/me/password',
          cookies: { [ACCESS_COOKIE]: 'local.tok' },
          headers: {},
        };
        await expect(guardFor().canActivate(ctxWith(req))).resolves.toBe(true);
        expect(req.user).toBe(mustChange);
      });
    });
  });

  describe('Entra token path', () => {
    const prismaWith = (upsert: jest.Mock) =>
      ({ appUser: { upsert } }) as unknown as PrismaService;

    it('401 when neither a cookie nor a bearer token is present', async () => {
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        {} as PrismaService,
        localJwt(null),
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
        localJwt(null),
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
        localJwt(null),
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
        localJwt(null),
        config(PROD_CFG),
      );
      await expect(
        guard.canActivate(
          ctxWith({ headers: { authorization: 'Bearer x.y.z' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // W44 B9: which issuer Entra stamps is a property of the app registration
    // (accessTokenAcceptedVersion), not of our code. Pinning only the v2.0 form
    // makes a v1 registration fail in the most expensive way there is — sign-in
    // succeeds, then every request is 401 and nothing in the error names the
    // token version. Both values derive from the same tenantId, so accepting the
    // pair widens nothing across tenants.
    it('verifies against BOTH tenant issuer forms (v2.0 and legacy v1)', async () => {
      let seen: jwt.VerifyOptions | undefined;
      (jwt.verify as unknown as jest.Mock).mockImplementation(
        (_t, _k, o: jwt.VerifyOptions, cb) => {
          seen = o;
          cb(null, { oid: 'oid-123', email: 'x@y', name: 'X' });
        },
      );
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        prismaWith(jest.fn().mockResolvedValue(ADMIN)),
        localJwt(null),
        config(PROD_CFG),
      );
      await guard.canActivate(
        ctxWith({ headers: { authorization: 'Bearer x.y.z' } }),
      );
      expect(seen?.issuer).toEqual([
        `https://login.microsoftonline.com/${PROD_CFG.ENTRA_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${PROD_CFG.ENTRA_TENANT_ID}/`,
      ]);
      // audience stays a single exact value — widening it would be a real hole.
      expect(seen?.audience).toBe(PROD_CFG.ENTRA_API_AUDIENCE);
    });

    it('401 when an Entra token arrives but SSO is not configured', async () => {
      const guard = new JwtAuthGuard(
        reflectorFor(false),
        {} as PrismaService,
        localJwt(null),
        config({ AUTH_JWT_SECRET: 'local-secret' }), // local only, no Entra
      );
      await expect(
        guard.canActivate(
          ctxWith({ headers: { authorization: 'Bearer entra.tok' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('fails fast at boot when no auth provider is configured', () => {
    expect(
      () =>
        new JwtAuthGuard(
          reflectorFor(false),
          {} as PrismaService,
          localJwt(null),
          config({}), // no dev-bypass, no Entra, no local secret
        ),
    ).toThrow(/No auth provider configured/);
  });
});
