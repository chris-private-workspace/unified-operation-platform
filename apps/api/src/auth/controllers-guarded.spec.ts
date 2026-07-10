import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { LicenseController } from '../license/license.controller';
import { FulfilmentController } from '../fulfilment/fulfilment.controller';
import { ROLES_KEY } from './roles.decorator';

/**
 * Both operational controllers must carry class-level @Roles so the global
 * RolesGuard rejects everyone else (W09 D3). AUTH-3a widens Fulfilment to
 * OPCO_IT (scoped in the services) and lets the License read GETs allow OPCO_IT
 * via a method-level override, while the write POSTs stay ADMIN / REGIONAL.
 */
describe('operational controllers are role-guarded', () => {
  const reflector = new Reflector();

  it('LicenseController class default = ADMIN / REGIONAL', () => {
    expect(reflector.get<Role[]>(ROLES_KEY, LicenseController)).toEqual([
      Role.ADMIN,
      Role.REGIONAL,
    ]);
  });

  it('FulfilmentController = ADMIN / REGIONAL / OPCO_IT (OPCO_IT scoped in services)', () => {
    expect(reflector.get<Role[]>(ROLES_KEY, FulfilmentController)).toEqual([
      Role.ADMIN,
      Role.REGIONAL,
      Role.OPCO_IT,
    ]);
  });

  // AUTH-3a OD2: read GETs override the class default to also allow OPCO_IT
  // (RolesGuard reads method-over-class); write POSTs keep no override.
  it.each([
    ['listCatalog', LicenseController.prototype.listCatalog],
    ['listDrift', LicenseController.prototype.listDrift],
  ])('license GET %s allows OPCO_IT (method-level override)', (_n, handler) => {
    expect(reflector.get<Role[]>(ROLES_KEY, handler)).toEqual([
      Role.ADMIN,
      Role.REGIONAL,
      Role.OPCO_IT,
    ]);
  });

  it.each([
    ['syncCatalog', LicenseController.prototype.syncCatalog],
    ['runReconcile', LicenseController.prototype.runReconcile],
  ])(
    'license write POST %s has no override (inherits ADMIN / REGIONAL)',
    (_n, handler) => {
      expect(reflector.get<Role[]>(ROLES_KEY, handler)).toBeUndefined();
    },
  );
});
