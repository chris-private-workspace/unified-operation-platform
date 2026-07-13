import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { LocalJwtService } from './local-jwt.service';
import { PrismaService } from '../prisma/prisma.service';

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
};

describe('AuthService.login', () => {
  let service: AuthService;
  let prisma: {
    appUser: { findUnique: jest.Mock; update: jest.Mock };
    opco: { findUnique: jest.Mock };
  };
  const localJwt = {
    sign: jest.fn(() => ({ accessToken: 'signed.tok', expiresIn: 28800 })),
  } as unknown as LocalJwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      appUser: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(LOCAL_USER as never),
      },
      opco: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    service = new AuthService(prisma as unknown as PrismaService, localJwt);
  });

  const creds = { email: 'admin@uop.local', password: 'pw' };

  it('returns a token + identity (no passwordHash) and stamps lastLoginAt', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER as never);
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    const res = await service.login(creds);

    expect(res.accessToken).toBe('signed.tok');
    expect(res.expiresIn).toBe(28800);
    expect(res.user).toEqual({
      id: 'u-local',
      email: 'admin@uop.local',
      displayName: 'Local Admin',
      role: 'ADMIN',
      opcoScopeId: null,
      opcoScope: null,
    });
    expect(res.user).not.toHaveProperty('passwordHash');
    expect(prisma.appUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-local' } }),
    );
  });

  it('401 on a wrong password (and does not sign a token)', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER as never);
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(localJwt.sign).not.toHaveBeenCalled();
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

  it('401 when the account is inactive', async () => {
    prisma.appUser.findUnique.mockResolvedValue({
      ...LOCAL_USER,
      active: false,
    } as never);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('401 when no such account exists', async () => {
    prisma.appUser.findUnique.mockResolvedValue(null);
    await expect(service.login(creds)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
