import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EntraSsoService } from './entra-sso.service';
import { PasswordResetService } from './password-reset.service';
import { NotificationDispatchService } from '../fulfilment/notification-dispatch.service';
import { ACCESS_COOKIE, REFRESH_COOKIE, SSO_STATE_COOKIE } from './cookie';

// The controller reaches EntraSsoService, which reaches jwks-rsa → jose (ESM-only
// since v6, so jest cannot parse it). Same inert stub jwt-auth.guard.spec uses;
// nothing here goes near a real key anyway.
jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(() => ({ getSigningKey: jest.fn() })),
}));

// Verifies the transport wiring: tokens go out as httpOnly cookies, the body only
// carries the identity, and refresh / logout clear cookies on the right paths.
// W41 adds the reset routes, where the thing under test is the POLICY at this
// edge — uniform 204 and fire-and-forget — not the token logic underneath.
function fakeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

/**
 * The controller now has five collaborators; building it through here keeps each
 * test naming only the one it cares about.
 */
function makeController(parts: {
  auth?: Partial<AuthService>;
  entraSso?: Partial<EntraSsoService>;
  passwordReset?: Partial<PasswordResetService>;
  notifications?: Partial<NotificationDispatchService>;
  appBaseUrl?: string;
}) {
  const config = {
    get: jest.fn().mockReturnValue(parts.appBaseUrl),
  } as unknown as ConfigService;
  return new AuthController(
    (parts.auth ?? {}) as AuthService,
    (parts.entraSso ?? {}) as EntraSsoService,
    (parts.passwordReset ?? {}) as PasswordResetService,
    (parts.notifications ?? {
      send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 'm1' }),
    }) as NotificationDispatchService,
    config,
  );
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
      const auth = { login: jest.fn().mockResolvedValue(GRANT) };
      const res = fakeRes();

      const out = await makeController({ auth }).login(
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

  // ADR-0028 — the SSO handshake. What is under test here is the TRANSPORT: the
  // attempt cookie is set on start, spent exactly once on callback, and an SSO
  // sign-in ends at the very same two session cookies a password login does.
  // The exchange + token verification themselves live in EntraSsoService's spec.
  describe('SSO handshake', () => {
    it('GET /auth/sso/status reports whether SSO is configured', () => {
      expect(
        makeController({ entraSso: { enabled: true } }).ssoStatus(),
      ).toEqual({ enabled: true });
      // The control case: an unconfigured deployment must say so rather than
      // present a button that dead-ends at the last step.
      expect(
        makeController({ entraSso: { enabled: false } }).ssoStatus(),
      ).toEqual({ enabled: false });
    });

    it('GET /auth/entra/start parks the attempt in an httpOnly cookie', () => {
      const entraSso = {
        createAuthorizationRequest: jest.fn().mockReturnValue({
          authorizeUrl:
            'https://login.microsoftonline.com/t/oauth2/v2.0/authorize?x=1',
          stateCookieValue: 'opaque.attempt',
        }),
      };
      const res = fakeRes();

      const out = makeController({ entraSso }).entraStart(res as never);

      expect(out).toEqual({
        authorizeUrl:
          'https://login.microsoftonline.com/t/oauth2/v2.0/authorize?x=1',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        SSO_STATE_COOKIE,
        'opaque.attempt',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
    });

    it('POST /auth/entra/callback issues the SAME session cookies as a password login', async () => {
      const user = { id: 'u1', role: 'ADMIN' };
      const entraSso = { completeLogin: jest.fn().mockResolvedValue(user) };
      const auth = { grantSession: jest.fn().mockResolvedValue(GRANT) };
      const res = fakeRes();

      const out = await makeController({ entraSso, auth }).entraCallback(
        { code: 'c0de', state: 's7' },
        { cookies: { [SSO_STATE_COOKIE]: 'opaque.attempt' } } as never,
        res as never,
      );

      expect(entraSso.completeLogin).toHaveBeenCalledWith(
        'c0de',
        's7',
        'opaque.attempt',
      );
      expect(auth.grantSession).toHaveBeenCalledWith(user);
      expect(out).toEqual({ user: GRANT.user });
      expect(res.cookie.mock.calls.map((c) => c[0])).toEqual([
        ACCESS_COOKIE,
        REFRESH_COOKIE,
      ]);
      // Spent, not left behind — one attempt, one shot.
      expect(res.clearCookie).toHaveBeenCalledWith(
        SSO_STATE_COOKIE,
        expect.anything(),
      );
    });

    it('clears the attempt cookie even when the exchange fails', async () => {
      const entraSso = {
        completeLogin: jest
          .fn()
          .mockRejectedValue(new UnauthorizedException('Sign-in failed')),
      };
      const res = fakeRes();

      await expect(
        makeController({ entraSso }).entraCallback(
          { code: 'bad', state: 's7' },
          { cookies: { [SSO_STATE_COOKIE]: 'opaque.attempt' } } as never,
          res as never,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // 🔴 The point of the test: a failed attempt must not leave a live PKCE
      // verifier in the browser for a second try.
      expect(res.clearCookie).toHaveBeenCalledWith(
        SSO_STATE_COOKIE,
        expect.anything(),
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh', () => {
    it('401 + clears cookies when no refresh cookie is present', async () => {
      const auth = { refreshSession: jest.fn() };
      const res = fakeRes();
      await expect(
        makeController({ auth }).refresh(
          { cookies: {} } as never,
          res as never,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.refreshSession).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('rotates and re-sets both cookies on a valid refresh cookie', async () => {
      const auth = { refreshSession: jest.fn().mockResolvedValue(GRANT) };
      const res = fakeRes();

      const out = await makeController({ auth }).refresh(
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
      };
      const res = fakeRes();
      await expect(
        makeController({ auth }).refresh(
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
      const auth = { logout: jest.fn().mockResolvedValue(undefined) };
      const res = fakeRes();
      await makeController({ auth }).logout(
        { cookies: { [REFRESH_COOKIE]: 'r.raw' } } as never,
        res as never,
      );
      expect(auth.logout).toHaveBeenCalledWith('r.raw');
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('still clears cookies when there is no refresh cookie (idempotent)', async () => {
      const auth = { logout: jest.fn().mockResolvedValue(undefined) };
      const res = fakeRes();
      await makeController({ auth }).logout(
        { cookies: {} } as never,
        res as never,
      );
      expect(auth.logout).toHaveBeenCalledWith(undefined);
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /auth/forgot-password (W41)', () => {
    const ISSUED = {
      rawToken: 'a'.repeat(64),
      email: 'ops@example.com',
      displayName: 'Ops User',
    };

    it('sends the mail with a FRAGMENT link when a token was issued', async () => {
      const send = jest
        .fn()
        .mockResolvedValue({ status: 'sent', messageId: 'm1' });
      const controller = makeController({
        passwordReset: { issue: jest.fn().mockResolvedValue(ISSUED) },
        notifications: { send },
        appBaseUrl: 'https://uop.example.com',
      });

      await controller.forgotPassword({ email: 'ops@example.com' });
      await Promise.resolve(); // let the fire-and-forget send settle

      expect(send).toHaveBeenCalledTimes(1);
      const msg = send.mock.calls[0][0];
      expect(msg.to).toBe('ops@example.com');
      expect(msg.template).toBe('password-reset');
      // 🔴 OQ-4: the token must be after a '#', never in the query string —
      // a fragment is not sent to the server, so it stays out of access logs.
      expect(msg.params.resetUrl).toBe(
        `https://uop.example.com/reset-password#token=${ISSUED.rawToken}`,
      );
      expect(msg.params.resetUrl).not.toContain('?token=');
      expect(msg.params.ttlMinutes).toBe('30');
    });

    it('trims a trailing slash on APP_BASE_URL rather than emitting a double slash', async () => {
      const send = jest.fn().mockResolvedValue({ status: 'sent' });
      await makeController({
        passwordReset: { issue: jest.fn().mockResolvedValue(ISSUED) },
        notifications: { send },
        appBaseUrl: 'https://uop.example.com/',
      }).forgotPassword({ email: 'ops@example.com' });

      expect(send.mock.calls[0][0].params.resetUrl).toContain(
        'https://uop.example.com/reset-password#',
      );
    });

    /**
     * 🔴 G1 at the HTTP edge. The service already proves it returns null for an
     * unknown / SSO / deactivated account and inside the cooldown; what has to
     * hold HERE is that null means nothing goes out and nothing is thrown — the
     * caller cannot tell the difference from a successful request.
     */
    it('sends nothing, and does not throw, when there is nothing to send', async () => {
      const send = jest.fn();
      await expect(
        makeController({
          passwordReset: { issue: jest.fn().mockResolvedValue(null) },
          notifications: { send },
          appBaseUrl: 'https://uop.example.com',
        }).forgotPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();

      expect(send).not.toHaveBeenCalled();
    });

    it('issues nothing at all when APP_BASE_URL is unset', async () => {
      const send = jest.fn();
      const issue = jest.fn().mockResolvedValue(ISSUED);
      await expect(
        makeController({
          passwordReset: { issue },
          notifications: { send },
          appBaseUrl: undefined,
        }).forgotPassword({ email: 'ops@example.com' }),
      ).resolves.toBeUndefined();

      // A link to nowhere is worse than no mail: it teaches the user the reset
      // is broken rather than that it is unconfigured.
      expect(send).not.toHaveBeenCalled();

      // 🔴 The assertion that pins the ORDER, and the whole point of this test.
      // `issue()` writes an audit row saying `reason: 'issued'` and starts the
      // caller's 5-minute cooldown. Doing that for a mail which cannot be sent
      // leaves the audit trail actively lying — it answers "why did my user
      // never get the mail" with "we sent it" — and ADR-0009 makes that trail
      // the one place operations is supposed to trust. Asserting only on `send`
      // (as this test originally did) passes either way, so the order could
      // regress silently.
      expect(issue).not.toHaveBeenCalled();
    });

    /**
     * 🔴 The reason the `.catch` exists. A rejected fire-and-forget send is an
     * unhandled rejection, and BUG-002 proved that kills the Nest process — so
     * this asserts the request still completes normally even when the dispatcher
     * breaks its own never-throws contract.
     */
    it('survives a dispatcher that throws (no unhandled rejection)', async () => {
      const send = jest.fn().mockRejectedValue(new Error('transport exploded'));
      await expect(
        makeController({
          passwordReset: { issue: jest.fn().mockResolvedValue(ISSUED) },
          notifications: { send },
          appBaseUrl: 'https://uop.example.com',
        }).forgotPassword({ email: 'ops@example.com' }),
      ).resolves.toBeUndefined();

      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /auth/reset-password (W41)', () => {
    it('spends the token and clears both cookies', async () => {
      const consume = jest.fn().mockResolvedValue(undefined);
      const res = fakeRes();

      await makeController({ passwordReset: { consume } }).resetPassword(
        { token: 'raw', newPassword: 'Str0ng!Passw0rd' },
        res as never,
      );

      expect(consume).toHaveBeenCalledWith('raw', 'Str0ng!Passw0rd');
      // Every refresh token was just revoked; a stale access cookie would leave
      // up to 15 minutes of a session the user thinks they have just ended.
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('propagates the rejection and leaves cookies alone', async () => {
      const consume = jest.fn().mockRejectedValue(new Error('invalid'));
      const res = fakeRes();

      await expect(
        makeController({ passwordReset: { consume } }).resetPassword(
          { token: 'bad', newPassword: 'Str0ng!Passw0rd' },
          res as never,
        ),
      ).rejects.toThrow();
      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });
});
