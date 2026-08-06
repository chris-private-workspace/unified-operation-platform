import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { LocalJwtService } from './local-jwt.service';
import { ACCESS_COOKIE } from './cookie';

/**
 * Validates the credential on every request (ADR-0002 + ADR-0005 + ADR-0006 §7).
 * Two transports:
 *  • an httpOnly `uop_access` cookie → a locally-signed HS256 token (local
 *    password session) → verify + resolve the AppUser by `sub` + force-change gate.
 *  • otherwise an `Authorization: Bearer` header → an Entra token (v1 or v2 —
 *    both of the tenant's issuer forms are accepted) → RS256 via the tenant
 *    JWKS + aud / iss / exp → resolve/upsert the AppUser by `oid`.
 * `@Public()` routes skip validation (login / refresh / logout manage cookies
 * themselves). Entra config is optional (a local-only deployment need not set it);
 * the guard fails fast at boot only if NO provider is configured.
 *
 * Local dev can set AUTH_DEV_BYPASS=true to skip validation and run as the seed
 * ADMIN — never in production (ADR-0002 risk R-C). H4: tokens / signatures /
 * secrets are never logged, only the failure reason.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly devBypass: boolean;
  private readonly devUserEmail?: string;
  // Tuple, not string[] — jsonwebtoken's VerifyOptions takes a non-empty tuple.
  private readonly issuer?: [string, string];
  private readonly audience?: string;
  private readonly jwks?: JwksClient;
  private devUser?: AppUser;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly localJwt: LocalJwtService,
    config: ConfigService,
  ) {
    this.devBypass = config.get<string>('AUTH_DEV_BYPASS') === 'true';
    if (this.devBypass) {
      // Optional: run dev-bypass as a specific seeded user (e.g. an OPCO_IT to
      // exercise per-OpCo scope locally, AUTH-3a). Unset → seed ADMIN.
      this.devUserEmail =
        config.get<string>('AUTH_DEV_USER_EMAIL') || undefined;
      this.logger.warn(
        '⚠️  AUTH_DEV_BYPASS is ON — requests run as a seed user without token validation. Never use in production.',
      );
      return;
    }
    // Entra is optional (ADR-0005 dual-provider): set it up only if configured.
    const tenantId = config.get<string>('ENTRA_TENANT_ID');
    const audience = config.get<string>('ENTRA_API_AUDIENCE');
    if (tenantId && audience) {
      this.audience = audience;
      // Accept BOTH issuer forms for this tenant. Which one Entra stamps is a
      // property of the app registration (`accessTokenAcceptedVersion`), not of
      // our code: 2 → the v2.0 issuer, 1/null → the legacy sts.windows.net one.
      // Pinning only v2.0 makes a v1 registration fail in the most expensive way
      // possible — sign-in succeeds, then every request is 401 with nothing in
      // the error naming the token version (W44 B9). Both values are derived
      // from the same tenantId, so this widens nothing across tenants.
      this.issuer = [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ];
      this.jwks = new JwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        rateLimit: true,
      });
    }
    // Fail fast at boot if there is NO way to authenticate a request.
    const hasLocal = Boolean(config.get<string>('AUTH_JWT_SECRET'));
    if (!this.jwks && !hasLocal) {
      throw new Error(
        'No auth provider configured: set ENTRA_TENANT_ID + ENTRA_API_AUDIENCE (SSO) and/or AUTH_JWT_SECRET (local login).',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    if (this.devBypass) {
      req.user = await this.resolveDevUser();
      return true;
    }

    // Local session — the httpOnly access cookie (ADR-0006 §7). A cookie present
    // means this is a local session: verify it, resolve the AppUser, and enforce
    // the force-change gate. (Entra never sets this cookie.)
    const accessCookie = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (accessCookie) {
      const claims = this.localJwt.verify(accessCookie); // throws 401 on bad sig / exp
      const user = await this.resolveLocalUser(claims.sub);
      this.ensurePasswordChanged(user, req);
      req.user = user;
      return true;
    }

    // Entra path — a Bearer token in the Authorization header (MSAL). Unchanged.
    const token = this.extractBearer(req.headers?.authorization);
    if (!token) throw new UnauthorizedException('Missing credentials');
    if (!this.jwks) throw new UnauthorizedException('SSO is not configured');
    let payload: jwt.JwtPayload;
    try {
      payload = await this.verify(token);
    } catch (err) {
      // H4: log why, never the token itself.
      this.logger.warn(`Token rejected: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = await this.resolveUser(payload);
    return true;
  }

  /**
   * Force-change gate (ADR-0006 §5). A local account flagged mustChangePassword
   * may only call PATCH /me/password until it sets its own password — every other
   * route is 403. Defends the API even if the frontend gate is bypassed.
   */
  private ensurePasswordChanged(
    user: AppUser,
    req: { method?: string; url?: string },
  ): void {
    if (!user.mustChangePassword) return;
    const path = (req.url ?? '').split('?')[0];
    const isChangeRoute =
      req.method === 'PATCH' && path.endsWith('/me/password');
    if (!isChangeRoute) {
      throw new ForbiddenException('Password change required');
    }
  }

  /** Resolve the AppUser a local token was issued for (by `sub` = AppUser.id). */
  private async resolveLocalUser(id: string): Promise<AppUser> {
    const user = await this.prisma.appUser.findFirst({
      where: { id, active: true, authProvider: 'local' },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private extractBearer(header?: string): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  /** Verify signature (RS256 via JWKS) + audience + issuer + lifetime. */
  private verify(token: string): Promise<jwt.JwtPayload> {
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
          audience: this.audience,
          issuer: this.issuer,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            reject(err ?? new Error('malformed token'));
            return;
          }
          resolve(decoded);
        },
      );
    });
  }

  /**
   * Resolve/upsert the AppUser from the token's `oid` claim. First-seen users
   * auto-provision as REGIONAL (schema default); role elevation stays manual
   * (Entra app-role → claim mapping is an AUTH-2/3 concern).
   */
  private resolveUser(payload: jwt.JwtPayload): Promise<AppUser> {
    const entraOid = payload.oid as string | undefined;
    if (!entraOid) throw new UnauthorizedException('Token missing oid claim');
    const email =
      (payload.email as string) ??
      (payload.preferred_username as string) ??
      (payload.upn as string) ??
      entraOid;
    const displayName = (payload.name as string) ?? email;
    const now = new Date();
    return this.prisma.appUser.upsert({
      where: { entraOid },
      create: { entraOid, email, displayName, lastLoginAt: now },
      update: { email, displayName, lastLoginAt: now },
    });
  }

  /**
   * The AppUser dev-bypass runs as (cached). AUTH_DEV_USER_EMAIL picks a specific
   * seeded user (e.g. an OPCO_IT to test scope); unset or unmatched → seed ADMIN.
   * H4: log the resolved role + id only, never the email (PII).
   */
  private async resolveDevUser(): Promise<AppUser> {
    if (this.devUser) return this.devUser;
    let user: AppUser | null = null;
    if (this.devUserEmail) {
      user = await this.prisma.appUser.findFirst({
        where: { email: this.devUserEmail, active: true },
      });
      if (!user) {
        this.logger.warn(
          'AUTH_DEV_USER_EMAIL set but no matching active user — falling back to seed ADMIN.',
        );
      }
    }
    if (!user) {
      user = await this.prisma.appUser.findFirst({
        where: { role: 'ADMIN', active: true },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!user) {
      throw new UnauthorizedException(
        'AUTH_DEV_BYPASS is on but no ADMIN AppUser exists — run the seed.',
      );
    }
    this.logger.warn(`Dev-bypass running as role=${user.role} id=${user.id}.`);
    this.devUser = user;
    return user;
  }
}
