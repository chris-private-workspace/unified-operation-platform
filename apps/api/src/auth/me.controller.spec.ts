import { MeController } from './me.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from './auth.service';
import type { AuthUser } from './current-user.decorator';

// AuthService is only used by PATCH /me/password, not GET /me — a stub is enough.
const auth = {} as unknown as AuthService;

describe('MeController (GET /me, AUTH-3a)', () => {
  it('REGIONAL / ADMIN → identity with opcoScope null (no OpCo lookup)', async () => {
    const findUnique = jest.fn();
    const prisma = { opco: { findUnique } } as unknown as PrismaService;
    const user = {
      id: 'u1',
      email: 'a@x',
      displayName: 'Admin',
      role: 'ADMIN',
      opcoScopeId: null,
      mustChangePassword: false,
    } as unknown as AuthUser;

    const me = await new MeController(prisma, auth).me(user);

    expect(me).toEqual({
      id: 'u1',
      email: 'a@x',
      displayName: 'Admin',
      role: 'ADMIN',
      opcoScopeId: null,
      opcoScope: null,
      mustChangePassword: false,
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('OPCO_IT → resolves the scoped OpCo code + displayName', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ code: 'RHK', displayName: 'RHK' });
    const prisma = { opco: { findUnique } } as unknown as PrismaService;
    const user = {
      id: 'u2',
      email: 'o@x',
      displayName: 'RHK OpCo IT',
      role: 'OPCO_IT',
      opcoScopeId: 'rhk-id',
    } as unknown as AuthUser;

    const me = await new MeController(prisma, auth).me(user);

    expect(me.role).toBe('OPCO_IT');
    expect(me.opcoScopeId).toBe('rhk-id');
    expect(me.opcoScope).toEqual({ code: 'RHK', displayName: 'RHK' });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rhk-id' } }),
    );
  });
});
