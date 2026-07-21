import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AppUser } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserAdminService } from './user-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

jest.mock('argon2');

const ADMIN = {
  id: 'actor-admin',
  role: Role.ADMIN,
  active: true,
} as unknown as AppUser;

// A created/updated row as Prisma returns it (with the opcoScope relation).
const rowWithScope = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'new@uop.local',
  displayName: 'New User',
  role: Role.REGIONAL,
  opcoScopeId: null,
  opcoScope: null,
  authProvider: 'local',
  active: true,
  lastLoginAt: null,
  mustChangePassword: false,
  passwordHash: 'argon2-hash', // present on the row — must NOT survive mapping
  ...over,
});

describe('UserAdminService', () => {
  let service: UserAdminService;
  let prisma: {
    appUser: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    opco: { findFirst: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock; logChange: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    (argon2.hash as jest.Mock).mockResolvedValue('argon2-hash');
    prisma = {
      appUser: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      opco: { findFirst: jest.fn(), findMany: jest.fn() },
      // W29 F2a: run the callback against the same mock, so every existing
      // assertion on prisma.appUser.* keeps working untouched.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { log: jest.fn(), logChange: jest.fn().mockResolvedValue(true) };
    service = new UserAdminService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('hashes the password, stores a local account, and never returns the hash', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null); // no email clash
      prisma.appUser.create.mockResolvedValue(rowWithScope());

      const res = await service.create(ADMIN, {
        email: 'new@uop.local',
        displayName: 'New User',
        role: Role.REGIONAL,
        initialPassword: 'Sup3r!Secret9',
      });

      expect(argon2.hash).toHaveBeenCalledWith('Sup3r!Secret9');
      expect(prisma.appUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authProvider: 'local',
            passwordHash: 'argon2-hash',
            role: Role.REGIONAL,
            opcoScopeId: null,
            mustChangePassword: true, // force-change the admin-set password
          }),
        }),
      );
      expect(res).not.toHaveProperty('passwordHash');
    });

    it('rejects an initial password that fails the strict policy (400)', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);
      await expect(
        service.create(ADMIN, {
          email: 'weak@uop.local',
          displayName: 'Weak',
          role: Role.REGIONAL,
          initialPassword: 'short', // < 12, < 3 classes
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.create).not.toHaveBeenCalled();
    });

    it('rejects OPCO_IT without an OpCo scope (400)', async () => {
      await expect(
        service.create(ADMIN, {
          email: 'o@uop.local',
          displayName: 'O',
          role: Role.OPCO_IT,
          initialPassword: 'Sup3r!Secret9',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.create).not.toHaveBeenCalled();
    });

    it('stores an OPCO_IT scope when the OpCo exists', async () => {
      prisma.opco.findFirst.mockResolvedValue({ id: 'opco-rhk' });
      prisma.appUser.findUnique.mockResolvedValue(null);
      prisma.appUser.create.mockResolvedValue(
        rowWithScope({ role: Role.OPCO_IT, opcoScopeId: 'opco-rhk' }),
      );

      await service.create(ADMIN, {
        email: 'o@uop.local',
        displayName: 'O',
        role: Role.OPCO_IT,
        opcoScopeId: 'opco-rhk',
        initialPassword: 'Sup3r!Secret9',
      });

      expect(prisma.appUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ opcoScopeId: 'opco-rhk' }),
        }),
      );
    });

    it('forces scope to null for a non-OPCO_IT role even if one is passed', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);
      prisma.appUser.create.mockResolvedValue(rowWithScope());

      await service.create(ADMIN, {
        email: 'a@uop.local',
        displayName: 'A',
        role: Role.ADMIN,
        opcoScopeId: 'opco-rhk',
        initialPassword: 'Sup3r!Secret9',
      });

      expect(prisma.opco.findFirst).not.toHaveBeenCalled();
      expect(prisma.appUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ opcoScopeId: null }),
        }),
      );
    });

    it('409 when the email already exists', async () => {
      prisma.appUser.findUnique.mockResolvedValue({ id: 'exists' });
      await expect(
        service.create(ADMIN, {
          email: 'dupe@uop.local',
          displayName: 'D',
          role: Role.REGIONAL,
          initialPassword: 'Sup3r!Secret9',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.appUser.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('404 when the target does not exist', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);
      await expect(
        service.update(ADMIN, 'ghost', { active: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('changes role and active for an existing user', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'u2',
        role: Role.REGIONAL,
        active: true,
        opcoScopeId: null,
      });
      prisma.appUser.update.mockResolvedValue(
        rowWithScope({ id: 'u2', role: Role.REGIONAL, active: false }),
      );

      await service.update(ADMIN, 'u2', { active: false });

      expect(prisma.appUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u2' },
          data: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('blocks deactivating your own account (400)', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: ADMIN.id,
        role: Role.ADMIN,
        active: true,
        opcoScopeId: null,
      });
      prisma.appUser.count.mockResolvedValue(1); // another admin exists
      await expect(
        service.update(ADMIN, ADMIN.id, { active: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.update).not.toHaveBeenCalled();
    });

    it('blocks demoting/deactivating the last active admin (400)', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'only-admin',
        role: Role.ADMIN,
        active: true,
        opcoScopeId: null,
      });
      prisma.appUser.count.mockResolvedValue(0); // no other active admin
      await expect(
        service.update(ADMIN, 'only-admin', { role: Role.REGIONAL }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.update).not.toHaveBeenCalled();
    });

    it('allows demoting an admin when another active admin remains', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'admin-2',
        role: Role.ADMIN,
        active: true,
        opcoScopeId: null,
      });
      prisma.appUser.count.mockResolvedValue(1);
      prisma.appUser.update.mockResolvedValue(
        rowWithScope({ id: 'admin-2', role: Role.REGIONAL }),
      );

      await service.update(ADMIN, 'admin-2', { role: Role.REGIONAL });

      expect(prisma.appUser.update).toHaveBeenCalled();
    });

    it('rejects promoting to OPCO_IT without a scope (400)', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'u3',
        role: Role.REGIONAL,
        active: true,
        opcoScopeId: null,
      });
      await expect(
        service.update(ADMIN, 'u3', { role: Role.OPCO_IT }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    it('rehashes and forces a change on next login', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'u9',
        email: 'u9@uop.local',
        authProvider: 'local',
      });

      await service.resetPassword(ADMIN, 'u9', {
        newPassword: 'Res3t!Password9',
      });

      expect(argon2.hash).toHaveBeenCalledWith('Res3t!Password9');
      expect(prisma.appUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u9' },
          data: expect.objectContaining({
            passwordHash: 'argon2-hash',
            mustChangePassword: true,
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('404 when the user does not exist', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword(ADMIN, 'ghost', {
          newPassword: 'Res3t!Password9',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 for an SSO (non-local) account', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'sso',
        email: 'sso@rapo.com.hk',
        authProvider: 'entra',
      });
      await expect(
        service.resetPassword(ADMIN, 'sso', {
          newPassword: 'Res3t!Password9',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.update).not.toHaveBeenCalled();
    });

    it('400 when the new password fails the strict policy', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'u9',
        email: 'u9@uop.local',
        authProvider: 'local',
      });
      await expect(
        service.resetPassword(ADMIN, 'u9', { newPassword: 'weak' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appUser.update).not.toHaveBeenCalled();
    });
  });

  /**
   * W29 F2a — every identity write leaves a trail (ADR-0009 Decision 4), and
   * it shares the operation's transaction (Decision 8.1).
   */
  describe('audit trail', () => {
    const existing = (over: Record<string, unknown> = {}) => ({
      id: 'u2',
      email: 'u2@uop.local',
      displayName: 'U Two',
      role: Role.REGIONAL,
      active: true,
      opcoScopeId: null,
      ...over,
    });

    it('records user.create with the raw row (service does the whitelisting)', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);
      const created = rowWithScope();
      prisma.appUser.create.mockResolvedValue(created);

      await service.create(ADMIN, {
        email: 'new@uop.local',
        displayName: 'New User',
        role: Role.REGIONAL,
        initialPassword: 'Sup3r!Secret9',
      });

      expect(audit.log).toHaveBeenCalledWith(
        prisma, // same handle the write used → same transaction (Decision 8.1)
        expect.objectContaining({
          action: AUDIT_ACTIONS.USER_CREATE,
          targetType: 'AppUser',
          targetId: 'u1',
          actorId: ADMIN.id,
          after: created,
        }),
      );
    });

    it('labels a role change as user.role_change', async () => {
      prisma.appUser.findUnique.mockResolvedValue(existing());
      prisma.appUser.count.mockResolvedValue(1);
      prisma.appUser.update.mockResolvedValue(
        rowWithScope({ id: 'u2', role: Role.ADMIN }),
      );

      await service.update(ADMIN, 'u2', { role: Role.ADMIN });

      expect(audit.logChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
          targetId: 'u2',
        }),
      );
    });

    it('labels a plain deactivation as user.deactivate', async () => {
      prisma.appUser.findUnique.mockResolvedValue(existing());
      prisma.appUser.count.mockResolvedValue(1);
      prisma.appUser.update.mockResolvedValue(
        rowWithScope({ id: 'u2', active: false }),
      );

      await service.update(ADMIN, 'u2', { active: false });

      expect(audit.logChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: AUDIT_ACTIONS.USER_DEACTIVATE }),
      );
    });

    /**
     * The labelling rule that matters: searching `user.role_change` must return
     * EVERY privilege change, including one bundled with a deactivation.
     */
    it('prefers role_change when a demotion and a deactivation happen together', async () => {
      prisma.appUser.findUnique.mockResolvedValue(
        existing({ role: Role.ADMIN }),
      );
      prisma.appUser.count.mockResolvedValue(1); // another admin exists
      prisma.appUser.update.mockResolvedValue(
        rowWithScope({ id: 'u2', role: Role.REGIONAL, active: false }),
      );

      await service.update(ADMIN, 'u2', {
        role: Role.REGIONAL,
        active: false,
      });

      expect(audit.logChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: AUDIT_ACTIONS.USER_ROLE_CHANGE }),
      );
    });

    // The hash and its lifecycle flags are either useless or a leak — the
    // auditable fact is "who reset whose password, when".
    it('records user.password_reset as an event with no before/after', async () => {
      prisma.appUser.findUnique.mockResolvedValue({
        id: 'u9',
        email: 'u9@uop.local',
        authProvider: 'local',
      });
      prisma.appUser.update.mockResolvedValue({});

      await service.resetPassword(ADMIN, 'u9', {
        newPassword: 'Sup3r!Secret9',
      });

      const entry = audit.log.mock.calls.at(-1)![1];
      expect(entry.action).toBe(AUDIT_ACTIONS.USER_PASSWORD_RESET);
      expect(entry.targetId).toBe('u9');
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
    });

    // A failed operation must not leave an audit row claiming it happened.
    it('writes no audit row when the operation is rejected', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null);
      await expect(
        service.update(ADMIN, 'ghost', { active: false }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(audit.log).not.toHaveBeenCalled();
      expect(audit.logChange).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
