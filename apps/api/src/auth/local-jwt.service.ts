import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/** Issuer claim that marks a locally-signed token (vs an Entra one) for the guard. */
export const LOCAL_JWT_ISSUER = 'uop-local';

// 8h access token (a work day). No refresh this phase — re-login on expiry
// (refresh tokens land in AUTH-4c, ADR-0005).
const EXPIRES_IN_SEC = 8 * 60 * 60;

export interface LocalJwtClaims extends jwt.JwtPayload {
  sub: string;
  role: string;
}

/**
 * Signs / verifies the locally-issued access token (ADR-0005). HS256 with
 * AUTH_JWT_SECRET — env only, never committed or logged (H4). The secret is read
 * lazily (on sign/verify), so the app still boots for dev-bypass / Entra-only
 * deployments that don't configure local auth; only actually using local login
 * requires the secret (getOrThrow → clear failure).
 */
@Injectable()
export class LocalJwtService {
  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    return this.config.getOrThrow<string>('AUTH_JWT_SECRET');
  }

  sign(user: { id: string; role: string }): {
    accessToken: string;
    expiresIn: number;
  } {
    const accessToken = jwt.sign({ role: user.role }, this.secret(), {
      algorithm: 'HS256',
      issuer: LOCAL_JWT_ISSUER,
      subject: user.id,
      expiresIn: EXPIRES_IN_SEC,
    });
    return { accessToken, expiresIn: EXPIRES_IN_SEC };
  }

  /** Verify signature (HS256) + issuer + lifetime. Throws 401 on any failure. */
  verify(token: string): LocalJwtClaims {
    try {
      const decoded = jwt.verify(token, this.secret(), {
        algorithms: ['HS256'],
        issuer: LOCAL_JWT_ISSUER,
      });
      if (typeof decoded === 'string' || !decoded.sub) {
        throw new Error('malformed local token');
      }
      return decoded as LocalJwtClaims;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
