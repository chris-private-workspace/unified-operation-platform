import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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
  failedLoginCount: 0,
  lockedUntil: null,
  mustChangePassword: false,
  passwordChangedAt: null,
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

  it('returns a token + identity (no hash) with mustChangePassword and resets the lockout', async () => {
    prisma.appUser.findUnique.mockResolvedValue(LOCAL_USER as never);
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    const res = await service.login(creds);

    expect(res.accessToken).toBe('signed.tok');
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

describe('AuthService.changePassword', () => {
  let service: AuthService;
  let prisma: { appUser: { update: jest.Mock } };
  const localJwt = { sign: jest.fn() } as unknown as LocalJwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { appUser: { update: jest.fn().mockResolvedValue({}) } };
    service = new AuthService(prisma as unknown as PrismaService, localJwt);
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
});
