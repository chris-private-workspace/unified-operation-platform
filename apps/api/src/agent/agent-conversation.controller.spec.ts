import { firstValueFrom, of } from 'rxjs';
import { AgentConversationController } from './agent-conversation.controller';
import type { AgentRunQueue } from './agent-run.queue';
import {
  AgentConversationService,
  CONVERSATION_SELECT,
  TURN_SELECT,
} from './agent-conversation.service';
import type { AuthUser } from '../auth/current-user.decorator';
import {
  AgentChatTurnDto,
  AgentConversationDto,
} from './dto/agent-conversation.dto';

/**
 * W48 `F3-7` — the layer BUG-011 fell through, and W47's `F2-7` found a real
 * gap in on its first run.
 *
 * The service spec proves behaviour; a UI test builds its own fixtures. What
 * only exists here is the query string → argument conversion, and whether the
 * DTO still describes what the API actually sends.
 */
describe('AgentConversationController (F3-7)', () => {
  const actor = { id: 'user_1', role: 'REGIONAL' } as unknown as AuthUser;

  const row = {
    id: 'conv_1',
    startedById: 'user_1',
    requestId: null,
    profileId: null,
    archivedAt: null,
    createdAt: new Date('2026-08-18T00:00:00Z'),
    updatedAt: new Date('2026-08-18T00:00:00Z'),
  };

  const build = () => {
    const service = {
      create: jest.fn().mockResolvedValue(row),
      list: jest.fn().mockResolvedValue([row]),
      get: jest.fn().mockResolvedValue(row),
      addTurn: jest.fn().mockResolvedValue({ turn: {}, runId: 'run_1' }),
      archive: jest.fn().mockResolvedValue(row),
      unarchive: jest.fn().mockResolvedValue(row),
    };
    const queue = {
      conversationChanges: jest.fn().mockReturnValue(of({})),
    };
    const controller = new AgentConversationController(
      service as unknown as AgentConversationService,
      queue as unknown as AgentRunQueue,
    );
    return { controller, service, queue };
  };

  // ── the query string seam ─────────────────────────────────────

  /**
   * 🔴 Same shape W47 pinned on `includeInactive`, same silent failure:
   * `Boolean('false')` is `true`, which would show archived threads to somebody
   * who asked not to see them. The service takes a boolean and can never see
   * the string, so this is the only layer that can catch it.
   */
  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
    ['', false],
    ['TRUE', false],
  ])('converts includeArchived=%s to %s', async (query, expected) => {
    const { controller, service } = build();

    await controller.list(actor, query as string | undefined);

    expect(service.list).toHaveBeenCalledWith(actor, expected);
  });

  // ── the actor reaches every method ────────────────────────────

  /**
   * 🔴 Every one of these, because the actor is not decoration here — it IS the
   * access check. A conversation may have no request, so there is no OpCo to
   * scope by and the service compares `user.id` against `startedById`. A method
   * that forgot to pass the caller would not fail: it would call a service that
   * then has nobody to compare against.
   */
  it('passes the caller to every method', async () => {
    const { controller, service } = build();

    await controller.create({ requestId: null }, actor);
    await controller.list(actor);
    await controller.get('conv_1', actor);
    await controller.addTurn('conv_1', { content: 'hello' }, actor);
    await controller.archive('conv_1', actor);
    await controller.unarchive('conv_1', actor);

    expect(service.create).toHaveBeenCalledWith(actor, { requestId: null });
    expect(service.list).toHaveBeenCalledWith(actor, false);
    expect(service.get).toHaveBeenCalledWith(actor, 'conv_1');
    expect(service.archive).toHaveBeenCalledWith(actor, 'conv_1');
    expect(service.unarchive).toHaveBeenCalledWith(actor, 'conv_1');
  });

  /**
   * 🔴 `dto.content`, not `dto`. The service signature takes a string, so
   * handing it the whole body would compile only if the signature were loose —
   * and the reason it is a string is that `role` must not be caller-supplied
   * (a client posting `role: 'assistant'` would be writing the agent's side of
   * a transcript a person reads before approving something).
   */
  it('unwraps the turn body so role can never arrive from a caller', async () => {
    const { controller, service } = build();

    await controller.addTurn(
      'conv_1',
      { content: 'what licences does this need?' },
      actor,
    );

    expect(service.addTurn).toHaveBeenCalledWith(
      actor,
      'conv_1',
      'what licences does this need?',
    );
  });

  // ── W48 F4 — the SSE endpoint ─────────────────────────────────

  /**
   * 🔴 `defer`, not an `async` handler, and this is the assertion that tells
   * them apart.
   *
   * An `async` handler would resolve the ownership check ONCE, when Nest set the
   * route up. `defer` re-runs it on every subscribe, so a stranger opening an
   * EventSource on somebody else's thread fails as a stream error rather than
   * being waved through by a decision made earlier for someone else.
   */
  it('checks ownership on every subscribe, not once at route setup', async () => {
    const { controller, service } = build();

    const stream = controller.events('conv_1', actor);
    expect(service.get).not.toHaveBeenCalled();

    await firstValueFrom(stream);

    expect(service.get).toHaveBeenCalledWith(actor, 'conv_1');
  });

  it('subscribes to the conversation channel, not the run one', async () => {
    const { controller, queue } = build();

    await firstValueFrom(controller.events('conv_1', actor));

    // A run-shaped subscription would deliver nothing for a thread whose runs
    // change id every turn — the failure would look like "streaming is broken"
    // rather than "wrong channel".
    expect(queue.conversationChanges).toHaveBeenCalledWith('conv_1');
  });

  // ── the documented shape vs the real one (F3-5) ───────────────

  /**
   * 🔴 `F3-5` — `runState` and `prompt` must not reach the wire, and W46 and
   * W47 each leaked a field through a response before this kind of test existed.
   *
   * Both sides are typed, so widening either fails to compile until it is
   * widened here — and then this test says which direction drifted.
   */
  it('documents exactly the fields it selects', () => {
    const selected: Record<keyof typeof CONVERSATION_SELECT, true> = {
      id: true,
      startedById: true,
      requestId: true,
      profileId: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    };
    const documented: Record<keyof AgentConversationDto, true> = {
      id: true,
      startedById: true,
      requestId: true,
      profileId: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      // `GET /:id` only — joins, not columns of CONVERSATION_SELECT.
      turns: true,
      runs: true,
    };

    expect(Object.keys(documented)).toEqual(
      expect.arrayContaining(Object.keys(selected)),
    );
  });

  it('documents exactly the turn fields it selects', () => {
    const selected: Record<keyof typeof TURN_SELECT, true> = {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    };
    const documented: Record<keyof AgentChatTurnDto, true> = {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    };

    expect(Object.keys(documented).sort()).toEqual(
      Object.keys(selected).sort(),
    );
  });

  /**
   * The negative half, stated as its own assertion because the maps above only
   * prove agreement — they cannot say that a DANGEROUS field is absent, since
   * absent from both sides still agrees.
   *
   * `prompt` can be 8000 characters of runtime-editable behaviour (W47 R1) and
   * `runState` is the SDK's unscrubbed model history. Neither belongs on a
   * conversation response, and a conversation joins runs — which is precisely
   * where `runState` would arrive if somebody selected the run rather than
   * three of its columns.
   */
  it('carries neither runState nor prompt', () => {
    const keys = [
      ...Object.keys(CONVERSATION_SELECT),
      ...Object.keys(TURN_SELECT),
    ];
    expect(keys).not.toContain('runState');
    expect(keys).not.toContain('prompt');
  });
});
