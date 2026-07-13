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
  };

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
    };
    service = new UserAdminService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('hashes the password, stores a local account, and never returns the hash', async () => {
      prisma.appUser.findUnique.mockResolvedValue(null); // no email clash
      prisma.appUser.create.mockResolvedValue(rowWithScope());

      const res = await service.create(ADMIN, {
        email: 'new@uop.local',
        displayName: 'New User',
        role: Role.REGIONAL,
        initialPassword: 'sup3rsecret',
      });

      expect(argon2.hash).toHaveBeenCalledWith('sup3rsecret');
      expect(prisma.appUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authProvider: 'local',
            passwordHash: 'argon2-hash',
            role: Role.REGIONAL,
            opcoScopeId: null,
          }),
        }),
      );
      expect(res).not.toHaveProperty('passwordHash');
    });

    it('rejects OPCO_IT without an OpCo scope (400)', async () => {
      await expect(
        service.create(ADMIN, {
          email: 'o@uop.local',
          displayName: 'O',
          role: Role.OPCO_IT,
          initialPassword: 'sup3rsecret',
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
        initialPassword: 'sup3rsecret',
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
        initialPassword: 'sup3rsecret',
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
          initialPassword: 'sup3rsecret',
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
});
