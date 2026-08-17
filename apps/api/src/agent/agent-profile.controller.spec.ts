import type { Prisma } from '@prisma/client';
import { AgentProfileController } from './agent-profile.controller';
import { AgentProfileService, PROFILE_SELECT } from './agent-profile.service';
import type { AuthUser } from '../auth/current-user.decorator';
import { AgentProfileDto } from './dto/agent-profile.dto';

/**
 * W47 `F2-7` — the layer BUG-011 fell through, tested before it can.
 *
 * `agent-profile.service.spec.ts` proves the service behaves; a UI test would
 * build its own fixtures. Neither can see what happens in between, and that gap
 * has now cost this project twice (BUG-011's dropped `pendingRestart`, W45's
 * `apiPatch` losing the error body). The two things that only exist here:
 *
 *   - the query string → argument conversion, which no service test can reach
 *     because the service never sees a string
 *   - whether `AgentProfileDto` still describes what the API actually sends
 */
describe('AgentProfileController (F2-7)', () => {
  const profileRow: Prisma.AgentProfileGetPayload<{
    select: typeof PROFILE_SELECT;
  }> = {
    id: 'prof_1',
    principalId: 'prin_1',
    name: 'gpt-5.6-luna',
    model: 'gpt-5.6-luna',
    prompt: null,
    active: true,
    createdAt: new Date('2026-08-17T00:00:00Z'),
    updatedAt: new Date('2026-08-17T00:00:00Z'),
  };

  const actor = { id: 'user_1', role: 'ADMIN' } as unknown as AuthUser;

  const build = () => {
    const service = {
      list: jest.fn().mockResolvedValue([profileRow]),
      create: jest.fn().mockResolvedValue(profileRow),
      update: jest.fn().mockResolvedValue(profileRow),
    };
    const controller = new AgentProfileController(
      service as unknown as AgentProfileService,
    );
    return { controller, service };
  };

  // ── the query string seam ─────────────────────────────────────

  /**
   * 🔴 A query parameter is a STRING, and `includeInactive` decides whether
   * retired profiles appear. The service takes a boolean, so something has to
   * convert — and in JavaScript the wrong conversion (`Boolean(value)`) turns
   * the string `'false'` into `true`, which shows retired profiles to somebody
   * who asked not to see them. No service test can catch that: the service is
   * never handed a string.
   */
  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
    ['', false],
  ])('converts includeInactive=%s to %s', async (query, expected) => {
    const { controller, service } = build();

    await controller.list(query as string | undefined);

    expect(service.list).toHaveBeenCalledWith(expected);
  });

  /**
   * Documents a real edge rather than asserting an accident: the comparison is
   * exact, so `TRUE` and `1` are not opt-ins. Worth pinning because the failure
   * is silent — an operator who typed `?includeInactive=1` would simply not see
   * the retired profiles and have no way to tell that from there being none.
   */
  it('treats anything other than the exact string "true" as false', async () => {
    const { controller, service } = build();

    await controller.list('TRUE');

    expect(service.list).toHaveBeenCalledWith(false);
  });

  // ── the actor ─────────────────────────────────────────────────

  /**
   * 🔴 W46's `515836d` is why this is asserted rather than assumed: an audit
   * writer that loses the actor produces a row saying a change happened with
   * nobody attached — which reads as "the platform did it". Every write here is
   * an ADMIN changing what future runs do, so the actor IS the record.
   */
  it('passes the calling admin to create, not just the body', async () => {
    const { controller, service } = build();
    const dto = { name: 'fast', model: 'gpt-5.6-luna' };

    await controller.create(dto, actor);

    expect(service.create).toHaveBeenCalledWith(dto, actor);
  });

  it('passes the calling admin and the id to update', async () => {
    const { controller, service } = build();
    const dto = { prompt: 'a new prompt' };

    await controller.update('prof_1', dto, actor);

    expect(service.update).toHaveBeenCalledWith('prof_1', dto, actor);
  });

  // ── the documented shape vs the real one ──────────────────────

  /**
   * 🔴 Both sides are TYPED, and that is what makes this test maintain itself.
   *
   * `PROFILE_SELECT` decides what the API sends; `AgentProfileDto` decides what
   * the OpenAPI document — and therefore every generated client and every
   * frontend developer — believes it sends. Adding a column to one and not the
   * other breaks nothing at runtime and nothing in tsc, which is exactly why it
   * survives review: the response simply carries a field nobody knows about, or
   * promises one that never arrives.
   *
   * Each map below is exhaustive by its own key type, so widening either side
   * fails to compile until it is widened here — and then this test says which
   * direction drifted.
   */
  it('documents exactly the fields it selects', () => {
    const selected: Record<keyof typeof PROFILE_SELECT, true> = {
      id: true,
      principalId: true,
      name: true,
      model: true,
      prompt: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    };
    const documented: Record<keyof AgentProfileDto, true> = {
      id: true,
      principalId: true,
      name: true,
      model: true,
      prompt: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      principal: true,
    };

    // Everything selected must be documented. The reverse is not asserted:
    // `principal` is documented and comes from a join, not from PROFILE_SELECT.
    expect(Object.keys(documented)).toEqual(
      expect.arrayContaining(Object.keys(selected)),
    );
  });

  /**
   * 🔴 The join `list()` adds on top of `PROFILE_SELECT`.
   *
   * `list()` selects `principal: { name }` so the screen can say which agent a
   * profile belongs to. That field is real, it reaches the browser, and until
   * this test it was undocumented — the mirror image of BUG-011: there the
   * response was missing a field the read-model had; here the response carried
   * one the contract never mentioned. Same gap, opposite direction, and a
   * frontend written against the OpenAPI document would have had to guess.
   */
  it('returns the owning agent name alongside each profile', async () => {
    const withPrincipal = { ...profileRow, principal: { name: 'ai-assist' } };
    const service = {
      list: jest.fn().mockResolvedValue([withPrincipal]),
    };
    const controller = new AgentProfileController(
      service as unknown as AgentProfileService,
    );

    const [out] = (await controller.list()) as Array<
      typeof profileRow & { principal: { name: string } }
    >;

    expect(out.principal.name).toBe('ai-assist');
  });
});
