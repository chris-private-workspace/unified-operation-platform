import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { LocalJwtService } from './local-jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

jest.mock('argon2');

const LOCAL_USER = {
  id: 'u-local',
  email: 'admin@uop.local',
  displayName: 'Local Admin',
  role: 'ADMIN',
  opcoScopeId: null,
  active: true,
  authProvider: 'local',
  passwordHash: 'argon2-hash',
  failedLoginCount: 0,
  lockedUntil: null,
  mustChangePassword: false,
  passwordChangedAt: null,
};

/** A RefreshTokenService stub — issue mints a fixed token, rotate/revoke are spies. */
function refreshTokensStub(): RefreshTokenService {
  return {
    issue: jest.fn().mockResolvedValue({
      rawToken: 'refresh.raw',
      expiresAt: new Date(Date.now() + 7 * 864e5),
    }),
    rotate: jest.fn(),
    revoke: jest.fn(),
  } as unknown as RefreshTokenService;
}

describe('AuthService.login', () => {
  let service: AuthService;
  let prisma: {
    appUser: { findUnique: jest.Mock; update: jest.Mock };
    opco: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  const localJwt = {
    sign: jest.fn(() => ({ accessToken: 'signed.tok', expiresIn: 900 })),
  } as unknown as LocalJwtService;
  let refreshTokens: RefreshTokenService;
  let audit: { log: jest.Mock; logChange: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      appUser: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(LOCAL_USER as never),
      },
      opco: { findUnique: jest.fn().mockResolvedValue(null) },
      // W29 F2b: run the callback against the same mock so existing
      // prisma.appUser.* assertions keep working untouched.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    refreshTokens = refreshTokensStub();
    audit = { log: jest.fn(), logChange: jest.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      localJwt,
      refreshTokens,
      audit as unknown as AuditService,
    );
  });

  const creds = { email: 'admin@uop.local', password: 'pw' };

  it('grants access + refresh + identity (no hash) with mustChangePassword and resets the lockout', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER as never);
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    const res = await service.login(creds);

    expect(res.accessToken).toBe('signed.tok');
    expect(refreshTokens.issue).toHaveBeenCalledWith('u-local');
    expect(res.refresh.rawToken).toBe('refresh.raw');
    expect(res.user).toEqual({
      id: 'u-local',
      email: 'admin@uop.local',
      displayName: 'Local Admin',
      role: 'ADMIN',
      opcoScopeId: null,
      opcoScope: null,
      mustChangePassword: false,
    });
    expect(res.user).not.toHaveProperty('passwordHash');
    // success clears the failed-login window
    expect(prisma.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginCount: 0,
          lockedUntil: null,
        }),
      }),
    );
  });

  it('401 on a wrong password and records a failed attempt (no token)', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER as never);
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(localJwt.sign).not.toHaveBeenCalled();
    expect(refreshTokens.issue).not.toHaveBeenCalled();
    expect(prisma.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginCount: 1 } }),
    );
  });

  it('locks the account on the 5th consecutive failure', async () => {
    prisma.appUser.findUnique.mockResolvedValue({
      ...LOCAL_USER,
      failedLoginCount: 4,
    } as never);
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const arg = prisma.appUser.update.mock.calls[0][0].data;
    expect(arg.failedLoginCount).toBe(0); // reset for a fresh post-lock window
    expect(arg.lockedUntil).toBeInstanceOf(Date);
  });

  it('401 while locked, without even verifying the password', async () => {
    prisma.appUser.findUnique.mockResolvedValue({
      ...LOCAL_USER,
      lockedUntil: new Date(Date.now() + 60_000),
    } as never);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(argon2.verify).not.toHaveBeenCalled();
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });

  it('401 when the account is not a local-provider account', async () => {
    prisma.appUser.findUnique.mockResolvedValue({
      ...LOCAL_USER,
      authProvider: 'entra',
      passwordHash: null,
    } as never);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(argon2.verify).not.toHaveBeenCalled();
  });

  it('401 when no such account exists', async () => {
    prisma.appUser.findUnique.mockResolvedValue(null);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.refreshSession', () => {
  let service: AuthService;
  let prisma: {
    appUser: { findFirst: jest.Mock };
    opco: { findUnique: jest.Mock };
  };
  let refreshTokens: {
    rotate: jest.Mock;
    issue: jest.Mock;
    revoke: jest.Mock;
  };
  const localJwt = {
    sign: jest.fn(() => ({ accessToken: 'new.access', expiresIn: 900 })),
  } as unknown as LocalJwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      appUser: { findFirst: jest.fn() },
      opco: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    refreshTokens = { rotate: jest.fn(), issue: jest.fn(), revoke: jest.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      localJwt,
      refreshTokens as unknown as RefreshTokenService,
      { log: jest.fn(), logChange: jest.fn() } as unknown as AuditService,
    );
  });

  it('rotates and returns a new session for an active local user', async () => {
    refreshTokens.rotate.mockResolvedValue({
      userId: 'u-local',
      rawToken: 'new.raw',
      expiresAt: new Date(Date.now() + 1000),
    });
    prisma.appUser.findFirst.mockResolvedValue(LOCAL_USER as never);

    const res = await service.refreshSession('old.raw');

    expect(refreshTokens.rotate).toHaveBeenCalledWith('old.raw');
    expect(res.accessToken).toBe('new.access');
    expect(res.refresh.rawToken).toBe('new.raw');
    expect(res.user.id).toBe('u-local');
  });

  it('401 when the account is no longer an active local user', async () => {
    refreshTokens.rotate.mockResolvedValue({
      userId: 'u-local',
      rawToken: 'new.raw',
      expiresAt: new Date(),
    });
    prisma.appUser.findFirst.mockResolvedValue(null);
    await expect(service.refreshSession('old.raw')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates the 401 when the refresh token is invalid', async () => {
    refreshTokens.rotate.mockRejectedValue(
      new UnauthorizedException('Invalid refresh token'),
    );
    await expect(service.refreshSession('bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.appUser.findFirst).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout', () => {
  it('revokes the presented refresh token', async () => {
    const refreshTokens = { revoke: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      {} as PrismaService,
      {} as LocalJwtService,
      refreshTokens as unknown as RefreshTokenService,
      { log: jest.fn(), logChange: jest.fn() } as unknown as AuditService,
    );
    await service.logout('raw');
    expect(refreshTokens.revoke).toHaveBeenCalledWith('raw');
  });

  it('no-ops when there is no refresh token', async () => {
    const refreshTokens = { revoke: jest.fn() };
    const service = new AuthService(
      {} as PrismaService,
      {} as LocalJwtService,
      refreshTokens as unknown as RefreshTokenService,
      { log: jest.fn(), logChange: jest.fn() } as unknown as AuditService,
    );
    await service.logout(undefined);
    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});

describe('AuthService.changePassword', () => {
  let service: AuthService;
  let prisma: { appUser: { update: jest.Mock }; $transaction: jest.Mock };
  let audit: { log: jest.Mock; logChange: jest.Mock };
  const localJwt = { sign: jest.fn() } as unknown as LocalJwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      appUser: { update: jest.fn().mockResolvedValue({}) },
      // Run the callback against the same mock so the existing
      // prisma.appUser.update assertions keep working untouched.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { log: jest.fn(), logChange: jest.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      localJwt,
      refreshTokensStub(),
      audit as unknown as AuditService,
    );
  });

  const dto = { currentPassword: 'OldStr0ng!99', newPassword: 'NewStr0ng!99' };

  it('rehashes, clears mustChangePassword and stamps passwordChangedAt', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (argon2.hash as jest.Mock).mockResolvedValue('new-hash');

    await service.changePassword(LOCAL_USER as never, dto);

    expect(prisma.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-local' },
        data: expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: false,
          passwordChangedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('401 when the current password is wrong', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await expect(
      service.changePassword(LOCAL_USER as never, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });

  it('400 when the new password violates the policy', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    await expect(
      service.changePassword(LOCAL_USER as never, {
        currentPassword: 'OldStr0ng!99',
        newPassword: 'weak',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });

  it('400 for a non-local account', async () => {
    await expect(
      service.changePassword(
        { ...LOCAL_USER, authProvider: 'entra', passwordHash: null } as never,
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * Chris approved auditing self-service password change (2026-07-21) — it was
   * the one credential event ADR-0009 Decision 4 left out. Kept event-only and
   * named user.password_change so it sits beside user.password_reset.
   */
  describe('audit trail', () => {
    it('records the change inside the same transaction, attributed to the user', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (argon2.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword(LOCAL_USER as never, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'user.password_change',
          targetType: 'AppUser',
          // actorId === targetId is what marks this as self-service, as
          // opposed to an admin reset of someone else's password.
          targetId: 'u-local',
          actorId: 'u-local',
        }),
      );
    });

    // The audited payload must never carry the password or its hash (H4).
    it('never puts the password or hash in the audit entry', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (argon2.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword(LOCAL_USER as never, dto);

      const entry = JSON.stringify(audit.log.mock.calls[0][1]);
      expect(entry).not.toContain('new-hash');
      expect(entry).not.toContain(dto.newPassword);
      expect(entry).not.toContain(dto.currentPassword);
    });

    it('writes no audit row when the current password is wrong', async () => {
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(LOCAL_USER as never, dto),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});

/**
 * W29 F2b — sign-in outcomes are audit events (ADR-0009 Decision 4).
 * Q1 (Chris, 2026-07-20): the attempted email is recorded in metadata, because
 * without it a failed login cannot tell you WHICH account is being probed.
 */
describe('AuthService audit trail', () => {
  let service: AuthService;
  let prisma: {
    appUser: { findUnique: jest.Mock; update: jest.Mock };
    opco: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock; logChange: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      appUser: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      opco: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { log: jest.fn(), logChange: jest.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      {
        sign: jest.fn(() => ({ accessToken: 't', expiresIn: 900 })),
      } as unknown as LocalJwtService,
      refreshTokensStub(),
      audit as unknown as AuditService,
    );
  });

  const entries = () => audit.log.mock.calls.map((c) => c[1]);

  it('records auth.login_success in the same transaction as the lastLoginAt write', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER);
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await service.login({ email: 'admin@uop.local', password: 'pw' });

    expect(audit.log).toHaveBeenCalledWith(
      prisma, // same handle the update used
      expect.objectContaining({
        action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
        targetId: 'u-local',
        actorId: 'u-local',
      }),
    );
  });

  it('records auth.login_failed with the attempted email on a wrong password', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'admin@uop.local', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(entries()).toContainEqual(
      expect.objectContaining({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        targetId: 'u-local',
        metadata: { emailAttempted: 'admin@uop.local' },
      }),
    );
  });

  // The email is deliberately NOT the targetId: that column is indexed and
  // surfaced in the UI, so PII stays in the whitelisted metadata field.
  it('records an unknown email as targetId "unknown", email in metadata', async () => {
    prisma.appUser.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@nowhere.test', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(entries()).toContainEqual(
      expect.objectContaining({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        targetId: 'unknown',
        actorId: null,
        metadata: { emailAttempted: 'ghost@nowhere.test' },
      }),
    );
  });

  /**
   * Two separate rows on the lockout attempt: the Nth failure, and the account
   * becoming unusable. Collapsing them would make "when was this account
   * locked" unsearchable.
   */
  it('writes both login_failed and locked when the threshold is hit', async () => {
    prisma.appUser.findUnique.mockResolvedValue({
      ...LOCAL_USER,
      failedLoginCount: 4, // this attempt is the 5th
    });
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'admin@uop.local', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const actions = entries().map((e) => e.action);
    expect(actions).toContain(AUDIT_ACTIONS.AUTH_LOGIN_FAILED);
    expect(actions).toContain(AUDIT_ACTIONS.AUTH_LOCKED);

    // The lock is enforced by the platform, not performed by a person.
    expect(entries()).toContainEqual(
      expect.objectContaining({
        action: AUDIT_ACTIONS.AUTH_LOCKED,
        actorId: null,
        actorType: 'system',
      }),
    );
  });

  it('records a failure against an already-locked account without touching the counter', async () => {
    prisma.appUser.findUnique.mockResolvedValue({
      ...LOCAL_USER,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(
      service.login({ email: 'admin@uop.local', password: 'pw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(entries()).toContainEqual(
      expect.objectContaining({ action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED }),
    );
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });
});
