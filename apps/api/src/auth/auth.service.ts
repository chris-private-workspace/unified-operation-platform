import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { LocalJwtService } from './local-jwt.service';
import {
  RefreshTokenService,
  type IssuedRefresh,
} from './refresh-token.service';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { ChangePasswordDto } from './dto/password.dto';
import { validatePassword } from './password-policy';

// Per-account lockout (ADR-0006 §6). After LOCKOUT_THRESHOLD consecutive failed
// local logins the account is locked for LOCKOUT_MINUTES; during the lock every
// attempt returns the same generic 401 (no enumeration).
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

/**
 * A granted local session (ADR-0006 §7). The controller sets `accessToken` +
 * `refresh.rawToken` as httpOnly cookies and returns only `user` to the client —
 * neither token is ever exposed to page JS.
 */
export interface SessionGrant {
  accessToken: string;
  refresh: IssuedRefresh;
  user: MeDto;
}

/**
 * Local password authentication + lifecycle (ADR-0005 / ADR-0006). Verifies a
 * local AppUser's argon2id hash, issues a locally-signed JWT, and owns password
 * change + lockout. H4: password / hash / token are never logged; failures return
 * the same generic 401 so the response never reveals whether an account exists or
 * is locked.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly localJwt: LocalJwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<SessionGrant> {
    const invalid = () =>
      new UnauthorizedException('Invalid email or password');

    const user = await this.prisma.appUser.findUnique({
      where: { email: dto.email },
    });
    // Only active local-provider accounts with a hash can log in this way.
    if (
      !user ||
      !user.active ||
      user.authProvider !== 'local' ||
      !user.passwordHash
    ) {
      // No account to point at when the email is unknown — hence targetId
      // 'unknown' with the attempted address in metadata (Q1, Chris 2026-07-20).
      // Without it a failed login is just "someone failed", which makes
      // credential-stuffing detection impossible.
      await this.recordLoginFailure(user?.id, dto.email);
      throw invalid();
    }

    // Locked → generic 401 without touching the counter (don't leak the lock).
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordLoginFailure(user.id, dto.email);
      throw invalid();
    }

    let ok = false;
    try {
      ok = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      ok = false; // malformed hash etc. → failure, never leak the reason
    }
    if (!ok) {
      await this.registerFailedLogin(user);
      throw invalid();
    }

    // Success → clear the lockout window + stamp lastLoginAt, with the audit
    // row in the same transaction (ADR-0009 Decision 8.1).
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
        targetType: 'AppUser',
        targetId: user.id,
        actorId: user.id, // signing in is something you do to yourself
      });
    });

    return this.grantSession(user);
  }

  /**
   * Exchange a valid refresh token for a fresh session (ADR-0006 §7). Rotation
   * (revoke old + mint new) happens in RefreshTokenService; any bad token is a
   * generic 401. The account must still be an active local user — a deactivated
   * account can't refresh its way back in.
   */
  async refreshSession(rawRefresh: string): Promise<SessionGrant> {
    const rotated = await this.refreshTokens.rotate(rawRefresh); // 401 if invalid
    const user = await this.prisma.appUser.findFirst({
      where: { id: rotated.userId, active: true, authProvider: 'local' },
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const { accessToken } = this.localJwt.sign({
      id: user.id,
      role: user.role,
    });
    this.logger.log(`Local session refreshed: userId=${user.id}`);
    return {
      accessToken,
      refresh: { rawToken: rotated.rawToken, expiresAt: rotated.expiresAt },
      user: await this.buildSessionUser(user),
    };
  }

  /** Revoke the presented refresh token (idempotent — a missing / stale token is fine). */
  async logout(rawRefresh: string | undefined): Promise<void> {
    if (rawRefresh) await this.refreshTokens.revoke(rawRefresh);
  }

  /**
   * A signed-in local user changes their own password (AUTH-4c-A). Verifies the
   * current password, enforces the strict policy, then rehashes + clears the
   * force-change flag. SSO accounts have no local password to change.
   */
  async changePassword(user: AppUser, dto: ChangePasswordDto): Promise<void> {
    if (user.authProvider !== 'local' || !user.passwordHash) {
      throw new BadRequestException(
        'Password change is only available for local accounts',
      );
    }

    let ok = false;
    try {
      ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    } catch {
      ok = false;
    }
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const violation = validatePassword(dto.newPassword, {
      email: user.email,
      currentPassword: dto.currentPassword,
    });
    if (violation) throw new BadRequestException(violation);

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.appUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    this.logger.log(`Password changed: userId=${user.id}`);
  }

  /** Mint an access token + a fresh refresh token and assemble the session identity. */
  private async grantSession(user: AppUser): Promise<SessionGrant> {
    const { accessToken } = this.localJwt.sign({
      id: user.id,
      role: user.role,
    });
    const refresh = await this.refreshTokens.issue(user.id);
    // H4: log the outcome only — never email / password / token.
    this.logger.log(
      `Local session granted: userId=${user.id} role=${user.role}`,
    );
    return { accessToken, refresh, user: await this.buildSessionUser(user) };
  }

  /** The signed-in identity + OpCo scope (MeDto shape), shared by login / refresh. */
  private async buildSessionUser(user: AppUser): Promise<MeDto> {
    const opcoScope = user.opcoScopeId
      ? await this.prisma.opco.findUnique({
          where: { id: user.opcoScopeId },
          select: { code: true, displayName: true },
        })
      : null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      opcoScopeId: user.opcoScopeId,
      opcoScope,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /** Count a failed attempt; lock the account (fresh window) once the threshold is hit. */
  private async registerFailedLogin(user: AppUser): Promise<void> {
    const next = user.failedLoginCount + 1;
    const locking = next >= LOCKOUT_THRESHOLD;
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id: user.id },
        data: locking
          ? {
              failedLoginCount: 0, // reset so the post-lock window is a fresh N attempts
              lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
            }
          : { failedLoginCount: next },
      });
      // The attempt itself is always recorded…
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        targetType: 'AppUser',
        targetId: user.id,
        actorId: user.id,
        metadata: { emailAttempted: user.email },
      });
      // …and the lockout is a SEPARATE row. They are two different facts: the
      // Nth failure, and the account becoming unusable. Collapsing them would
      // make "when did this account get locked" unsearchable.
      if (locking) {
        await this.audit.log(tx, {
          action: AUDIT_ACTIONS.AUTH_LOCKED,
          targetType: 'AppUser',
          targetId: user.id,
          actorId: null,
          actorType: 'system', // the lock is enforced by the platform, not a person
          metadata: {
            reason: `${LOCKOUT_THRESHOLD} consecutive failed logins`,
          },
        });
      }
    });
    if (locking) {
      this.logger.warn(
        `Account locked for ${LOCKOUT_MINUTES}m after ${LOCKOUT_THRESHOLD} failed logins: userId=${user.id}`,
      );
    }
  }

  /**
   * Audit-only failure record for the paths that have no database write of
   * their own (unknown email / inactive account / already-locked account).
   *
   * PrismaService satisfies AuditTx — a single insert needs no interactive
   * transaction, and wrapping one row in $transaction would be ceremony.
   */
  private async recordLoginFailure(
    userId: string | undefined,
    emailAttempted: string,
  ): Promise<void> {
    await this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      targetType: 'AppUser',
      // Deliberately not the email: targetId is indexed and shown in the UI,
      // so PII stays in the whitelisted metadata field instead.
      targetId: userId ?? 'unknown',
      actorId: userId ?? null,
      metadata: { emailAttempted },
    });
  }
}
