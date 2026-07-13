import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

// Rotating refresh session (ADR-0006 §7 / AUTH-4c-B). A refresh token is an
// opaque high-entropy random string; only its SHA-256 hash is persisted, so a DB
// read never yields a usable token (H4). Rotation revokes the presented token and
// mints a fresh one — a stolen-then-replayed token fails once the legit client has
// rotated it. Access-token TTL (15min) lives in LocalJwtService.
const REFRESH_TTL_DAYS = 7;

export interface IssuedRefresh {
  rawToken: string; // returned once to be set as a cookie — never stored raw
  expiresAt: Date;
}

export interface RotatedRefresh extends IssuedRefresh {
  userId: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** SHA-256 is right here (not argon2): the token is already 256-bit random. */
  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /** Mint a refresh token for a user; persists only its hash. */
  async issue(userId: string): Promise<IssuedRefresh> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hash(rawToken), expiresAt },
    });
    return { rawToken, expiresAt };
  }

  /**
   * Rotate a presented refresh token: verify it is live, revoke it, and issue a
   * fresh one. Unknown / revoked / expired all raise a generic 401 (the caller
   * clears the cookies). The token itself is never logged.
   */
  async rotate(rawToken: string): Promise<RotatedRefresh> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const next = await this.issue(record.userId);
    return { userId: record.userId, ...next };
  }

  /** Revoke a presented refresh token if it is still live (idempotent — logout). */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
