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

/**
 * W46 G2 / ADR-0036 D7 — who is doing the reaching.
 *
 * 🔴 An `AgentPrincipal` is deliberately NOT an `AppUser` and carries no `Role`,
 * so before this existed the matrix had no row that could describe it — and a
 * matrix silent about an actor reads exactly like a matrix reporting that the
 * actor has no reach. That is the failure D7 names: "唯一一條唔受權限矩陣管嘅
 * 寫入路徑,而個矩陣唔會話你聽".
 */
export type ActorKind =
  | 'user' // a signed-in AppUser calling an HTTP route
  | 'agent'; // an AgentPrincipal calling a registered tool (ADR-0036 D7)

export type AccessKind =
  | 'roles' // restricted to specific app roles
  | 'public' // no auth at all (login / refresh / logout)
  | 'm2m' // @Public but protected by an API-key guard
  | 'authenticated' // any signed-in user — reviewed and accepted
  | 'unguarded' // any signed-in user — NOT reviewed → treat as a finding
  | 'agent-read' // agent tool with no side-effect and no human in the loop
  | 'agent-propose'; // agent tool that only proposes — a person decides

export interface PermissionEntry {
  controller: string;
  handler: string;
  method: string;
  path: string;
  access: AccessKind;
  actor: ActorKind;
  /** Effective roles (method-level overrides class-level, mirroring RolesGuard). */
  roles: Role[];
  /** Extra guard class names (e.g. IntakeKeyGuard) — what makes `m2m` safe. */
  guards: string[];
}

/**
 * What the matrix needs to know about an agent tool.
 *
 * Deliberately only the two things the registry itself DECIDES. Adding, say,
 * "applies OpCo scope" would be a claim this file cannot check — and the one
 * thing worse than an incomplete audit document is one that asserts a control
 * nobody verified.
 */
export interface AgentToolDescriptor {
  name: string;
  needsApproval: boolean;
}

/**
 * The class that stands between a proposal and its effect. Recorded in `guards`
 * for exactly the reason `IntakeKeyGuard` is: it names what makes the row safe,
 * and it points at another row of this same matrix — where its @Roles are.
 */
const AGENT_APPROVAL_CONTROLLER = 'AgentApprovalController';

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
 * Derive the effective permission matrix from controller classes AND from the
 * agent tool registry.
 *
 * Resolution for routes mirrors RolesGuard exactly: @Public wins first, then
 * method-level @Roles over class-level. Deviating here would produce a matrix
 * that does not describe what the guard actually enforces.
 *
 * 🔴 `agentTools` has NO default value, and that is the design. A default of
 * `[]` would let a caller that forgot the registry render a matrix which is
 * complete-looking and silently missing an entire actor — which is the precise
 * failure mode ADR-0036 D7 exists to prevent, reintroduced as a convenience.
 * Required means the compiler asks the question at both call sites.
 */
export function derivePermissions(
  controllers: unknown[],
  agentTools: readonly AgentToolDescriptor[],
): PermissionEntry[] {
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
        actor: 'user',
        roles,
        guards,
      });
    }
  }

  /**
   * W46 G2 — the agent's reachable surface IS the registry, and nothing else
   * (ADR-0036 D2: an unregistered tool is not restricted, it is absent). So the
   * registry is to an agent what the @Roles decorators are to a person, and it
   * is derived from here for the same reason: a second, hand-kept list of what
   * an agent may do would drift, and this one is read from the same object the
   * runtime actually executes.
   *
   * 🔴 `roles: []` is a fact, not a gap. An agent holds no Role at all (D7), and
   * writing one in would be the silent privilege escalation that decision was
   * taken to avoid. `access` carries the real distinction instead: a read tool
   * runs with nobody in the loop, a propose tool cannot take effect until a
   * person decides it through AgentApprovalController.
   */
  for (const tool of agentTools) {
    entries.push({
      controller: 'AgentToolRegistry',
      handler: tool.name,
      // Not an HTTP route and it must not read like one — an agent reaches
      // these in-process, so there is no method and no URL to report.
      method: 'TOOL',
      path: `agent:${tool.name}`,
      access: tool.needsApproval ? 'agent-propose' : 'agent-read',
      actor: 'agent',
      roles: [],
      guards: tool.needsApproval ? [AGENT_APPROVAL_CONTROLLER] : [],
    });
  }

  // Stable order so the drift snapshot only moves when permissions actually do.
  // Routes keep their existing order and the agent block follows, so adding a
  // tool shows up as added lines rather than as a reshuffled matrix.
  const actorRank = (entry: PermissionEntry) =>
    entry.actor === 'user' ? 0 : 1;
  return entries.sort(
    (a, b) =>
      actorRank(a) - actorRank(b) ||
      a.path.localeCompare(b.path) ||
      a.method.localeCompare(b.method),
  );
}
