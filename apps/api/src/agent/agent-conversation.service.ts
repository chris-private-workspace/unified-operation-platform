import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOpcoScope } from '../auth/opco-scope';
import { AiAssistService } from './ai-assist.service';
import { AgentRunQueue } from './agent-run.queue';
import type { CreateAgentConversationDto } from './dto/agent-conversation.dto';

/**
 * W48 F3 / ADR-0041 — a conversation, and the only writer of `AgentChatTurn`.
 *
 * A run is one task; a conversation is one relationship. They coexist — every
 * turn queues an ordinary `AgentRun` (D4/D8) — but neither impersonates the
 * other, which is why the transcript lives in its own pair of tables and
 * `AgentMessage` was left untouched (D1).
 *
 * 🔴 This service writes `AgentConversation` and `AgentChatTurn` and nothing
 * else. It never writes `AgentRun`: `AiAssistService` owns that table, and a
 * chat that could mint its own run row would be a second way to start agent
 * work — with the approval path applying to only one of them (D8).
 */

/**
 * One turn's ceiling.
 *
 * ⚠️ NOT the answer to `D9` (the conversation-level cost limit). D9 is about a
 * thread whose history grows non-linearly, which is `F4-3`'s problem. This is
 * the far cheaper thing: a single request body that a person could not have
 * typed. Both are needed and neither substitutes for the other.
 */
export const MAX_TURN_LENGTH = 4000;

/** Every column of a turn that leaves this service. */
export const TURN_SELECT = {
  id: true,
  role: true,
  content: true,
  createdAt: true,
} as const;

/**
 * 🔴 `runState` and `prompt` are absent by construction — a conversation never
 * selects a run's state, and it does not read profiles at all. W46 and W47 both
 * leaked a field through a list response, so this is written as one shared
 * constant rather than repeated at each call site.
 */
export const CONVERSATION_SELECT = {
  id: true,
  startedById: true,
  requestId: true,
  profileId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AgentConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAssist: AiAssistService,
    private readonly queue: AgentRunQueue,
  ) {}

  /**
   * W48 F4 — the agent's side of a turn, recorded once its run has ended.
   *
   * 🔴 Called by `AgentRunWorker` with what `executeRun` RETURNED, rather than
   * reading the answer back out of the database. Two reasons and the second is
   * the one that decided it:
   *   1. `finalOutput` is not stored on `AgentRun` at all — it only exists in
   *      the result.
   *   2. The other place the agent's words survive is `AgentMessage`, which is
   *      ADMIN-only and kept forever (ADR-0036 D4/D6). Reading a reply out of
   *      there to show its owner would quietly turn an admin-only audit table
   *      into a user-facing one.
   *
   * 🔴 `F4-2` — the publish happens in `finally`, for a run that FAILED as much
   * as one that finished. A thread told only about successes leaves the browser
   * showing "thinking…" forever, and a person who is waiting does not retry.
   * That is the failure mode `R16` names in another form: a stall reads as
   * progress.
   *
   * ⚠️ A run with no `finalOutput` (parked at `awaiting_approval`, or failed)
   * stores no turn. The agent did not say anything, and inventing a line saying
   * so would be the platform speaking in the agent's voice — into the transcript
   * a person reads before approving something.
   */
  async recordAssistantTurn(runId: string, finalOutput?: string) {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: { conversationId: true },
    });
    if (!run?.conversationId) return;

    const conversationId = run.conversationId;
    try {
      const content = finalOutput?.trim();
      if (!content) return;

      await this.prisma.$transaction(async (tx) => {
        await tx.agentChatTurn.create({
          data: { conversationId, role: 'assistant', content },
          select: { id: true },
        });
        await tx.agentConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });
      });
    } finally {
      await this.queue.publishConversationChanged(conversationId);
    }
  }

  /**
   * Open a thread.
   *
   * `requestId` is optional and checked when present — the frontend supplying
   * one is a HINT, never an authorisation (Tier 2 `D-CTX`), so it goes through
   * the same OpCo check any other read would.
   */
  async create(user: AppUser, dto: CreateAgentConversationDto) {
    const requestId = dto.requestId ?? null;
    if (requestId) {
      const request = await this.prisma.request.findUnique({
        where: { id: requestId },
        select: { opcoId: true },
      });
      if (!request) throw new NotFoundException('Request not found');
      assertOpcoScope(user, request.opcoId);
    }

    if (dto.profileId) {
      const profile = await this.prisma.agentProfile.findUnique({
        where: { id: dto.profileId },
        select: { id: true, active: true },
      });
      if (!profile) throw new NotFoundException('Agent profile not found');
      // Refused here rather than at the first turn: a thread pinned to a
      // retired profile would look fine until somebody spoke to it.
      if (!profile.active) {
        throw new BadRequestException('That agent profile is retired');
      }
    }

    return this.prisma.agentConversation.create({
      data: {
        startedById: user.id,
        requestId,
        profileId: dto.profileId ?? null,
      },
      select: CONVERSATION_SELECT,
    });
  }

  /** This person's threads, most recently used first. */
  async list(user: AppUser, includeArchived = false) {
    return this.prisma.agentConversation.findMany({
      where: {
        startedById: user.id,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      select: CONVERSATION_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** One thread, with its transcript and the runs it started. */
  async get(user: AppUser, id: string) {
    const conversation = await this.prisma.agentConversation.findUnique({
      where: { id },
      select: {
        ...CONVERSATION_SELECT,
        turns: { select: TURN_SELECT, orderBy: { createdAt: 'asc' } },
        runs: {
          select: { id: true, status: true, startedAt: true },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertOwner(user, conversation.startedById);
    return conversation;
  }

  /**
   * Say something, and queue the run that answers it.
   *
   * 🔴 The turn is written BEFORE the run is queued, and the order is
   * load-bearing rather than incidental: the run reads the latest user turn to
   * learn what it was asked (`AiAssistService.inputFor`). Queue-then-write
   * would leave a window where a worker could pick the job up and find no
   * question.
   *
   * ⚠️ Not one transaction, and the failure that leaves is stated rather than
   * hidden: if queueing throws, the person's line is already stored with no run
   * answering it. That is the right direction — what they said is a fact, and
   * losing it to roll back a queue error would be the platform forgetting
   * something a person did. Sending it again produces a new turn and a new run.
   */
  async addTurn(user: AppUser, id: string, content: string) {
    const conversation = await this.prisma.agentConversation.findUnique({
      where: { id },
      select: {
        id: true,
        startedById: true,
        requestId: true,
        profileId: true,
        archivedAt: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertOwner(user, conversation.startedById);
    if (conversation.archivedAt) {
      throw new BadRequestException(
        'This conversation is archived — unarchive it before adding to it',
      );
    }

    const turn = await this.prisma.$transaction(async (tx) => {
      const created = await tx.agentChatTurn.create({
        // 🔴 `role` is set here, never taken from the caller. A client able to
        // post an assistant line could write the agent's side of a transcript
        // a person reads before approving something.
        data: { conversationId: id, role: 'user', content },
        select: TURN_SELECT,
      });
      // Keeps `updatedAt` meaning "last spoken in", which is what the list
      // orders by. Prisma only touches it when the row itself is written.
      await tx.agentConversation.update({
        where: { id },
        data: { updatedAt: new Date() },
        select: { id: true },
      });
      return created;
    });

    const run = await this.aiAssist.startConversationRun(user, {
      id: conversation.id,
      requestId: conversation.requestId,
      profileId: conversation.profileId,
    });

    return { turn, runId: run.runId };
  }

  /**
   * D7 — archive, which hides and does not delete.
   *
   * 🔴 `POST :id/archive`, not `DELETE`, following `ADR-0040 D2`: the verb is
   * the first thing an API says about what it does, and nothing here is
   * removed. The turns stay, the runs stay, and `GET /agent/runs` still lists
   * those runs — an archived conversation can contain a run that was never
   * hidden, which is why `archivedAt` and `AgentRun.hiddenAt` are two columns.
   *
   * ⚠️ Deliberately NOT audited, and the difference from `ADR-0040 D5` is worth
   * stating. That entry exists because hiding a run is an ADMIN acting on
   * something other people can see. Archiving is a person tidying their own
   * thread, which nobody else could read in the first place — an audit row
   * would record a fact with no second party to it.
   */
  async archive(user: AppUser, id: string) {
    return this.setArchived(user, id, new Date());
  }

  /** The undo. `ADR-0040 D2`'s lesson: a one-way switch is the original problem. */
  async unarchive(user: AppUser, id: string) {
    return this.setArchived(user, id, null);
  }

  private async setArchived(
    user: AppUser,
    id: string,
    archivedAt: Date | null,
  ) {
    const conversation = await this.prisma.agentConversation.findUnique({
      where: { id },
      select: { id: true, startedById: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertOwner(user, conversation.startedById);

    return this.prisma.agentConversation.update({
      where: { id },
      data: { archivedAt },
      select: CONVERSATION_SELECT,
    });
  }

  /**
   * 🔴 W48 F3 — a conversation is readable by the person who started it, and by
   * nobody else. Not even ADMIN.
   *
   * This is narrower than every other agent read, and the reason is that the
   * usual bound does not exist here: `getRun` scopes by the run's REQUEST, and
   * a conversation may have none. With no OpCo to check against, the only
   * honest bound left is ownership — and D2 already made `startedById` required
   * for exactly this kind of reason.
   *
   * ⚠️ What this does NOT do is put agent activity out of an admin's sight. The
   * runs a conversation starts are ordinary runs: they appear in the global run
   * list, and their transcript is ADMIN-readable through `AgentMessage`, which
   * ADR-0036 D6 keeps forever. What stays private is the chat wrapper, not what
   * the agent did.
   *
   * Widening this later is a one-line change; narrowing it after people have
   * spoken to it in confidence is not.
   */
  private assertOwner(user: AppUser, startedById: string) {
    if (user.id !== startedById) {
      throw new ForbiddenException('This conversation belongs to someone else');
    }
  }
}
