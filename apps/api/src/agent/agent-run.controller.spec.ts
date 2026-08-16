import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/current-user.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AgentRunController } from './agent-run.controller';
import { AiAssistService } from './ai-assist.service';

/**
 * W46 F10-2e — the layer that had no tests.
 *
 * BUG-011 is the reason this file exists: `IntegrationController` was the one
 * layer without a spec, so that is where the fix fell through. Every other layer
 * was green — the service spec asserted the service, the UI test built its own
 * fixtures — and the defect lived in between them.
 *
 * The agent side had the identical gap: `ai-assist.service.spec.ts` covers the
 * service and `ai-assist-card.test.tsx` covers the screen, with nothing in
 * between. What follows pins the two things only a controller can get wrong —
 * how a request is taken apart, and what comes back out — plus one fact about
 * this seam that is easy to read the wrong way round.
 */
describe('AgentRunController (F10-2e)', () => {
  const user = { id: 'u-admin' } as unknown as AuthUser;

  const build = () => {
    const aiAssist = {
      startRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
      findLatestForRequest: jest.fn().mockResolvedValue(null),
      getRun: jest.fn(),
      abortRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
    };
    const controller = new AgentRunController(
      aiAssist as unknown as AiAssistService,
    );
    return { controller, aiAssist };
  };

  describe('the roles this controller runs under', () => {
    it('is ADMIN + REGIONAL, on the class so every route inherits it', () => {
      const roles = new Reflector().get<Role[]>(ROLES_KEY, AgentRunController);

      // W28's permissions snapshot already watches the whole matrix. This is
      // the local half: the snapshot tells you the matrix CHANGED, this tells
      // you what this controller is supposed to be.
      expect(roles).toEqual([Role.ADMIN, Role.REGIONAL]);
    });
  });

  describe('taking the request apart', () => {
    it('starts a run from the body’s requestId, not the whole body', async () => {
      const { controller, aiAssist } = build();

      await controller.start({ requestId: 'req-1' }, user);

      // Passing `dto` straight through would still compile and still work
      // today; it would stop working the moment the DTO grows a field.
      expect(aiAssist.startRun).toHaveBeenCalledWith(user, 'req-1');
    });

    it('passes the query value straight through to the service', async () => {
      const { controller, aiAssist } = build();

      await controller.latest('req-1', user);

      expect(aiAssist.findLatestForRequest).toHaveBeenCalledWith(user, 'req-1');
    });

    /**
     * 🔴 This one had to be written twice, and the first version is worth
     * recording because it is the exact failure F10-2 exists to catch.
     *
     * v1 called `controller.latest('req-1', user)` and asserted the service got
     * 'req-1' — with a comment claiming it guarded the query key. Renaming
     * `@Query('requestId')` to `@Query('request_id')` left all 152 tests green:
     * calling the method directly bypasses Nest's parameter binding entirely,
     * so the decorator's key never participates. The test asserted a fact it
     * structurally could not see, and said so in a comment.
     *
     * The key is a contract with the browser — apps/web calls
     * `/agent/runs?requestId=…`. Rename it and the service is still called,
     * with `undefined`, so the card silently reports "no run yet" for a request
     * that has one. Nothing throws. To see that at all, the assertion has to
     * read the ROUTE METADATA rather than call the method.
     */
    it('binds the latest-run query to the key apps/web actually sends', () => {
      const meta = (Reflect.getMetadata(
        '__routeArguments__',
        AgentRunController,
        'latest',
      ) ?? {}) as Record<string, { data?: unknown }>;

      const keys = Object.values(meta).map((arg) => arg.data);

      expect(keys).toContain('requestId');
    });

    it('passes the path id and the caller to getRun', async () => {
      const { controller, aiAssist } = build();
      aiAssist.getRun.mockResolvedValue({ id: 'run-1' });

      await controller.get('run-1', user);

      // Argument ORDER, not just presence: getRun(user, id) reversed still
      // type-checks — both are strings — and then every run is looked up by
      // the caller's id and scoped against a run id.
      expect(aiAssist.getRun).toHaveBeenCalledWith(user, 'run-1');
    });

    it('passes the path id and the caller to abortRun', async () => {
      const { controller, aiAssist } = build();

      await controller.abort('run-1', user);

      expect(aiAssist.abortRun).toHaveBeenCalledWith(user, 'run-1');
    });
  });

  /**
   * 🔴 The uncomfortable half, written down so nobody has to rediscover it.
   *
   * `AgentRunDto` says in its own header that `runState` is "ABSENT from every
   * shape here, and that is a rule rather than an omission". True — but a DTO
   * in this app is DOCUMENTATION, not a filter: there is no
   * `ClassSerializerInterceptor` registered anywhere, and `@ApiOkResponse`
   * only shapes the OpenAPI page. The controller hands back whatever the
   * service returned, field for field.
   *
   * So the guard is not here and cannot be here. It is the explicit `select`
   * in `AiAssistService.getRun`, which `ai-assist.service.spec.ts` pins by
   * asserting the arguments handed to Prisma. This test exists to stop the DTO
   * comment from being read as a second line of defence — there is only one.
   */
  describe('what comes back out', () => {
    it('returns the service’s object unchanged — the DTO filters nothing', async () => {
      const { controller, aiAssist } = build();
      const fromService = { id: 'run-1', status: 'completed' };
      aiAssist.getRun.mockResolvedValue(fromService);

      // Identity, not shape: anything the service selects reaches the wire.
      expect(await controller.get('run-1', user)).toBe(fromService);
    });
  });
});
