import { RequestMethod } from '@nestjs/common';
import {
  PATH_METADATA,
  METHOD_METADATA,
  GUARDS_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * W28 — the permission matrix is DERIVED from the @Roles decorators, never
 * hand-written (ADR-0009 Decision 8.5). A second hand-maintained source would
 * drift, and an audit document that lies is worse than none: within one day of
 * writing the first hand-made matrix it was already wrong about
 * `PATCH ledger/:id` (see W28 progress Day-1).
 *
 * This module is a PURE function over controller classes so both callers agree:
 *   - runtime  → DiscoveryService.getControllers()   (F1 endpoint)
 *   - test     → glob *.controller.ts + require      (F3 drift test)
 * Neither can use the other's source: after a production build there is no
 * `.ts` to glob, and jest cannot import AppModule (jwks-rsa → jose is ESM).
 * If the two ever disagree, that mismatch is itself the bug signal.
 */

export type AccessKind =
  | 'roles' // restricted to specific app roles
  | 'public' // no auth at all (login / refresh / logout)
  | 'm2m' // @Public but protected by an API-key guard
  | 'authenticated' // any signed-in user — reviewed and accepted
  | 'unguarded'; // any signed-in user — NOT reviewed → treat as a finding

export interface PermissionEntry {
  controller: string;
  handler: string;
  method: string;
  path: string;
  access: AccessKind;
  /** Effective roles (method-level overrides class-level, mirroring RolesGuard). */
  roles: Role[];
  /** Extra guard class names (e.g. IntakeKeyGuard) — what makes `m2m` safe. */
  guards: string[];
}

/**
 * Routes deliberately open to ANY signed-in user, after review. Anything else
 * that ends up with no @Roles is reported as `unguarded` so a new controller
 * that forgets its guard shows up instead of silently blending in.
 * Adding a line here is a security decision — it needs the same scrutiny as
 * widening @Roles.
 */
export const REVIEWED_AUTHENTICATED: readonly string[] = [
  'GET /me', // own identity — every signed-in user needs it
  'PATCH /me/password', // change own password (self-service, ADR-0006)
];

const httpMethodName = (value: unknown): string =>
  typeof value === 'number' ? (RequestMethod[value] ?? `#${value}`) : 'UNKNOWN';

/** `license` + `catalog/sync` → `/license/catalog/sync`; `me` + `/` → `/me`. */
const joinPath = (base: unknown, route: unknown): string => {
  const trim = (v: unknown) =>
    typeof v === 'string' ? v.replace(/^\/+|\/+$/g, '') : '';
  const b = trim(base);
  const r = trim(route);
  if (b && r) return `/${b}/${r}`;
  return `/${b || r}`;
};

const guardNames = (target: unknown): string[] => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, target as object);
  return Array.isArray(guards)
    ? guards.map((g: any) => g?.name ?? String(g)).filter(Boolean)
    : [];
};

/**
 * Derive the effective permission matrix from controller classes.
 * Resolution mirrors RolesGuard exactly: @Public wins first, then method-level
 * @Roles over class-level. Deviating here would produce a matrix that does not
 * describe what the guard actually enforces.
 */
export function derivePermissions(controllers: unknown[]): PermissionEntry[] {
  const reflector = new Reflector();
  const entries: PermissionEntry[] = [];

  for (const ctrl of controllers) {
    const target = ctrl as { name?: string; prototype?: object };
    if (!target?.prototype) continue;

    const classPath = Reflect.getMetadata(PATH_METADATA, target as object);
    const classRoles = reflector.get<Role[]>(ROLES_KEY, target as any);
    const classPublic = reflector.get<boolean>(IS_PUBLIC_KEY, target as any);
    const classGuards = guardNames(target);

    for (const handlerName of Object.getOwnPropertyNames(target.prototype)) {
      if (handlerName === 'constructor') continue;
      const handler = (target.prototype as any)[handlerName];
      if (typeof handler !== 'function') continue;

      const rawMethod = Reflect.getMetadata(METHOD_METADATA, handler);
      // Only decorated route handlers carry METHOD_METADATA — this filters out
      // private helpers without needing a naming convention.
      if (rawMethod === undefined) continue;

      const roles =
        reflector.get<Role[]>(ROLES_KEY, handler) ?? classRoles ?? [];
      const isPublic =
        (reflector.get<boolean>(IS_PUBLIC_KEY, handler) ?? classPublic) ===
        true;
      const guards = [...classGuards, ...guardNames(handler)];

      const method = httpMethodName(rawMethod);
      const path = joinPath(
        classPath,
        Reflect.getMetadata(PATH_METADATA, handler),
      );

      let access: AccessKind;
      if (isPublic) {
        // @Public bypasses JwtAuthGuard + RolesGuard. A key guard is the only
        // thing standing there — say so explicitly rather than calling it open.
        access = guards.length > 0 ? 'm2m' : 'public';
      } else if (roles.length > 0) {
        access = 'roles';
      } else {
        access = REVIEWED_AUTHENTICATED.includes(`${method} ${path}`)
          ? 'authenticated'
          : 'unguarded';
      }

      entries.push({
        controller: target.name ?? 'Unknown',
        handler: handlerName,
        method,
        path,
        access,
        roles,
        guards,
      });
    }
  }

  // Stable order so the drift snapshot only moves when permissions actually do.
  return entries.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}
