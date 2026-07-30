import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

// argon2 is mocked: hashing is not what these tests are about and a real argon2
// call per case would dominate the runtime. node:crypto stays REAL — the token
// and its hash are exactly what we are asserting on (H4).
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$mock'),
}));

const LOCAL_USER = {
  id: 'u1',
  email: 'ops@example.com',
  displayName: 'Ops User',
  active: true,
  authProvider: 'local',
  passwordHash: '$argon2id$old',
};

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let audit: { log: jest.Mock };
  let prisma: {
    appUser: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      appUser: {
        findUnique: jest.fn().mockResolvedValue(LOCAL_USER),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null), // no cooldown row by default
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      // Same shape the rest of the repo uses: hand the callback the same mock,
      // so a call inside the transaction is observable on the same spies.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  const reasonOf = (call: number) =>
    (audit.log.mock.calls[call][1].metadata as { reason: string }).reason;

  describe('issue — happy path', () => {
    it('mints a 256-bit token and stores only its (different) SHA-256 hash', async () => {
      const issued = await service.issue('ops@example.com');

      expect(issued).not.toBeNull();
      expect(issued!.rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(issued!.email).toBe('ops@example.com');
      expect(issued!.displayName).toBe('Ops User');

      const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe('u1');
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      // 🔴 H4: what lands in the DB must not be the thing that lands in the mail.
      expect(data.tokenHash).not.toBe(issued!.rawToken);
      // TTL 30 minutes (D8 #2) — assert the window, not the exact millisecond.
      const ttlMs = data.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(29 * 60_000);
      expect(ttlMs).toBeLessThanOrEqual(30 * 60_000);
    });

    it('audits the request with the address and reason=issued', async () => {
      await service.issue('ops@example.com');

      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][1];
      expect(entry.action).toBe(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED);
      expect(entry.targetId).toBe('u1');
      expect(entry.metadata).toEqual({
        emailAttempted: 'ops@example.com',
        reason: 'issued',
      });
    });
  });

  /**
   * 🔴 G1. Every one of these must look IDENTICAL from outside — the caller
   * turns all of them into the same 204 (D8 #4). Asserting `null` alone would
   * pass even if the service happily minted a token first, so each case also
   * asserts that nothing was created.
   */
  describe('issue — nothing is sent, and nothing is created', () => {
    it('unknown address', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);

      expect(await service.issue('nobody@example.com')).toBeNull();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(reasonOf(0)).toBe('no-eligible-account');
      // No account to point at — same precedent as a failed login (W29 Q1).
      expect(audit.log.mock.calls[0][1].targetId).toBe('unknown');
    });

    it('SSO account (no platform password to reset)', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        ...LOCAL_USER,
        authProvider: 'entra',
        passwordHash: null,
      });

      expect(await service.issue('ops@example.com')).toBeNull();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(reasonOf(0)).toBe('no-eligible-account');
    });

    it('deactivated account', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        ...LOCAL_USER,
        active: false,
      });

      expect(await service.issue('ops@example.com')).toBeNull();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(reasonOf(0)).toBe('no-eligible-account');
    });

    it('within the 5-minute cooldown', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'prt-recent',
      });

      expect(await service.issue('ops@example.com')).toBeNull();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(reasonOf(0)).toBe('cooldown');

      // The window itself must be 5 minutes, not "some window". Bounds are loose
      // by a few seconds because the service and this assertion read the clock at
      // different moments — still tight enough that 1 or 15 minutes would fail.
      const where = prisma.passwordResetToken.findFirst.mock.calls[0][0].where;
      const windowMs = Date.now() - where.createdAt.gt.getTime();
      expect(windowMs).toBeGreaterThan(4.9 * 60_000);
      expect(windowMs).toBeLessThan(5.1 * 60_000);
    });
  });

  describe('consume — rejection', () => {
    const live = {
      id: 'prt1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: LOCAL_USER,
    };

    const expectNoWrite = async (promise: Promise<unknown>) => {
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    };

    it('unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expectNoWrite(service.consume('nope', 'Str0ng!Passw0rd'));
    });

    it('already-used token (G2 — single use)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...live,
        usedAt: new Date(),
      });
      await expectNoWrite(service.consume('raw', 'Str0ng!Passw0rd'));
    });

    it('expired token (G3)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...live,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expectNoWrite(service.consume('raw', 'Str0ng!Passw0rd'));
    });

    it('account deactivated after the token was issued', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...live,
        user: { ...LOCAL_USER, active: false },
      });
      await expectNoWrite(service.consume('raw', 'Str0ng!Passw0rd'));
    });

    it('weak password is rejected by the SHARED policy, and writes nothing (G6)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(live);
      // 'short' fails the shared validatePassword(); if this service ever grew
      // its own rules this assertion is what would catch the divergence.
      await expectNoWrite(service.consume('raw', 'short'));
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    });

    it('looks the same whether the token is unknown, expired or spent', async () => {
      const messages: string[] = [];
      for (const row of [
        null,
        { ...live, usedAt: new Date() },
        { ...live, expiresAt: new Date(Date.now() - 1000) },
      ]) {
        prisma.passwordResetToken.findUnique.mockResolvedValue(row);
        await service
          .consume('raw', 'Str0ng!Passw0rd')
          .catch((e: Error) => messages.push(e.message));
      }
      expect(new Set(messages).size).toBe(1); // one message, three causes
    });
  });

  describe('consume — success (G5, every door closed)', () => {
    beforeEach(() => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: LOCAL_USER,
      });
    });

    it('rehashes, clears the lockout, and does NOT force another change', async () => {
      await service.consume('raw', 'Str0ng!Passw0rd');

      const data = prisma.appUser.update.mock.calls[0][0].data;
      expect(data.passwordHash).toBe('$argon2id$mock');
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
      // Locked out by the very attack that prompted the reset → must be usable.
      expect(data.failedLoginCount).toBe(0);
      expect(data.lockedUntil).toBeNull();
      // D8 #6 — this password was chosen by the user, so nothing to force.
      expect(data.mustChangePassword).toBe(false);
    });

    it('spends the token', async () => {
      await service.consume('raw', 'Str0ng!Passw0rd');
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('🔴 revokes every live session — otherwise the reset is theatre', async () => {
      await service.consume('raw', 'Str0ng!Passw0rd');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('audits as a self-service change (actorId === targetId)', async () => {
      await service.consume('raw', 'Str0ng!Passw0rd');
      const entry = audit.log.mock.calls[0][1];
      expect(entry.action).toBe(AUDIT_ACTIONS.USER_PASSWORD_CHANGE);
      expect(entry.targetId).toBe('u1');
      expect(entry.actorId).toBe('u1');
    });

    it('does all of it inside ONE transaction', async () => {
      await service.consume('raw', 'Str0ng!Passw0rd');
      // A password written without its session revocation (or without its audit
      // row) is exactly the half-applied state ADR-0009 Decision 8.1 forbids.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
