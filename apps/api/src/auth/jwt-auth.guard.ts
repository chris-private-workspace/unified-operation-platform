import {
  CanActivate,
  ExecutionContext,
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

/**
 * Validates the Entra v2.0 access token on every request (ADR-0002): RS256
 * signature via the tenant JWKS, then aud / iss / exp, then resolves the AppUser
 * by the token's `oid` claim. `@Public()` routes skip validation.
 *
 * Local dev can set AUTH_DEV_BYPASS=true to skip token validation and run as the
 * seed ADMIN — never enable in production (ADR-0002 risk R-C). H4: the token /
 * signature / secrets are never logged, only the failure reason.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly devBypass: boolean;
  private readonly devUserEmail?: string;
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly jwks?: JwksClient;
  private devUser?: AppUser;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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
    // Prod path: Entra config is required (fail fast at boot if missing).
    const tenantId = config.getOrThrow<string>('ENTRA_TENANT_ID');
    this.audience = config.getOrThrow<string>('ENTRA_API_AUDIENCE');
    this.issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    this.jwks = new JwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
    });
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

    const token = this.extractBearer(req.headers?.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

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
