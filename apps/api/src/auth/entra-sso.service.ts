import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { upsertEntraUser } from './entra-user';

/** The `state` + PKCE verifier pair a sign-in attempt is bound to (ADR-0028). */
interface SsoAttempt {
  state: string;
  verifier: string;
}

/** What the caller must put in the short-lived state cookie + where to send the browser. */
export interface AuthorizationRequest {
  authorizeUrl: string;
  stateCookieValue: string;
}

/**
 * Entra SSO via server-side authorization code exchange (ADR-0028).
 *
 * The browser never holds an Entra token: it is sent to Entra, comes back with a
 * `code`, and this service exchanges that code — using the client secret, from
 * the server — for an `id_token` it verifies against the tenant JWKS. The result
 * is an AppUser, which the controller then turns into the platform's own session
 * cookie (ADR-0006 §7) — the exact same session a break-glass login gets.
 *
 * Scope is `openid profile email` only. That is the whole reason this design
 * exists: it needs no Application ID URI and no custom `access_as_user` scope,
 * neither of which the app registration we were given has (W44 B9).
 *
 * Fully optional — a deployment with no ENTRA_* config simply reports
 * `enabled === false` and the sign-in button stays off. H4: the client secret is
 * never logged, never returned, and never leaves this service.
 */
@Injectable()
export class EntraSsoService {
  private readonly logger = new Logger(EntraSsoService.name);
  private readonly tenantId?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri?: string;
  private readonly jwks?: JwksClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    const tenantId = config.get<string>('ENTRA_TENANT_ID');
    const clientId = config.get<string>('ENTRA_CLIENT_ID');
    const clientSecret = config.get<string>('ENTRA_CLIENT_SECRET');
    const redirectUri = config.get<string>('ENTRA_REDIRECT_URI');
    // All four or nothing. A half-configured SSO would present a working button
    // that fails at the last step, which is the most expensive place to fail.
    if (tenantId && clientId && clientSecret && redirectUri) {
      this.tenantId = tenantId;
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.redirectUri = redirectUri;
      this.jwks = new JwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        rateLimit: true,
      });
      this.logger.log('Entra SSO is configured (server-side code exchange).');
    }
  }

  /** Whether this deployment can offer SSO at all (drives the login button). */
  get enabled(): boolean {
    return Boolean(this.jwks);
  }

  /**
   * Begin a sign-in: mint `state` + a PKCE verifier, and build the Entra
   * authorize URL. The verifier never leaves the server — it goes into an
   * httpOnly cookie and comes back only to us.
   */
  createAuthorizationRequest(): AuthorizationRequest {
    this.assertEnabled();
    const attempt: SsoAttempt = {
      state: randomBytes(32).toString('base64url'),
      verifier: randomBytes(32).toString('base64url'),
    };
    const challenge = createHash('sha256')
      .update(attempt.verifier)
      .digest('base64url');

    const params = new URLSearchParams({
      client_id: this.clientId!,
      response_type: 'code',
      redirect_uri: this.redirectUri!,
      response_mode: 'query',
      // Standard OIDC scopes only — no Application ID URI, no custom scope.
      scope: 'openid profile email',
      state: attempt.state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return {
      authorizeUrl: `https://login.microsoftonline.com/${this.tenantId!}/oauth2/v2.0/authorize?${params.toString()}`,
      stateCookieValue: Buffer.from(JSON.stringify(attempt)).toString(
        'base64url',
      ),
    };
  }

  /**
   * Finish a sign-in: check `state`, exchange the code, verify the id_token, and
   * resolve the AppUser. Every failure is a generic 401 — the caller is an
   * unauthenticated browser, and the detail belongs in the api log, not the
   * response.
   *
   * No `nonce`. In this flow the id_token is read straight off the token
   * endpoint over TLS and never travels through the browser, so there is no
   * replay window for a nonce to close — unlike the implicit-style alternative
   * ADR-0028 rejected, where it would have been mandatory.
   */
  async completeLogin(
    code: string,
    state: string,
    stateCookie: string | undefined,
  ): Promise<AppUser> {
    this.assertEnabled();

    const attempt = this.parseAttempt(stateCookie);
    if (!attempt || !constantTimeEquals(attempt.state, state)) {
      // Missing cookie / mismatched state — a CSRF attempt, a stale tab, or a
      // user who took longer than the cookie's lifetime. Indistinguishable here,
      // and all three want the same answer: start again.
      this.logger.warn('SSO callback rejected: state did not match');
      throw new UnauthorizedException('Sign-in expired — please try again');
    }

    const idToken = await this.exchangeCode(code, attempt.verifier);
    const claims = await this.verifyIdToken(idToken);
    const user = await upsertEntraUser(this.prisma, claims);

    await this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
      targetType: 'AppUser',
      targetId: user.id,
      actorId: user.id, // signing in is something you do to yourself
      metadata: { provider: 'entra' }, // distinguishes SSO from break-glass
    });
    // H4: id + role only — never the token, the claims, or the address.
    this.logger.log(`SSO session granted: userId=${user.id} role=${user.role}`);
    return user;
  }

  /** POST the code to Entra's token endpoint and return the raw id_token. */
  private async exchangeCode(code: string, verifier: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      code,
      redirect_uri: this.redirectUri!,
      grant_type: 'authorization_code',
      code_verifier: verifier,
      scope: 'openid profile email',
    });

    let res: Response;
    try {
      res = await fetch(
        `https://login.microsoftonline.com/${this.tenantId!}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        },
      );
    } catch (err) {
      // Network / DNS / TLS — the platform's problem, not the user's credential.
      this.logger.error(
        `Entra token endpoint unreachable: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Microsoft Entra ID is unreachable — please try again',
      );
    }

    if (!res.ok) {
      // Entra's error body carries AADSTS codes, which are the only thing that
      // makes a misconfiguration diagnosable — W44 B9 was solved entirely by
      // reading them. Logged (ops), never returned (the browser gets a generic
      // 401). The body contains no secret: it echoes error codes, not our
      // client_secret.
      const detail = await res.text().catch(() => '');
      this.logger.warn(
        `Entra token exchange failed (${res.status}): ${detail.slice(0, 500)}`,
      );
      throw new UnauthorizedException('Sign-in failed — please try again');
    }

    const payload = (await res.json()) as { id_token?: string };
    if (!payload.id_token) {
      this.logger.warn('Entra token response carried no id_token');
      throw new UnauthorizedException('Sign-in failed — please try again');
    }
    return payload.id_token;
  }

  /** Verify signature (RS256 via the tenant JWKS) + audience + issuer + lifetime. */
  private verifyIdToken(token: string): Promise<jwt.JwtPayload> {
    return new Promise((resolve, reject) => {
      const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        this.jwks!.getSigningKey(header.kid, (err, key) => {
          if (err || !key) {
            callback(err ?? new Error('signing key not found'));
            return;
          }
          callback(null, key.getPublicKey());
        });
      };
      jwt.verify(
        token,
        getKey,
        {
          // An id_token's audience IS the client id — that is the standard
          // behaviour this whole design leans on, and why no custom scope is
          // needed (ADR-0028).
          audience: this.clientId,
          // Both of the tenant's issuer forms, for the same reason the guard
          // accepts both (W44 B9): which one is stamped is a property of the app
          // registration, not of our code. Both derive from the same tenantId,
          // so this widens nothing across tenants.
          issuer: [
            `https://login.microsoftonline.com/${this.tenantId!}/v2.0`,
            `https://sts.windows.net/${this.tenantId!}/`,
          ],
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            // H4: log why, never the token.
            this.logger.warn(
              `id_token rejected: ${err?.message ?? 'malformed token'}`,
            );
            reject(
              new UnauthorizedException('Sign-in failed — please try again'),
            );
            return;
          }
          resolve(decoded);
        },
      );
    });
  }

  /** Read the state cookie back; any tampering / truncation reads as "no attempt". */
  private parseAttempt(cookie: string | undefined): SsoAttempt | null {
    if (!cookie) return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(cookie, 'base64url').toString('utf8'),
      ) as Partial<SsoAttempt>;
      if (!parsed.state || !parsed.verifier) return null;
      return { state: parsed.state, verifier: parsed.verifier };
    } catch {
      return null;
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Single sign-on is not configured in this environment',
      );
    }
  }
}

/** Length-safe constant-time compare — `state` is a secret being matched. */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
