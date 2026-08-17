import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AgentToolRegistry } from '../agent/tool-registry';
import type { PrismaService } from '../prisma/prisma.service';
import { derivePermissions, REVIEWED_AUTHENTICATED } from './permissions';
import { ROLES_KEY } from './roles.decorator';
import { PermissionsController } from './permissions.controller';

// AuthController now reaches jwks-rsa (via EntraSsoService, ADR-0028), and
// globbing loads it for real — so the ESM problem described below arrives
// through the controller too, not only through AppModule. Inert stub: this file
// reads decorator metadata and never constructs anything.
jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn(() => ({ getSigningKey: jest.fn() })),
}));

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

/**
 * W46 G2 — the agent half of the matrix, from the SAME object the runtime runs.
 *
 * Constructing the registry with no Prisma is safe and deliberate: the
 * constructor only assembles tool descriptors, and `prisma` is captured inside
 * `execute`, which nothing here calls. Reading a static list instead would have
 * meant a second source — the exact thing W28 exists to prevent.
 */
function loadAgentTools() {
  return new AgentToolRegistry(undefined as unknown as PrismaService).list();
}

describe('permission matrix (derived from @Roles + the tool registry)', () => {
  const matrix = derivePermissions(loadControllers(), loadAgentTools());
  const find = (method: string, path: string) =>
    matrix.find((e) => e.method === method && e.path === path);

  it('discovers every controller in src', () => {
    // `actor: 'user'` only — the agent rows carry AgentToolRegistry in this
    // field, and it is not a controller. Its own coverage is the G2 block below.
    const names = new Set(
      matrix.filter((e) => e.actor === 'user').map((e) => e.controller),
    );
    // All registered controllers must appear. If a new one is added this
    // count changes — that is intended, update it deliberately.
    expect(names).toEqual(
      new Set([
        // CH-006 — GET /fulfilment/activity, @Roles(ADMIN,REGIONAL,OPCO_IT).
        // The widest of the three read surfaces on purpose: it carries no
        // account history (unlike /admin/audit) and is opco-scoped in the
        // service, so an OPCO_IT operator sees only its own OpCo's events.
        'ActivityController',
        // W46 F6 / ADR-0036 D3 — /agent/proposals/:id/approve|reject,
        // @Roles(ADMIN,REGIONAL). Same width as the outbound failure queue and
        // for the same reason (plan OQ-2): deciding an agent's proposal is an
        // operations call on a request REGIONAL already owns.
        //
        // 🔴 That this line had to be added AT ALL is the point of the matrix.
        // ADR-0036 rejected putting the agent in-process against the domain
        // precisely because such a path would not show up here — and the first
        // write surface W46 added was caught by this test on the run that
        // introduced it, not by review.
        'AgentApprovalController',
        // 期二 G3 — /agent/kill-switch, @Roles(ADMIN). NARROWER than the two
        // agent surfaces above, and deliberately: they decide what happens to
        // one request, this decides whether the capability exists at all.
        //
        // 🔴 This line is here because the drift test demanded it on the run
        // that added the controller — the second time in W46 that a new agent
        // write surface was caught by the matrix rather than by review, which
        // is the argument ADR-0036 made for keeping the agent out-of-process
        // in the first place.
        'AgentKillSwitchController',
        // 期二 G7 — GET /agent/review-stats, @Roles(ADMIN). Same width as the
        // kill switch and the audit trail, and for the audit trail's reason
        // (ADR-0009 Decision 7): it reports named individuals' reviewing
        // behaviour, which is management information about colleagues.
        'AgentReviewStatsController',
        // W47 F2 / `OQ-A` — GET/POST/PATCH /agent/profiles, @Roles(ADMIN).
        //
        // 🔴 Narrower than AgentRunController (ADMIN + REGIONAL), and the reason
        // is the same one the kill switch gives: starting a run decides what
        // happens to one request, editing a profile decides what EVERY future
        // run does — including runs other people start. One of these columns is
        // `prompt`, which is the only place in W47 where behaviour is handed to
        // runtime configuration (W47 R1).
        //
        // 🔴 And again the matrix demanded this line rather than review noticing
        // — third time an agent write surface has been caught here. That is the
        // test working, not the test being annoying.
        'AgentProfileController',
        // W46 F8 — /agent/runs (start, read, abort), @Roles(ADMIN,REGIONAL).
        // Neither ADR-0036 nor the plan settles who may START a run, so this
        // matches the approval surface: a run costs a model call and creates
        // work for whoever decides the proposal. The tools are safe at any
        // width — they apply the STARTER's OpCo scope — so widening later is a
        // one-line change, and narrowing after people rely on it is not.
        'AgentRunController',
        'AuditController', // W29 F3 — GET /admin/audit, @Roles(ADMIN)
        'AuthController',
        'FulfilmentController',
        'IntakeController',
        'IntegrationController', // W30 F2 — /admin/integrations, @Roles(ADMIN)
        'LicenseController',
        'MeController',
        'OpcoAdminController',
        'OpcoController',
        // W31 F3 — /admin/outbound-failures, @Roles(ADMIN,REGIONAL). Wider than
        // the audit trail on purpose (ADR-0011 D4): a failed delivery is an
        // operations problem and REGIONAL is who chases it.
        'OutboundFailureController',
        'OutboundRequestController',
        'PermissionsController',
        // CH-013 / ADR-0021 D3 — /requests/servicenow-lookup +
        // /requests/import-from-servicenow, @Roles(ADMIN). The narrowest of the
        // request-creating surfaces on purpose: it conjures a real platform
        // request out of nothing but a number typed into a box. Not widened to
        // OPCO_IT because a request's OpCo comes from ServiceNow and is unknown
        // until AFTER the lookup — an authorisation gate that needs an external
        // round-trip before it can answer is a gate that fails in interesting
        // ways. Widening it means reopening the ADR, not editing this line.
        'ServiceNowImportController',
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
   * W46 G2 / ADR-0036 D7 — the agent is an ACTOR of this matrix.
   *
   * 🔴 What D7 actually warns about is not that an agent might be given too much.
   * It is that the agent's write path would be the one surface the matrix does
   * not describe — and a matrix that omits an actor reads identically to a
   * matrix reporting that the actor reaches nothing. The tests below are the
   * three claims that have to hold for it to stop reading that way.
   */
  describe('🔴 G2 — the agent appears as an actor, with no Role', () => {
    const agentRows = matrix.filter((e) => e.actor === 'agent');

    /**
     * 🔴 Found by falsification, not by review: with the derivation removed,
     * three tests below went red and two stayed GREEN — both of them are a
     * `for` over `agentRows`, and an empty list satisfies every claim you can
     * make about its members. That is the same failure the boundary spec guards
     * with `expect(agentFiles.length).toBeGreaterThan(5)`, and it is worth its
     * own test rather than a comment: the tests that would go quiet are exactly
     * the ones asserting the agent has no Role.
     */
    it('has agent rows at all', () => {
      expect(agentRows.length).toBeGreaterThan(0);
    });

    it('reports every registered tool, and nothing else', () => {
      // Word for word, like `tool-registry.spec.ts` pins the registry itself.
      // A new tool with no line here is a red build — which is the point:
      // widening an agent's power is an ADR-level act (R12), so it must not be
      // possible to do it and leave the audit document unchanged.
      expect(agentRows.map((e) => `${e.path} → ${e.access}`)).toEqual([
        'agent:get_ledger → agent-read',
        'agent:get_request → agent-read',
        'agent:list_pending_requests → agent-read',
        'agent:propose_assign → agent-propose',
        'agent:propose_line_items → agent-propose',
        'agent:search_catalog → agent-read',
      ]);
    });

    it('gives the agent no Role at all — and never reports it as a user', () => {
      // The heart of D7. `AppUser` + `Role` was rejected because handing an
      // agent any of the three roles hands it that role's whole reach while
      // this matrix keeps describing it as an ordinary person.
      expect(agentRows.length).toBeGreaterThan(0);
      for (const row of agentRows) {
        expect(row.roles).toEqual([]);
        expect(row.actor).toBe('agent');
      }
      // …and no HTTP route quietly acquired the agent actor either.
      const routes = matrix.filter((e) => e.path.startsWith('/'));
      expect(routes.every((e) => e.actor === 'user')).toBe(true);
    });

    /**
     * The load-bearing one. A propose tool is the agent's only write surface,
     * and the whole reason it is safe is that it cannot take effect until a
     * person decides it — through a route that is in THIS matrix, with roles
     * this matrix reports. If the approval controller were deleted, renamed or
     * widened, the agent rows would keep claiming a gate that had moved.
     */
    it('every propose tool names a human gate that really is ADMIN + REGIONAL', () => {
      const proposes = agentRows.filter((e) => e.access === 'agent-propose');
      expect(proposes.length).toBeGreaterThan(0);

      for (const row of proposes) {
        expect(row.guards).toEqual(['AgentApprovalController']);
      }

      const approve = find('POST', '/agent/proposals/:id/approve');
      expect(approve?.controller).toBe('AgentApprovalController');
      expect(approve?.access).toBe('roles');
      expect(approve?.roles).toEqual([Role.ADMIN, Role.REGIONAL]);
    });

    it('read tools name no gate — because there is no human in that loop', () => {
      // Stated rather than left implicit: a read tool runs during the turn, with
      // nobody deciding it. What bounds it is the starter's OpCo scope, which is
      // row-level and which no endpoint-level matrix can express (same caveat
      // the human half carries for OPCO_IT).
      const reads = agentRows.filter((e) => e.access === 'agent-read');
      expect(reads.length).toBeGreaterThan(0);
      for (const row of reads) {
        expect(row.guards).toEqual([]);
      }
    });

    /**
     * D7's structural half, pinned where the consequence lives.
     *
     * `roles: []` above is only honest while `AgentPrincipal` genuinely has no
     * role to report. The day someone adds one, every assertion in this block
     * still passes — they read the derived rows, not the model — and the matrix
     * starts under-reporting instead of failing. So the schema is checked here
     * too, at the place that would otherwise lie about it.
     */
    it('AgentPrincipal carries no Role in the schema', () => {
      const schema = readFileSync(
        join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
        'utf8',
      );
      const block = schema.slice(
        schema.indexOf('model AgentPrincipal {'),
        schema.indexOf('model AgentRun {'),
      );
      expect(block).toContain('model AgentPrincipal {');
      expect(block).not.toContain('Role');
    });
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
