import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../prisma/prisma.service';

// RefreshTokenService uses real node:crypto (randomBytes / sha256); only Prisma is
// mocked. The point of these tests: a stored value is never the raw token, and
// rotation revokes-then-issues while unknown / revoked / expired all 401.
describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new RefreshTokenService(prisma as unknown as PrismaService);
  });

  describe('issue', () => {
    it('mints a 256-bit token and persists only its (different) SHA-256 hash', async () => {
      const { rawToken, expiresAt } = await service.issue('u1');

      expect(rawToken).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe('u1');
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
      expect(data.tokenHash).not.toBe(rawToken); // never store the raw token (H4)
    });
  });

  describe('rotate', () => {
    it('revokes the presented token and issues a fresh one', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await service.rotate('raw-token');

      expect(res.userId).toBe('u1');
      expect(res.rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt1' },
          data: { revokedAt: expect.any(Date) },
        }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1); // new token issued
    });

    it('401 on an unknown token (no revoke / issue)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotate('nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('401 on an already-revoked token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.rotate('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('401 on an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.rotate('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('marks a live token revoked (idempotent — only matches non-revoked)', async () => {
      await service.revoke('raw');
      const arg = prisma.refreshToken.updateMany.mock.calls[0][0];
      expect(arg.where.revokedAt).toBeNull();
      expect(arg.where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(arg.data).toEqual({ revokedAt: expect.any(Date) });
    });
  });
});
