import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { LicenseController } from '../license/license.controller';
import { FulfilmentController } from '../fulfilment/fulfilment.controller';
import { ROLES_KEY } from './roles.decorator';

/**
 * D3 regression — both operational controllers must carry the class-level
 * @Roles(ADMIN, REGIONAL) so the global RolesGuard rejects everyone else.
 * (Before D3 these were unguarded `TODO(auth)` controllers.)
 */
describe('operational controllers are role-guarded (D3)', () => {
  const reflector = new Reflector();

  it.each([
    ['LicenseController', LicenseController],
    ['FulfilmentController', FulfilmentController],
  ])('%s requires ADMIN / REGIONAL', (_name, controller) => {
    const roles = reflector.get<Role[]>(ROLES_KEY, controller);
    expect(roles).toEqual([Role.ADMIN, Role.REGIONAL]);
  });
});
