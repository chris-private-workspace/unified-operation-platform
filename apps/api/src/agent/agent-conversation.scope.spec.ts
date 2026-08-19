import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';

/**
 * W49 `F3-2` / `G4` — **the context the dock sends is a parameter, not a claim**
 * (`D-CTX`).
 *
 * 🔴 This file exists because of a shape that has now cost this project three
 * times (BUG-011, W45 `apiPatch`, W48 `F5-8`): each layer is tested against its
 * own fixtures, both layers are green, and the defect lives in the seam. `plan
 * §4 R2` predicted a fourth here, and it named the two ways the obvious test
 * would have been worthless:
 *
 *   1. Asserting the frontend "sends requestId". That proves the dock does what
 *      the dock does. Whether sending it ACHIEVES anything is a server question.
 *   2. Mocking the service. `agent-conversation.controller.spec.ts` does exactly
 *      that (correctly — it is about wiring), which means `assertOpcoScope`
 *      never runs there. A test that mocks the thing under test cannot fail.
 *
 * ⇒ Real controller, real service, only the database faked. The falsification
 * for this file is **removing `assertOpcoScope` from the service** — not
 * touching anything in the frontend.
 *
 * 🔴 What was actually missing before this file: `agent-conversation.service.spec.ts`
 * covers a request that does not EXIST (404), and nothing anywhere covered a
 * request that exists and belongs to somebody else (403). The dangerous id is
 * the one that resolves.
 *
 * ─────────────────────────────────────────────────────────────────
 * ⚠️ **Read this before citing the 403 tests as today's protection.**
 *
 * W49 `F3-3` ran the OpCo case live and it never reached `assertOpcoScope`. The
 * chain, all three links verified rather than assumed:
 *
 *   1. `AgentConversationController` is `@Roles(ADMIN, REGIONAL)`.
 *   2. `user-admin.service.ts` `normaliseScope` starts `if (role !== OPCO_IT)
 *      return null` — ADMIN and REGIONAL are FORCED to a null scope.
 *   3. `assertOpcoScope` is `if (user.opcoScopeId && …)`.
 *
 * ⇒ Everyone who gets past the role guard has a null scope, so the OpCo check
 * cannot fire. Live, an OPCO_IT caller got `403 Insufficient role` from the
 * guard — a refusal, but from a different gate than the one this file exercises.
 *
 * 🔴 That does not make these tests worthless, and it does not make the check
 * dead code — but it does change what they are FOR. They stop being "the thing
 * that protects the endpoint today" and become the thing that will hold if
 * `canUseAgent` ever widens to OPCO_IT (the Tier 2 scope report floats per-agent
 * scoping, so this is not hypothetical). Written down because a check that looks
 * like it is guarding something, and is not, is the same shape as `R13`: a
 * reassuring appearance nobody re-examines.
 *
 * ⚠️ These call `controller.create(...)` directly, which is BELOW the guard.
 * That is deliberate — the point is the service's own reasoning — but it means
 * nothing here says anything about who can reach the route.
 *
 * 🟢 Today's real protection for `D-CTX`, live-verified in `F3-3`:
 * role guard (who may ask) + `findUnique` (an id that resolves to nothing is a
 * 404, never a thread with no context). Both are covered below.
 */

const OWN_OPCO = 'opco_pfu_hk';
const OTHER_OPCO = 'opco_pfu_asia';

const userWithScope = (opcoScopeId: string | null): AppUser =>
  ({
    id: 'u_caller',
    email: 'caller@rapo.com.hk',
    role: opcoScopeId ? 'OPCO_IT' : 'ADMIN',
    opcoScopeId,
  }) as AppUser;

function build() {
  const prisma = {
    request: { findUnique: jest.fn() },
    agentProfile: { findUnique: jest.fn() },
    agentConversation: { create: jest.fn() },
  };
  const service = new AgentConversationService(
    prisma as never,
    {} as never,
    {} as never,
  );
  const controller = new AgentConversationController(service, {} as never);
  return { prisma, controller };
}

describe('conversation context is checked server-side (W49 F3-2 / G4)', () => {
  /**
   * 🔴 The one that matters. A request that EXISTS, belonging to another OpCo —
   * exactly what a scoped user gets by editing `?requestId=` in the URL the dock
   * produced, or by pasting a colleague's link.
   */
  it('refuses a request belonging to another OpCo', async () => {
    const { prisma, controller } = build();
    prisma.request.findUnique.mockResolvedValue({ opcoId: OTHER_OPCO });

    await expect(
      controller.create({ requestId: 'req_other' }, userWithScope(OWN_OPCO)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * 🔴 And "refused" has to mean nothing was written. A 403 that still left a
   * conversation row behind would be a thread pinned to a request its owner may
   * not read — which the next turn would then feed to the agent.
   */
  it('writes no conversation when it refuses', async () => {
    const { prisma, controller } = build();
    prisma.request.findUnique.mockResolvedValue({ opcoId: OTHER_OPCO });

    await expect(
      controller.create({ requestId: 'req_other' }, userWithScope(OWN_OPCO)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.agentConversation.create).not.toHaveBeenCalled();
  });

  /**
   * The id reaches the lookup unchanged. This is what "a parameter, not a claim"
   * looks like from the server's side: the value is used to ASK the database a
   * question, never to skip asking.
   */
  it('looks the id up exactly as it was sent', async () => {
    const { prisma, controller } = build();
    prisma.request.findUnique.mockResolvedValue({ opcoId: OWN_OPCO });
    prisma.agentConversation.create.mockResolvedValue({ id: 'conv_1' });

    await controller.create(
      { requestId: 'req_from_the_dock' },
      userWithScope(OWN_OPCO),
    );

    expect(prisma.request.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req_from_the_dock' } }),
    );
  });

  /**
   * ⚠️ An unscoped caller must still cause the lookup. Skipping it for ADMIN
   * would look like a harmless optimisation and would quietly delete the 404:
   * a typo'd id would then pin a thread to a request that does not exist.
   */
  it('still looks the request up for an unscoped caller', async () => {
    const { prisma, controller } = build();
    prisma.request.findUnique.mockResolvedValue({ opcoId: OTHER_OPCO });
    prisma.agentConversation.create.mockResolvedValue({ id: 'conv_1' });

    await controller.create({ requestId: 'req_other' }, userWithScope(null));

    expect(prisma.request.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.agentConversation.create).toHaveBeenCalled();
  });

  it('refuses an id that resolves to nothing', async () => {
    const { prisma, controller } = build();
    prisma.request.findUnique.mockResolvedValue(null);

    await expect(
      controller.create({ requestId: 'req_typo' }, userWithScope(OWN_OPCO)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * The other half of `D-CTX`: a thread with no context is legitimate, and must
   * not be made to pay for the check. `/assistant` opened directly sends null.
   */
  it('asks nothing when no context is sent', async () => {
    const { prisma, controller } = build();
    prisma.agentConversation.create.mockResolvedValue({ id: 'conv_1' });

    await controller.create({ requestId: null }, userWithScope(OWN_OPCO));

    expect(prisma.request.findUnique).not.toHaveBeenCalled();
    expect(prisma.agentConversation.create).toHaveBeenCalled();
  });

  /**
   * ⚠️ The happy path, and it is not decoration. Every test above proves a BAD
   * id is rejected; none of them would notice a change that accepted a good id
   * and then quietly dropped it on the way to the row. This is the one that says
   * the context is actually used.
   */
  it('stores the context it accepted', async () => {
    const { prisma, controller } = build();
    prisma.request.findUnique.mockResolvedValue({ opcoId: OWN_OPCO });
    prisma.agentConversation.create.mockResolvedValue({ id: 'conv_1' });

    await controller.create({ requestId: 'req_mine' }, userWithScope(OWN_OPCO));

    expect(prisma.agentConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestId: 'req_mine' }),
      }),
    );
  });
});
