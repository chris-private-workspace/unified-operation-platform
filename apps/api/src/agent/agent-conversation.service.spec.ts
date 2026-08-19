import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentConversationService } from './agent-conversation.service';
import type { AiAssistService } from './ai-assist.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgentRunQueue } from './agent-run.queue';

/**
 * W48 F3 / ADR-0041 — what a conversation may do, and to whom.
 *
 * 🔴 The two facts worth a test each, because both are security properties
 * rather than behaviour:
 *   - a thread is readable only by the person who started it (there is no OpCo
 *     to scope by when a conversation has no request)
 *   - `role` is written by the platform, never by a caller
 */
describe('AgentConversationService (W48 F3)', () => {
  const owner = { id: 'user_1', opcoScopeId: null } as unknown as AppUser;
  const other = { id: 'user_2', opcoScopeId: null } as unknown as AppUser;

  const conversationRow = {
    id: 'conv_1',
    startedById: 'user_1',
    requestId: null,
    profileId: null,
    archivedAt: null as Date | null,
    createdAt: new Date('2026-08-18T00:00:00Z'),
    updatedAt: new Date('2026-08-18T00:00:00Z'),
  };

  const build = (overrides: Partial<typeof conversationRow> = {}) => {
    const chatTurnCreate = jest
      .fn()
      .mockResolvedValue({ id: 'turn_1', role: 'user', content: 'hi' });

    const tx = {
      agentChatTurn: { create: chatTurnCreate },
      agentConversation: { update: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      agentConversation: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...conversationRow, ...overrides }),
        create: jest.fn().mockResolvedValue(conversationRow),
        findMany: jest.fn().mockResolvedValue([conversationRow]),
        update: jest.fn().mockResolvedValue(conversationRow),
      },
      agentProfile: { findUnique: jest.fn() },
      request: { findUnique: jest.fn() },
      // W48 F4 — READ only: `recordAssistantTurn` looks up which thread a run
      // belongs to. `agent.boundary.spec.ts` enforces that this service never
      // WRITES AgentRun.
      agentRun: {
        findUnique: jest.fn().mockResolvedValue({ conversationId: 'conv_1' }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    const aiAssist = {
      startConversationRun: jest.fn().mockResolvedValue({
        runId: 'run_1',
        status: 'running',
        proposals: [],
      }),
    };

    const queue = {
      publishConversationChanged: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AgentConversationService(
      prisma as unknown as PrismaService,
      aiAssist as unknown as AiAssistService,
      queue as unknown as AgentRunQueue,
    );
    return { service, prisma, aiAssist, chatTurnCreate, queue };
  };

  // ── ownership ─────────────────────────────────────────────────

  it.each(['get', 'archive', 'unarchive'] as const)(
    '%s refuses somebody else’s conversation',
    async (method) => {
      const { service } = build();

      await expect(service[method](other, 'conv_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it('addTurn refuses somebody else’s conversation before writing anything', async () => {
    const { service, chatTurnCreate, aiAssist } = build();

    await expect(
      service.addTurn(other, 'conv_1', 'hello'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // The order matters as much as the refusal: a turn written before the check
    // would leave a stranger's words in a thread they cannot read.
    expect(chatTurnCreate).not.toHaveBeenCalled();
    expect(aiAssist.startConversationRun).not.toHaveBeenCalled();
  });

  it('lists only the caller’s own threads', async () => {
    const { service, prisma } = build();

    await service.list(owner);

    expect(prisma.agentConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { startedById: owner.id, archivedAt: null },
      }),
    );
  });

  // ── role is the platform's, not the caller's ──────────────────

  it('writes the user role itself', async () => {
    const { service, chatTurnCreate } = build();

    await service.addTurn(owner, 'conv_1', 'which licences?');

    expect(chatTurnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversationId: 'conv_1',
          role: 'user',
          content: 'which licences?',
        },
      }),
    );
  });

  // ── the turn is stored before the run is queued ───────────────

  /**
   * 🔴 The run reads the latest user turn to learn what it was asked
   * (`AiAssistService.inputFor`). Queue-then-write would leave a window where a
   * worker picks the job up and finds no question — a run that would then have
   * to invent one or fail.
   */
  it('stores the turn before queueing the run that answers it', async () => {
    const { service, chatTurnCreate, aiAssist } = build();

    await service.addTurn(owner, 'conv_1', 'hello');

    const wroteAt = chatTurnCreate.mock.invocationCallOrder[0];
    const queuedAt = aiAssist.startConversationRun.mock.invocationCallOrder[0];
    expect(wroteAt).toBeLessThan(queuedAt);
  });

  /**
   * 🔴 D3, at the layer that decides it. The conversation hands its own
   * `requestId` to the run, so a thread with no request produces a run with
   * none — and `AgentToolRegistry.list` then has no request tools to offer.
   * Passing anything else here (the caller's last request, say) would reopen
   * the exact hole D3 closes.
   */
  it('hands the run its own request context, null included', async () => {
    const { service, aiAssist } = build();

    await service.addTurn(owner, 'conv_1', 'hello');

    expect(aiAssist.startConversationRun).toHaveBeenCalledWith(owner, {
      id: 'conv_1',
      requestId: null,
      profileId: null,
    });
  });

  // ── archived is not deleted, and not writable ─────────────────

  it('refuses a turn on an archived conversation', async () => {
    const { service, chatTurnCreate } = build({ archivedAt: new Date() });

    await expect(
      service.addTurn(owner, 'conv_1', 'hello'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(chatTurnCreate).not.toHaveBeenCalled();
  });

  it('archives by setting a timestamp, never by deleting', async () => {
    const { service, prisma } = build();

    await service.archive(owner, 'conv_1');

    expect(prisma.agentConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv_1' },
        data: { archivedAt: expect.any(Date) },
      }),
    );
    expect(prisma.agentConversation).not.toHaveProperty('delete');
  });

  it('unarchives by clearing it', async () => {
    const { service, prisma } = build();

    await service.unarchive(owner, 'conv_1');

    expect(prisma.agentConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: null } }),
    );
  });

  // ── W48 F4 — the agent's side of a turn ───────────────────────

  it('stores the agent’s reply as an assistant turn', async () => {
    const { service, chatTurnCreate } = build();

    await service.recordAssistantTurn('run_1', 'You need SPE_E3 and P2.');

    expect(chatTurnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          conversationId: 'conv_1',
          role: 'assistant',
          content: 'You need SPE_E3 and P2.',
        },
      }),
    );
  });

  it('does nothing for a run that belongs to no conversation', async () => {
    const { service, prisma, chatTurnCreate, queue } = build();
    prisma.agentRun.findUnique.mockResolvedValue({ conversationId: null });

    await service.recordAssistantTurn('run_1', 'hello');

    expect(chatTurnCreate).not.toHaveBeenCalled();
    // And publishes nothing either: there is no thread to notify, and a stray
    // event would be a channel nobody is listening on.
    expect(queue.publishConversationChanged).not.toHaveBeenCalled();
  });

  /**
   * 🔴 `F4-2` — fail loud, and this is the shape it takes on the server.
   *
   * A run that ended with nothing to say (parked at `awaiting_approval`, or
   * failed) stores no turn — the agent did not speak, and writing a line saying
   * so would be the platform talking in its voice. But the thread MUST still be
   * notified: a browser told only about successes shows "thinking…" forever,
   * and a person who is waiting does not retry.
   */
  it.each([[undefined], [''], ['   ']])(
    'notifies the thread even when there is nothing to say (%p)',
    async (output) => {
      const { service, chatTurnCreate, queue } = build();

      await service.recordAssistantTurn('run_1', output);

      expect(chatTurnCreate).not.toHaveBeenCalled();
      expect(queue.publishConversationChanged).toHaveBeenCalledWith('conv_1');
    },
  );

  it('notifies the thread even when storing the reply throws', async () => {
    const { service, prisma, queue } = build();
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordAssistantTurn('run_1', 'a reply'),
    ).rejects.toThrow('db down');

    // The `finally` is the assertion: a storage failure that also silenced the
    // channel would leave the browser waiting on a turn that will never arrive.
    expect(queue.publishConversationChanged).toHaveBeenCalledWith('conv_1');
  });

  // ── creating with context ─────────────────────────────────────

  /**
   * 🔴 Tier 2 `D-CTX` — a request id from the frontend is a HINT, never an
   * authorisation. It goes through the same OpCo check any other read would.
   */
  it('checks the request exists before pinning a conversation to it', async () => {
    const { service, prisma } = build();
    prisma.request.findUnique.mockResolvedValue(null);

    await expect(
      service.create(owner, { requestId: 'req_missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.agentConversation.create).not.toHaveBeenCalled();
  });

  it('refuses a retired profile at creation rather than at the first turn', async () => {
    const { service, prisma } = build();
    prisma.agentProfile.findUnique.mockResolvedValue({
      id: 'prof_1',
      active: false,
    });

    await expect(
      service.create(owner, { profileId: 'prof_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.agentConversation.create).not.toHaveBeenCalled();
  });

  it('stores a conversation with no request context as null, not undefined', async () => {
    const { service, prisma } = build();

    await service.create(owner, {});

    expect(prisma.agentConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { startedById: owner.id, requestId: null, profileId: null },
      }),
    );
  });
});
