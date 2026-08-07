import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { EntraSsoService } from './entra-sso.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

// No network in tests: jwks-rsa is inert and jsonwebtoken.verify is stubbed —
// same treatment jwt-auth.guard.spec gives them.
jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(() => ({ getSigningKey: jest.fn() })),
}));
jest.mock('jsonwebtoken');

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLIENT = '08fa14bf-0000-0000-0000-000000000000';

const FULL_CFG = {
  ENTRA_TENANT_ID: TENANT,
  ENTRA_CLIENT_ID: CLIENT,
  ENTRA_CLIENT_SECRET: 'shhh',
  ENTRA_REDIRECT_URI: 'https://rapo-uop-web-dev.rci-t.com',
};

const CLAIMS = {
  oid: 'oid-chris',
  email: 'chris.lai@rci-t.com',
  name: 'Chris Lai',
} as jwt.JwtPayload;

const USER = {
  id: 'u-sso',
  entraOid: 'oid-chris',
  email: 'chris.lai@rci-t.com',
  displayName: 'Chris Lai',
  role: 'REGIONAL',
  active: true,
} as never;

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

function makeService(
  values: Record<string, string | undefined> = FULL_CFG,
  upsert: jest.Mock = jest.fn().mockResolvedValue(USER),
) {
  const prisma = { appUser: { upsert } } as unknown as PrismaService;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new EntraSsoService(
    prisma,
    audit as unknown as AuditService,
    config(values),
  );
  return { service, audit, upsert };
}

/** Fake the token endpoint. `ok:false` models Entra rejecting the exchange. */
function mockTokenEndpoint(res: {
  ok: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status ?? (res.ok ? 200 : 400),
    json: jest.fn().mockResolvedValue(res.body ?? {}),
    text: jest.fn().mockResolvedValue(res.text ?? ''),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Drive a full happy-path sign-in and return everything worth asserting on. */
async function signIn(overrides: { state?: string; cookie?: string } = {}) {
  const parts = makeService();
  const { authorizeUrl, stateCookieValue } =
    parts.service.createAuthorizationRequest();
  const realState = new URL(authorizeUrl).searchParams.get('state')!;
  const fetchMock = mockTokenEndpoint({
    ok: true,
    body: { id_token: 'id.tok' },
  });
  (jwt.verify as unknown as jest.Mock).mockImplementation(
    (_t, _k, _o, cb: (e: null, d: jwt.JwtPayload) => void) => cb(null, CLAIMS),
  );
  // `in`, not `?? default` — passing `cookie: undefined` deliberately IS the
  // "no cookie at all" case, and a nullish fallback would quietly restore it.
  const cookie = 'cookie' in overrides ? overrides.cookie : stateCookieValue;
  const result = parts.service.completeLogin(
    'the-code',
    overrides.state ?? realState,
    cookie,
  );
  return { ...parts, result, fetchMock, realState, stateCookieValue };
}

describe('EntraSsoService (ADR-0028)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('configuration', () => {
    it('is enabled only when ALL four settings are present', () => {
      expect(makeService(FULL_CFG).service.enabled).toBe(true);
      // Half-configured must read as OFF, not as "on and broken" — a button that
      // works up to the last step is the most expensive place to fail.
      expect(
        makeService({ ...FULL_CFG, ENTRA_CLIENT_SECRET: undefined }).service
          .enabled,
      ).toBe(false);
      expect(makeService({}).service.enabled).toBe(false);
    });

    it('refuses to start or complete a sign-in when unconfigured', async () => {
      const { service } = makeService({});
      expect(() => service.createAuthorizationRequest()).toThrow(
        ServiceUnavailableException,
      );
      await expect(service.completeLogin('c', 's', 'k')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('createAuthorizationRequest', () => {
    it('asks for standard OIDC scopes only — no Application ID URI, no custom scope', () => {
      const { service } = makeService();
      const url = new URL(service.createAuthorizationRequest().authorizeUrl);

      expect(url.origin + url.pathname).toBe(
        `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,
      );
      // 🔴 The whole reason ADR-0028 exists: this request needs nothing the app
      // registration does not already have.
      expect(url.searchParams.get('scope')).toBe('openid profile email');
      expect(url.searchParams.get('scope')).not.toContain('api://');
      expect(url.searchParams.get('client_id')).toBe(CLIENT);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('redirect_uri')).toBe(
        FULL_CFG.ENTRA_REDIRECT_URI,
      );
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
    });

    it('keeps the PKCE verifier out of the URL — only the challenge travels', () => {
      const { service } = makeService();
      const { authorizeUrl, stateCookieValue } =
        service.createAuthorizationRequest();
      const attempt = JSON.parse(
        Buffer.from(stateCookieValue, 'base64url').toString('utf8'),
      ) as { state: string; verifier: string };

      expect(authorizeUrl).not.toContain(attempt.verifier);
      expect(new URL(authorizeUrl).searchParams.get('state')).toBe(
        attempt.state,
      );
    });

    it('mints a fresh state + verifier per attempt', () => {
      const { service } = makeService();
      const a = service.createAuthorizationRequest();
      const b = service.createAuthorizationRequest();
      expect(a.stateCookieValue).not.toEqual(b.stateCookieValue);
    });
  });

  describe('completeLogin', () => {
    it('exchanges the code and resolves the AppUser', async () => {
      const { result, fetchMock, upsert, audit } = await signIn();
      await expect(result).resolves.toBe(USER);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      );
      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('the-code');
      expect(body.get('client_secret')).toBe('shhh'); // server-side only
      expect(body.get('code_verifier')).toBeTruthy();

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entraOid: 'oid-chris' } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
          targetId: 'u-sso',
          metadata: { provider: 'entra' },
        }),
      );
    });

    it('verifies the id_token against the client id and BOTH tenant issuer forms', async () => {
      const { result } = await signIn();
      await result;

      const opts = (jwt.verify as unknown as jest.Mock).mock
        .calls[0][2] as jwt.VerifyOptions;
      // An id_token's audience IS the client id — no custom scope needed.
      expect(opts.audience).toBe(CLIENT);
      expect(opts.issuer).toEqual([
        `https://login.microsoftonline.com/${TENANT}/v2.0`,
        `https://sts.windows.net/${TENANT}/`,
      ]);
      expect(opts.algorithms).toEqual(['RS256']);
    });

    // 🔴 The control case. Without it, "state matched" proves nothing — a check
    // that always passes looks exactly like a check that works.
    it('rejects a mismatched state and never touches the token endpoint', async () => {
      const { result, fetchMock } = await signIn({ state: 'not-the-state' });
      await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a missing attempt cookie', async () => {
      const { result, fetchMock } = await signIn({ cookie: undefined });
      await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a tampered attempt cookie', async () => {
      const { result, fetchMock } = await signIn({ cookie: 'not-base64-json' });
      await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces a generic 401 when Entra rejects the exchange', async () => {
      const parts = makeService();
      const { authorizeUrl, stateCookieValue } =
        parts.service.createAuthorizationRequest();
      const state = new URL(authorizeUrl).searchParams.get('state')!;
      mockTokenEndpoint({
        ok: false,
        status: 400,
        text: '{"error":"invalid_grant","error_description":"AADSTS70008"}',
      });

      await expect(
        parts.service.completeLogin('stale', state, stateCookieValue),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(parts.audit.log).not.toHaveBeenCalled();
    });

    it('rejects a token response with no id_token', async () => {
      const parts = makeService();
      const { authorizeUrl, stateCookieValue } =
        parts.service.createAuthorizationRequest();
      const state = new URL(authorizeUrl).searchParams.get('state')!;
      mockTokenEndpoint({ ok: true, body: { access_token: 'only.this' } });

      await expect(
        parts.service.completeLogin('c', state, stateCookieValue),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reports the platform, not the credential, when Entra is unreachable', async () => {
      const parts = makeService();
      const { authorizeUrl, stateCookieValue } =
        parts.service.createAuthorizationRequest();
      const state = new URL(authorizeUrl).searchParams.get('state')!;
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('ENOTFOUND')) as unknown as typeof fetch;

      await expect(
        parts.service.completeLogin('c', state, stateCookieValue),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('rejects an id_token that fails verification', async () => {
      const parts = makeService();
      const { authorizeUrl, stateCookieValue } =
        parts.service.createAuthorizationRequest();
      const state = new URL(authorizeUrl).searchParams.get('state')!;
      mockTokenEndpoint({ ok: true, body: { id_token: 'id.tok' } });
      (jwt.verify as unknown as jest.Mock).mockImplementation(
        (_t, _k, _o, cb: (e: Error) => void) => cb(new Error('jwt expired')),
      );

      await expect(
        parts.service.completeLogin('c', state, stateCookieValue),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(parts.audit.log).not.toHaveBeenCalled();
    });

    it('names the collision when the address already belongs to a local account', async () => {
      const parts = makeService(
        FULL_CFG,
        jest.fn().mockRejectedValue({ code: 'P2002' }),
      );
      const { authorizeUrl, stateCookieValue } =
        parts.service.createAuthorizationRequest();
      const state = new URL(authorizeUrl).searchParams.get('state')!;
      mockTokenEndpoint({ ok: true, body: { id_token: 'id.tok' } });
      (jwt.verify as unknown as jest.Mock).mockImplementation(
        (_t, _k, _o, cb: (e: null, d: jwt.JwtPayload) => void) =>
          cb(null, CLAIMS),
      );

      await expect(
        parts.service.completeLogin('c', state, stateCookieValue),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
