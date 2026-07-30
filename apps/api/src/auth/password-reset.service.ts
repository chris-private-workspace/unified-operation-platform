import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { validatePassword } from './password-policy';

// AUTH-4c-C / ADR-0019 D8. TTL and cooldown are both plan-level decisions:
// 30 minutes (D8 #2) and 5 minutes per account (D8 #3, OQ-3) — one TTL window
// therefore allows at most 6 mails for a single account.
// Exported because the mail has to tell the user the same number. Two literals
// would drift the day one of them changes, and the reader would believe the mail.
export const RESET_TTL_MINUTES = 30;
const RESET_COOLDOWN_MINUTES = 5;

/**
 * What the caller needs to actually send the mail. Returned ONCE and never
 * stored: only the token's SHA-256 hash reaches the database.
 */
export interface IssuedReset {
  rawToken: string;
  email: string;
  displayName: string;
}

/**
 * Self-service password reset (AUTH-4c-C / ADR-0019 D8).
 *
 * ## Why this service does not send anything
 *
 * It owns the token lifecycle and the password write; the mail is the caller's
 * job. That keeps the enumeration-resistance rule (D8 #4 — always 204) in ONE
 * place at the edge, and it means this service can answer honestly (`null` =
 * nothing to send) instead of having to lie internally to protect a policy that
 * belongs to the HTTP layer.
 *
 * It also mirrors how CH-011 split things: the transport never learns who its
 * callers are, and the callers never learn how it delivers.
 *
 * ## H4
 *
 * The raw token is never logged, never persisted, never audited. The DB only
 * ever sees `tokenHash`, and `audit-fields.ts` lists `tokenHash` in
 * NEVER_AUDIT_EXACT as a second line of defence.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** SHA-256, not argon2 — identical reasoning to RefreshTokenService: the token is already 256-bit random. */
  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Mint a reset token for an eligible account.
   *
   * @returns what the caller needs to send the mail, or `null` when nothing
   *          should be sent. `null` covers four DIFFERENT situations on purpose
   *          — unknown address, SSO account, deactivated account, cooldown —
   *          because the caller must treat all of them identically (D8 #4).
   *          Which one it was is recorded in the audit row, not in the return
   *          value and never in the HTTP response.
   */
  async issue(email: string): Promise<IssuedReset | null> {
    // Same lookup as login (no normalisation) so "the address I log in with" is
    // exactly "the address I can reset with".
    const user = await this.prisma.appUser.findUnique({ where: { email } });

    // D8 #5 — only local accounts have a platform password to reset. An SSO user
    // gets the same 204 and no mail: telling them "use SSO" would confirm the
    // address exists.
    const eligible =
      !!user &&
      user.active &&
      user.authProvider === 'local' &&
      !!user.passwordHash;

    if (!eligible) {
      await this.recordRequest(user?.id, email, 'no-eligible-account');
      return null;
    }

    // Per-account cooldown (D8 #9). DB-based, so it costs no new dependency —
    // per-IP limiting would need @nestjs/throttler and is explicitly out of
    // scope (ADR-0019 D7).
    const since = new Date(Date.now() - RESET_COOLDOWN_MINUTES * 60_000);
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: since } },
      select: { id: true },
    });
    if (recent) {
      await this.recordRequest(user.id, email, 'cooldown');
      return null;
    }

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(rawToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });
    await this.recordRequest(user.id, email, 'issued');

    return {
      rawToken,
      email: user.email,
      displayName: user.displayName,
    };
  }

  /**
   * Spend a reset token: set the new password and close every door the old
   * credential could still open (D8 #6).
   *
   * Every rejection — unknown token, expired, already spent, account no longer
   * eligible — raises the SAME message. By this point the caller already holds a
   * token so enumeration is not the concern; the concern is that distinguishing
   * "expired" from "already used" tells an attacker whether they are one step
   * behind a real user.
   */
  async consume(rawToken: string, newPassword: string): Promise<void> {
    const invalid = () =>
      new BadRequestException('This reset link is invalid or has expired');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now() ||
      !record.user.active ||
      record.user.authProvider !== 'local'
    ) {
      throw invalid();
    }

    // Policy is the shared one (D8 #7) — `currentPassword` is deliberately not
    // passed: whoever is here does not know the old password, that is the point.
    const violation = validatePassword(newPassword, {
      email: record.user.email,
    });
    if (violation) throw new BadRequestException(violation);

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          // Clearing the lockout is not a nicety: without it, an account locked
          // by the very brute-force attempt that prompted the reset would still
          // be unusable after a successful reset, which reads as "it didn't
          // work" to the person who just proved they own the mailbox.
          failedLoginCount: 0,
          lockedUntil: null,
          // D8 #6 — never set to true here. A forced change is what an ADMIN
          // reset does (the password was handed to you); this password is one
          // the user chose, so there is nothing to force. Setting false also
          // clears a pending force-change: they have now chosen their own.
          mustChangePassword: false,
        },
      });

      // Single use, enforced by data rather than by remembering to check.
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      // D8 #6 — every existing session dies. Someone resetting their password
      // may be doing it precisely because they suspect a compromise; leaving the
      // attacker's refresh token alive would make the reset theatre.
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Reuses the existing action (D8 #8): the underlying fact — this account's
      // credential changed, by the account holder — is identical to the
      // self-service change, and an auditor asking "what happened to this
      // account's credentials" wants both in one query. actorId === targetId
      // marks it as self-service.
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.USER_PASSWORD_CHANGE,
        targetType: 'AppUser',
        targetId: record.userId,
        actorId: record.userId,
      });
    });

    // H4: id only — never the token, the password, or the hash.
    this.logger.log(`Password reset completed: userId=${record.userId}`);
  }

  /**
   * One audit row per request, whatever the outcome — this is the ONLY place the
   * outcome is visible (D8 #4 makes the HTTP response uniform), so it is what
   * abuse detection and "why did my user not get a mail" both run on.
   *
   * `emailAttempted` is an existing whitelisted metadata key (W29 Q1, added for
   * failed logins) and carries the same deliberate PII trade-off: without the
   * address, a flood of reset requests is just "someone asked", which cannot be
   * triaged. `targetId 'unknown'` follows the same precedent for an address with
   * no account behind it.
   */
  private async recordRequest(
    userId: string | undefined,
    email: string,
    reason: 'issued' | 'cooldown' | 'no-eligible-account',
  ): Promise<void> {
    await this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
      targetType: 'AppUser',
      targetId: userId ?? 'unknown',
      actorId: userId ?? null,
      actorType: userId ? undefined : 'system',
      metadata: { emailAttempted: email, reason },
    });
  }
}
