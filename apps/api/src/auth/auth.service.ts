import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LocalJwtService } from './local-jwt.service';
import { LoginDto, LoginResultDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/password.dto';
import { validatePassword } from './password-policy';

// Per-account lockout (ADR-0006 §6). After LOCKOUT_THRESHOLD consecutive failed
// local logins the account is locked for LOCKOUT_MINUTES; during the lock every
// attempt returns the same generic 401 (no enumeration).
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

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
  ) {}

  async login(dto: LoginDto): Promise<LoginResultDto> {
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
      throw invalid();
    }

    // Locked → generic 401 without touching the counter (don't leak the lock).
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
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

    // Success → clear the lockout window + stamp lastLoginAt.
    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });

    const { accessToken, expiresIn } = this.localJwt.sign({
      id: user.id,
      role: user.role,
    });
    // H4: log the outcome only — never email / password / token.
    this.logger.log(`Local login ok: userId=${user.id} role=${user.role}`);

    const opcoScope = user.opcoScopeId
      ? await this.prisma.opco.findUnique({
          where: { id: user.opcoScopeId },
          select: { code: true, displayName: true },
        })
      : null;

    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        opcoScopeId: user.opcoScopeId,
        opcoScope,
        mustChangePassword: user.mustChangePassword,
      },
    };
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

  /** Count a failed attempt; lock the account (fresh window) once the threshold is hit. */
  private async registerFailedLogin(user: AppUser): Promise<void> {
    const next = user.failedLoginCount + 1;
    const locking = next >= LOCKOUT_THRESHOLD;
    await this.prisma.appUser.update({
      where: { id: user.id },
      data: locking
        ? {
            failedLoginCount: 0, // reset so the post-lock window is a fresh N attempts
            lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
          }
        : { failedLoginCount: next },
    });
    if (locking) {
      this.logger.warn(
        `Account locked for ${LOCKOUT_MINUTES}m after ${LOCKOUT_THRESHOLD} failed logins: userId=${user.id}`,
      );
    }
  }
}
