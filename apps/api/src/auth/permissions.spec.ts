import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { derivePermissions, REVIEWED_AUTHENTICATED } from './permissions';
import { ROLES_KEY } from './roles.decorator';
import { PermissionsController } from './permissions.controller';

/**
 * W28 F3 — drift protection for the permission matrix.
 *
 * Controllers are discovered by globbing `*.controller.ts`, NOT by importing
 * AppModule: jest cannot load it (jwks-rsa → jose is ESM). Globbing is also
 * what makes these tests meaningful — a NEW controller is picked up with nobody
 * editing a list, so "forgot the guard" surfaces on its own.
 *
 * Complements `controllers-guarded.spec.ts`, which asserts INTENT for three
 * controllers ("this one is meant to be ADMIN-only"). This file locks the
 * CURRENT STATE of every route. Intent and state are different questions; both
 * are worth failing on.
 */

function loadControllers(): unknown[] {
  const srcRoot = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.controller.ts')) files.push(full);
    }
  };
  walk(srcRoot);

  const controllers: unknown[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] === 'function' && key.endsWith('Controller')) {
        controllers.push(mod[key]);
      }
    }
  }
  return controllers;
}

describe('permission matrix (derived from @Roles)', () => {
  const matrix = derivePermissions(loadControllers());
  const find = (method: string, path: string) =>
    matrix.find((e) => e.method === method && e.path === path);

  it('discovers every controller in src', () => {
    const names = new Set(matrix.map((e) => e.controller));
    // All registered controllers must appear. If a new one is added this
    // count changes — that is intended, update it deliberately.
    expect(names).toEqual(
      new Set([
        'AuditController', // W29 F3 — GET /admin/audit, @Roles(ADMIN)
        'AuthController',
        'FulfilmentController',
        'IntakeController',
        'LicenseController',
        'MeController',
        'OpcoAdminController',
        'OpcoController',
        'OutboundRequestController',
        'PermissionsController',
        'UserAdminController',
      ]),
    );
  });

  /**
   * THE load-bearing test. Any route with no @Roles that is not on the reviewed
   * allow-list lands here. If this goes red: a route is reachable by ANY
   * signed-in user (including OPCO_IT). Either add @Roles, or — if that really
   * is intended — add it to REVIEWED_AUTHENTICATED, which is a security
   * decision, not a formality.
   */
  it('has no unguarded routes', () => {
    const unguarded = matrix
      .filter((e) => e.access === 'unguarded')
      .map((e) => `${e.method} ${e.path} (${e.controller}.${e.handler})`);
    expect(unguarded).toEqual([]);
  });

  it('only the reviewed routes are open to any signed-in user', () => {
    const authenticated = matrix
      .filter((e) => e.access === 'authenticated')
      .map((e) => `${e.method} ${e.path}`)
      .sort();
    expect(authenticated).toEqual([...REVIEWED_AUTHENTICATED].sort());
  });

  // The intake route is @Public — without its key guard it would be an open
  // write endpoint. Asserting `m2m` (not `public`) keeps the audit view honest.
  it('m2m intake is reported as key-guarded, not public', () => {
    const intake = find('POST', '/requests/intake');
    expect(intake?.access).toBe('m2m');
    expect(intake?.guards).toContain('IntakeKeyGuard');
  });

  it('auth routes are public (login / refresh / logout)', () => {
    for (const path of ['/auth/login', '/auth/refresh', '/auth/logout']) {
      expect(find('POST', path)?.access).toBe('public');
    }
  });

  // Method-level @Roles must win over the class default, exactly as RolesGuard
  // resolves it — otherwise the matrix would describe rules nobody enforces.
  it('method-level @Roles overrides the class default', () => {
    // class default on LicenseController is ADMIN / REGIONAL
    expect(find('POST', '/license/catalog/sync')?.roles).toEqual([
      Role.ADMIN,
      Role.REGIONAL,
    ]);
    // …and these override it to also allow OPCO_IT
    expect(find('GET', '/license/catalog')?.roles).toEqual([
      Role.ADMIN,
      Role.REGIONAL,
      Role.OPCO_IT,
    ]);
  });

  /**
   * Regression guard for a real mistake: the first hand-written matrix
   * (2026-07-20) recorded the OPCO_IT overrides as "GET only". PATCH
   * /license/ledger/:id is also open to OPCO_IT — it is how an OpCo corrects
   * its own ledger (ADR-0007), with opco-scope.ts enforcing the row scope.
   */
  it('OPCO_IT can WRITE its own ledger, not only read', () => {
    expect(find('PATCH', '/license/ledger/:id')?.roles).toContain(Role.OPCO_IT);
  });

  // Platform-wide tenant totals stay a management view (W16).
  it('tenant-sku views exclude OPCO_IT', () => {
    expect(find('GET', '/license/tenant-skus')?.roles).not.toContain(
      Role.OPCO_IT,
    );
  });

  // The matrix enumerates every route in the app — do not hand that to a
  // lower-privileged role.
  it('the permissions endpoint itself is ADMIN-only', () => {
    expect(
      new Reflector().get<Role[]>(ROLES_KEY, PermissionsController),
    ).toEqual([Role.ADMIN]);
    expect(find('GET', '/admin/permissions')?.roles).toEqual([Role.ADMIN]);
  });

  /**
   * Full-matrix snapshot. A permission change makes this fail; the diff then
   * shows up in review as an explicit before/after. Do NOT run `jest -u`
   * reflexively — read what moved first.
   */
  it('matches the locked matrix snapshot', () => {
    expect(
      matrix.map(
        (e) => `${e.method} ${e.path} → ${e.access} [${e.roles.join(',')}]`,
      ),
    ).toMatchSnapshot();
  });
});
