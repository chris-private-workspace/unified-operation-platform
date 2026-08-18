import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AiAssistService } from './ai-assist.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgentRuntimeProvider,
  type AgentSetup,
  type AgentTurn,
} from './agent-runtime.provider';
import { REDACTED } from '../integration/scrub-pii';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { AgentKillSwitchService } from './kill-switch.service';
import { AgentRunQueue } from './agent-run.queue';
import { AgentProfileService } from './agent-profile.service';
import { ConnectorConfigService } from '../integration/connector-config.service';

/** W47 F3 — the profile every run in this file resolves to unless it says otherwise. */
const PROFILE = {
  id: 'profile-1',
  name: 'test profile',
  model: 'test-model-1',
  prompt: null as string | null,
};

/**
 * W46 F5 — A5, A6 and A7.
 *
 * The three of them are one claim seen from three sides: an agent run produces
 * a PROPOSAL and a RECORD, and never a change. A6 is that it stops, A5 is that
 * nothing moved while it ran, A7 is that the record does not come from the
 * agent's own account of itself (INC-001).
 *
 * The model is mocked throughout (plan §2.1 F10, following the Graph /
 * ServiceNow precedent in CLAUDE.md §3.4). Nothing here needs a live one: every
 * property being pinned is about what the PLATFORM does with a turn, and a real
 * model would only make the input non-deterministic.
 */

const admin = { id: 'u-admin', opcoScopeId: null } as unknown as AppUser;
const opcoIt = { id: 'u-opco', opcoScopeId: 'opco-a' } as unknown as AppUser;

const UPN = 'jerry.wong@rapo.com.hk';
const STATE = '{"$schemaVersion":"1","generatedAt":"x"}';

const assistantSays = (text: string) => ({
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text }],
});

const completedTurn = (providerItems: unknown[] = []): AgentTurn => ({
  status: 'completed',
  state: STATE,
  pendingApprovals: [],
  providerItems,
  finalOutput: 'done',
});

const awaitingTurn = (toolName = 'propose_line_items'): AgentTurn => ({
  status: 'awaiting_approval',
  state: STATE,
  pendingApprovals: [
    {
      ref: 'call-1',
      toolName,
      args: { requestId: 'req-1', items: [{ skuId: 'guid', quantity: 1 }] },
    },
  ],
  providerItems: [assistantSays('Proposing one E5.')],
});

describe('AiAssistService', () => {
  let service: AiAssistService;
  let runtime: { runtime: string; start: jest.Mock; resume: jest.Mock };
  let prisma: {
    request: { findUnique: jest.Mock; update: jest.Mock };
    requestLineItem: { create: jest.Mock; createMany: jest.Mock };
    opcoSkuLedger: { update: jest.Mock; upsert: jest.Mock };
    agentPrincipal: { upsert: jest.Mock };
    agentRun: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    agentStep: { create: jest.Mock };
    agentMessage: { createMany: jest.Mock };
    agentProposal: { create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let killSwitch: { assertEnabled: jest.Mock };
  let queue: { enqueue: jest.Mock; publishChanged: jest.Mock };
  /** W47 F3 — the registry. Resolves to one profile by default; F3-3 has its own describe. */
  let profiles: { resolveForRun: jest.Mock };
  /**
   * W47 F3-5 — reached ONLY by runs that predate the registry. A default value
   * here would hide the difference, so it resolves to `undefined` and the one
   * test that needs it says so out loud.
   */
  let connectorConfig: { resolve: jest.Mock };
  /** Set while `$transaction`'s callback is running (see the mock below). */
  let insideTransaction = false;
  let auditSawOpenTransaction: boolean | null = null;

  /** Every `AgentStep` key written during the test, in order. */
  const stepKeys = () =>
    prisma.agentStep.create.mock.calls.map(
      (call) => (call[0] as { data: { key: string } }).data.key,
    );

  const stepData = () =>
    prisma.agentStep.create.mock.calls.map(
      (call) =>
        (call[0] as { data: Record<string, unknown> }).data as {
          key: string;
          status: string;
          detail: string | null;
          retryable: boolean | null;
          whoFixes: string | null;
        },
    );

  beforeEach(async () => {
    prisma = {
      request: { findUnique: jest.fn(), update: jest.fn() },
      requestLineItem: { create: jest.fn(), createMany: jest.fn() },
      opcoSkuLedger: { update: jest.fn(), upsert: jest.fn() },
      agentPrincipal: { upsert: jest.fn() },
      agentRun: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      agentStep: { create: jest.fn() },
      agentMessage: { createMany: jest.fn() },
      agentProposal: { create: jest.fn(), updateMany: jest.fn() },
      /**
       * The interactive form, with a flag around the callback.
       *
       * 🔴 The flag is the point. Asserting `audit.log` merely ran, or that its
       * first argument === the prisma mock, would pass just as happily for an
       * audit written AFTER the transaction closed — and "the run row exists
       * but nothing recorded it" is the state ADR-0009 D8.1 exists to rule out.
       * This records whether it was called while the transaction was open.
       */
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => {
        insideTransaction = true;
        try {
          return await fn(prisma);
        } finally {
          insideTransaction = false;
        }
      }),
    };
    insideTransaction = false;
    auditSawOpenTransaction = null;
    audit = {
      log: jest.fn().mockImplementation(() => {
        auditSawOpenTransaction = insideTransaction;
        return Promise.resolve();
      }),
    };

    prisma.request.findUnique.mockResolvedValue({
      id: 'req-1',
      opcoId: 'opco-a',
      rawRequestText: 'Please give the new joiner an E5 and Power BI.',
    });
    prisma.agentRun.findFirst.mockResolvedValue(null);
    prisma.agentPrincipal.upsert.mockResolvedValue({
      id: 'principal-1',
      active: true,
    });
    prisma.agentRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.agentRun.update.mockResolvedValue({});
    prisma.agentStep.create.mockResolvedValue({});
    prisma.agentMessage.createMany.mockResolvedValue({ count: 1 });
    prisma.agentProposal.create.mockImplementation(
      (args: { data: { kind: string } }) =>
        Promise.resolve({ id: 'proposal-1', kind: args.data.kind }),
    );

    runtime = {
      runtime: 'openai-agents',
      start: jest.fn().mockResolvedValue(completedTurn()),
      resume: jest.fn(),
    };

    // 期二 G3 — the kill switch. A stub that permits by default, so the tests
    // below keep asking their own questions; the gate has its own describe.
    killSwitch = { assertEnabled: jest.fn().mockResolvedValue(undefined) };

    // 期二 G5-B — the queue. Permits by default; `agent-run.queue.spec.ts`
    // owns its own behaviour, and the gate has its own describe below.
    queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      publishChanged: jest.fn().mockResolvedValue(undefined),
    };

    profiles = {
      resolveForRun: jest.fn().mockResolvedValue(PROFILE),
    };
    connectorConfig = { resolve: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiAssistService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentRuntimeProvider, useValue: runtime },
        { provide: AuditService, useValue: audit },
        { provide: AgentKillSwitchService, useValue: killSwitch },
        { provide: AgentRunQueue, useValue: queue },
        { provide: AgentProfileService, useValue: profiles },
        { provide: ConnectorConfigService, useValue: connectorConfig },
      ],
    }).compile();
    service = moduleRef.get(AiAssistService);
  });

  /**
   * 期二 G5-B — start, then run, the way the queue does it end to end.
   *
   * 🔴 Most of this file predates ADR-0039, when `startRun` did both. Rather
   * than rewrite every test around the split, this helper performs it: a
   * refusal inside `startRun` still propagates identically (the second half
   * never runs), so the tests that assert refusals keep asserting exactly what
   * they asserted before. The tests that care about the SPLIT itself call the
   * two methods directly, below.
   */
  const runFully = async (user: AppUser, requestId = 'req-1') => {
    const started = await service.startRun(user, requestId);
    prisma.agentRun.findUnique.mockResolvedValueOnce({
      id: started.runId,
      status: 'running',
      requestId,
      startedBy: user,
      // W47 F3 — the row carries the profile `startRun` resolved for it.
      profile: PROFILE,
    });
    return service.executeRun(started.runId);
  };

  /**
   * 期二 G3 / plan B5 — the switch is asked BEFORE anything is spent.
   *
   * 🔴 Asserting the ORDER, not just the call. A kill switch consulted after
   * the model call has already been paid for has stopped nothing that costs
   * anything, and "it was checked" would be true of that version too.
   */
  describe('🔴 G3 — the kill switch gates a run', () => {
    it('refuses to start when the agent is switched off, before touching anything', async () => {
      killSwitch.assertEnabled.mockRejectedValue(
        new ConflictException('The AI-Assist agent is switched off.'),
      );

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(runtime.start).not.toHaveBeenCalled();
      expect(prisma.agentRun.create).not.toHaveBeenCalled();
      // Not even the request read: the switch is the first thing in the method.
      expect(prisma.request.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to resume when the agent is switched off', async () => {
      killSwitch.assertEnabled.mockRejectedValue(
        new ConflictException('The AI-Assist agent is switched off.'),
      );

      await expect(
        service.resumeRun('run-1', [{ ref: 'call-1', approved: true }]),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(runtime.resume).not.toHaveBeenCalled();
      // The run row is not even loaded — nothing about this run matters while
      // the capability is off.
      expect(prisma.agentRun.findUnique).not.toHaveBeenCalled();
    });

    /**
     * 期二 G7 — the fact every R13 number is built on.
     *
     * 🔴 `AgentReviewStatsService` defines "a person decided this" as
     * `decidedAt != null`. `abortRun` rejects a run's pending proposals in
     * bulk, and it is the PLATFORM tidying up, not anybody saying no — so it
     * must leave both decision columns alone.
     *
     * Stamping them here would push every approval rate DOWN, i.e. make a
     * reviewer who says yes to everything look more sceptical the more runs got
     * stopped. A risk metric that fails in the reassuring direction is worse
     * than no metric, so the claim is asserted at the one place that could
     * break it.
     */
    it('stopping a run rejects its proposals WITHOUT recording a human decision', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'awaiting_approval',
        steps: [],
        messages: [],
        proposals: [],
        request: { opcoId: 'opco-a' },
      });

      await service.abortRun(admin, 'run-1');

      const { data } = prisma.agentProposal.updateMany.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.status).toBe('rejected');
      expect(data).not.toHaveProperty('decidedAt');
      expect(data).not.toHaveProperty('approvedById');
    });

    /**
     * The race the second check exists for: an admin flips the switch between
     * the gate and the upsert. `startRun` reads `active` again at the point it
     * has the row in hand, and that read is the one that catches it.
     */
    it('still refuses when the principal was deactivated mid-start', async () => {
      prisma.agentPrincipal.upsert.mockResolvedValue({
        id: 'principal-1',
        active: false,
      });

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(runtime.start).not.toHaveBeenCalled();
    });
  });

  // ── A6 — needsApproval really stops the run ────────────────

  describe('A6 — a write tool stops the run', () => {
    it('parks the run at awaiting_approval instead of finishing it', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      const result = await runFully(admin, 'req-1');

      expect(result.status).toBe('awaiting_approval');
      // Stated as its own assertion, because "completed" is the exact wrong
      // answer this acceptance exists to rule out — a run recorded as finished
      // while a write is still waiting on a person.
      expect(result.status).not.toBe('completed');

      const update = prisma.agentRun.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('awaiting_approval');
      expect(update.data.endedAt).toBeUndefined();
    });

    it('writes one AgentProposal carrying the runtime ref and the model args', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      await runFully(admin, 'req-1');

      expect(prisma.agentProposal.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.agentProposal.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({
        runId: 'run-1',
        kind: 'line_items',
        // Without this the platform cannot match a human decision back to the
        // exact tool call when the run resumes (D3 step 4).
        interruptionRef: 'call-1',
        status: 'pending',
      });
      expect(data.approvedById).toBeUndefined();
    });

    it('stores runState so the SAME run can resume, not a new one', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      await runFully(admin, 'req-1');

      const update = prisma.agentRun.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.runState).toBe(STATE);
    });

    it('refuses a pause on a write tool it cannot classify, and ends the run', async () => {
      // Unreachable through today's registry — which is the point: if a future
      // tool ever pauses here, a proposal with a guessed `kind` is a row someone
      // would approve without knowing what they approved.
      //
      // ⚠️ This used to name `propose_assign`. 期二 G1 turned that into a real,
      // classifiable tool, and this test went red the moment it did — correctly:
      // its subject is the UNCLASSIFIABLE case, and its example had stopped
      // being one. The stand-in below is deliberately not on any roadmap.
      runtime.start.mockResolvedValue(awaitingTurn('propose_something_new'));

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prisma.agentProposal.create).not.toHaveBeenCalled();
      const update = prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('failed');
    });
  });

  // ── A7 — the action ledger is the platform's, not the agent's ─

  describe('A7 — AgentStep is written by the platform (INC-001)', () => {
    it('records no step for work the model merely claims to have done', async () => {
      runtime.start.mockResolvedValue(
        completedTurn([
          assistantSays(
            'I have created the line items and assigned the licences.',
          ),
        ]),
      );

      await runFully(admin, 'req-1');

      // The narration produced NO tool execution, so the ledger holds only the
      // lifecycle fact the platform observed itself.
      expect(stepKeys()).toEqual(['start']);
      expect(stepKeys()).not.toContain('propose_line_items');
      expect(stepKeys()).not.toContain('assign_license');
    });

    it('files that claim in the transcript, where its authority level lives', async () => {
      runtime.start.mockResolvedValue(
        completedTurn([assistantSays('I have created the line items.')]),
      );

      await runFully(admin, 'req-1');

      const { data } = prisma.agentMessage.createMany.mock.calls[0][0] as {
        data: { role: string; content: string }[];
      };
      expect(data).toEqual([
        {
          runId: 'run-1',
          role: 'assistant',
          content: 'I have created the line items.',
        },
      ]);
    });

    /**
     * 🔴 The end-to-end half of A8, and it exists because of a gap the
     * falsification run exposed: removing `scrubPii` from `toTranscript`
     * reddened eight tests in `transcript.spec.ts` and NOT ONE here — so
     * "PII cannot reach AgentMessage through this service" was, until now,
     * asserted at one layer and assumed at the other. That is the shape
     * BUG-011 and the `apiPatch` defect both had: every layer green, the
     * defect living in the seam between two of them.
     */
    it('lets nothing email-shaped reach AgentMessage through the service', async () => {
      runtime.start.mockResolvedValue(
        completedTurn([assistantSays(`Assign the E5 to ${UPN} today.`)]),
      );

      await runFully(admin, 'req-1');

      const { data } = prisma.agentMessage.createMany.mock.calls[0][0] as {
        data: { content: string }[];
      };
      expect(data[0].content).toContain(REDACTED);
      expect(data[0].content).not.toMatch(/[\w.+-]+@[\w-]+\.[\w-]+/);
    });

    it('records a step when a tool ACTUALLY ran', async () => {
      let captured: AgentSetup | undefined;
      runtime.start.mockImplementation(async (setup: AgentSetup) => {
        captured = setup;
        return completedTurn();
      });

      await runFully(admin, 'req-1');
      await captured?.onToolExecuted?.({
        toolName: 'search_catalog',
        status: 'ok',
      });

      expect(stepKeys()).toContain('search_catalog');
      const step = stepData().find((s) => s.key === 'search_catalog');
      expect(step?.status).toBe('ok');
    });

    it('scrubs a failed tool detail and says who fixes it', async () => {
      let captured: AgentSetup | undefined;
      runtime.start.mockImplementation(async (setup: AgentSetup) => {
        captured = setup;
        return completedTurn();
      });

      await runFully(admin, 'req-1');
      await captured?.onToolExecuted?.({
        toolName: 'get_request',
        status: 'failed',
        detail: `Resource '/users/${UPN}' does not exist`,
      });

      const step = stepData().find((s) => s.key === 'get_request');
      expect(step?.detail).toContain(REDACTED);
      expect(step?.detail).not.toContain(UPN);
      expect(step?.retryable).toBe(true);
      expect(step?.whoFixes).toBe('platform');
    });
  });

  // ── A5 — a whole run changes nothing outside Agent* ─────────

  describe('A5 — zero side-effects', () => {
    it('touches no domain table across a full run that ends in a proposal', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      await runFully(admin, 'req-1');

      expect(prisma.request.update).not.toHaveBeenCalled();
      expect(prisma.requestLineItem.create).not.toHaveBeenCalled();
      expect(prisma.requestLineItem.createMany).not.toHaveBeenCalled();
      expect(prisma.opcoSkuLedger.update).not.toHaveBeenCalled();
      expect(prisma.opcoSkuLedger.upsert).not.toHaveBeenCalled();
    });

    /**
     * 🔴 F7 changed what A5 can claim, so A5 says the new thing precisely
     * rather than quietly still saying the old one.
     *
     * A run now writes ONE row outside the five `Agent*` tables: the
     * `agent.run_started` audit event. That is sanctioned — ADR-0036 D5 asks
     * for it by name — but it means "zero writes elsewhere" stopped being true
     * the moment F7 landed, and a test that kept asserting the old sentence
     * would be describing a system that no longer exists.
     */
    it('writes exactly one row outside Agent* — the audit event, and nothing else', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      await runFully(admin, 'req-1');

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect((audit.log.mock.calls[0][1] as { action: string }).action).toBe(
        AUDIT_ACTIONS.AGENT_RUN_STARTED,
      );
    });

    /**
     * 🔴 The runtime half above can only fail on a path a test happens to
     * drive. This half reads the file.
     *
     * It is the same device `tool-registry.spec.ts` uses, for the same reason:
     * "this service never writes to the domain" is a claim about all of its
     * code, and only a static check makes it one.
     */
    it('contains no write to a domain model anywhere in its source', () => {
      const source = readFileSync(
        join(__dirname, 'ai-assist.service.ts'),
        'utf8',
      );

      const forbidden = [
        'prisma.request.update',
        'prisma.request.create',
        'prisma.request.upsert',
        'prisma.request.delete',
        'prisma.requestLineItem.',
        'prisma.opcoSkuLedger.',
        'prisma.ledgerAdjustment.',
        'prisma.driftAlert.',
        'prisma.auditLog.',
        // Raw SQL would walk straight past every check above.
        '$executeRaw',
        '$queryRaw',
      ];

      for (const needle of forbidden) {
        expect(source).not.toContain(needle);
      }
    });
  });

  // ── the run row itself ─────────────────────────────────────

  describe('the run row', () => {
    it('stores who started it, so a resumed run recovers the same OpCo scope', async () => {
      await runFully(opcoIt, 'req-1');

      const { data } = prisma.agentRun.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({
        startedById: 'u-opco',
        requestId: 'req-1',
        principalId: 'principal-1',
        status: 'running',
      });
    });

    it('gives the tools the caller as their scope', async () => {
      let captured: AgentSetup | undefined;
      runtime.start.mockImplementation(async (setup: AgentSetup) => {
        captured = setup;
        return completedTurn();
      });

      await runFully(opcoIt, 'req-1');

      // W48 F3-4 — `requestId` joins the context, and `toEqual` (not
      // `objectContaining`) is what made this test notice. That is the point:
      // the shape a run hands its tools decides which tools exist, so a silent
      // addition to it is exactly what should fail here.
      expect(captured?.ctx).toEqual({
        runId: 'run-1',
        user: opcoIt,
        requestId: 'req-1',
      });
    });

    it('records the runtime that is actually running on the principal', async () => {
      await runFully(admin, 'req-1');

      const call = prisma.agentPrincipal.upsert.mock.calls[0][0] as {
        update: { runtime: string };
        create: { runtime: string };
      };
      expect(call.update.runtime).toBe('openai-agents');
      expect(call.create.runtime).toBe('openai-agents');
    });

    it('marks a run that blew up as failed rather than leaving it running', async () => {
      runtime.start.mockRejectedValue(new Error(`Graph said ${UPN} is gone`));

      await expect(runFully(admin, 'req-1')).rejects.toThrow();

      const update = prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('failed');
      expect(update.data.endedAt).toBeInstanceOf(Date);

      const step = stepData().find((s) => s.key === 'run');
      expect(step?.status).toBe('failed');
      expect(step?.detail).toContain(REDACTED);
      expect(step?.detail).not.toContain(UPN);
    });
  });

  // ── F7 — audit ─────────────────────────────────────────────

  describe('F7 — agent.run_started', () => {
    it('records the event against the run, with the HUMAN as actor', async () => {
      await runFully(opcoIt, 'req-1');

      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][1] as Record<string, unknown>;
      expect(entry).toMatchObject({
        action: AUDIT_ACTIONS.AGENT_RUN_STARTED,
        targetType: 'AgentRun',
        targetId: 'run-1',
        // 🔴 The person, not the agent. `actorType` is left at its 'user'
        // default because a person really did start this — and `AuditLog.actorId`
        // is a foreign key to AppUser, so an AgentPrincipal id could not go
        // there even if we wanted it to.
        actorId: 'u-opco',
      });
      expect(entry.actorType).toBeUndefined();
    });

    it('names WHICH agent in metadata — the one fact actorId cannot carry', async () => {
      await runFully(admin, 'req-1');

      const entry = audit.log.mock.calls[0][1] as { metadata: unknown };
      expect(entry.metadata).toEqual({ source: 'ai-assist' });
    });

    it('🔴 A11 — passes no before/after at all', async () => {
      await runFully(admin, 'req-1');

      // Belt and braces with the whitelist test in audit-fields.spec.ts: that
      // one proves the filter drops everything, this one proves the call site
      // never even offers it. Either alone leaves the other half assumed.
      const entry = audit.log.mock.calls[0][1] as Record<string, unknown>;
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
    });

    it('writes the audit row INSIDE the same transaction as the run row', async () => {
      await runFully(admin, 'req-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // ADR-0009 D8.1 — "done but unrecorded" is worse than "not done", and
      // here nothing irreversible precedes it, so both can roll back together.
      expect(auditSawOpenTransaction).toBe(true);
    });

    it('writes no audit row when the request is refused before a run exists', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  // ── resume (F6) ────────────────────────────────────────────

  /**
   * 期二 G5-B / ADR-0039 F1 — the POST queues; it no longer runs the agent.
   *
   * 🔴 This is the H1 half of the change. The response shape did not move (F2),
   * so nothing here is about JSON: what these pin is that the model is not
   * called on the request thread, and that a run which cannot be queued does
   * not become a permanently stuck row.
   */
  describe('🔴 G5-B — starting a run only queues it', () => {
    it('returns without calling the model at all', async () => {
      const result = await service.startRun(admin, 'req-1');

      // The whole point of ADR-0039 F1. If this ever goes green with the
      // runtime called, the HTTP request is waiting on an LLM again.
      expect(runtime.start).not.toHaveBeenCalled();
      expect(result).toEqual({
        runId: 'run-1',
        status: 'running',
        proposals: [],
      });
    });

    it('hands the run id to the queue', async () => {
      await service.startRun(admin, 'req-1');

      expect(queue.enqueue).toHaveBeenCalledWith('run-1');
    });

    it('records the start step before queueing, so the card is never empty', async () => {
      await service.startRun(admin, 'req-1');

      // A queued run whose card shows nothing looks broken for as long as the
      // worker takes to pick it up.
      expect(stepKeys()).toEqual(['start']);
    });

    /**
     * 🔴🔴 The one that would have shipped a permanent block.
     *
     * The row exists and says `running` by the time `enqueue` is reached. Left
     * there, OQ-3 (one non-terminal run per request) locks that request out of
     * ever getting another run — and `AgentRunExpiryService` deliberately does
     * NOT sweep `running`, so nothing clears it. That is the exact shape 期二
     * G5-A found in `resumeRun`'s R16 early return, arriving through a
     * different door: an outage rather than an SDK upgrade.
     */
    it('ends the run when it cannot be queued, rather than leaving it running forever', async () => {
      queue.enqueue.mockRejectedValue(
        new ServiceUnavailableException('Redis is unreachable'),
      );

      await expect(service.startRun(admin, 'req-1')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(prisma.agentRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });
  });

  describe('executeRun — what the worker does', () => {
    const runRow = (over: Record<string, unknown> = {}) => ({
      id: 'run-1',
      status: 'running',
      requestId: 'req-1',
      startedBy: opcoIt,
      // W47 F3 — read off the ROW, not the registry: a queued job can execute
      // after an admin has edited or retired the profile it started on.
      profile: PROFILE,
      ...over,
    });

    /**
     * 🔴 The worker has no session. Scope comes off `startedBy`, which is the
     * second time ADR-0036 F1-6's required column earns its keep (the first was
     * `resumeRun` after an overnight approval).
     */
    it('applies the STARTER’s scope, taken from the row', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(runRow());

      await service.executeRun('run-1');

      const setup = runtime.start.mock.calls[0][0] as AgentSetup;
      expect(setup.ctx.user).toBe(opcoIt);
    });

    it('never selects runState — the worker has no use for the model history', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(runRow());

      await service.executeRun('run-1');

      const select = (
        prisma.agentRun.findUnique.mock.calls[0][0] as {
          select: Record<string, unknown>;
        }
      ).select;
      expect(select).not.toHaveProperty('runState');
    });

    /**
     * 🔴 Refused WITHOUT `failRun`, unlike everything else in this method.
     *
     * A run that is no longer `running` already reached an outcome — aborted,
     * expired, or a duplicate job arriving late. Marking it `failed` would
     * overwrite a real result with a wrong one, which is worse than the
     * duplicate it guards against.
     */
    it('refuses a run that already ended, without overwriting its outcome', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(
        runRow({ status: 'aborted' }),
      );

      await expect(service.executeRun('run-1')).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.agentRun.update).not.toHaveBeenCalled();
      expect(runtime.start).not.toHaveBeenCalled();
    });

    /**
     * 🔴🔴 The kill switch is checked INSIDE the try, and this test is why.
     *
     * `startRun` checked it, but a switch exists to be flipped in exactly the
     * gap between queueing and running. Were the check above the `try` — the
     * obvious place — a disabled agent would throw and leave the row at
     * `running` forever. Once (G5-A's R16 early return) was a bug; twice would
     * be a pattern.
     */
    it('ends the run when the switch was flipped after it was queued', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(runRow());
      killSwitch.assertEnabled.mockRejectedValue(
        new ConflictException('The ai-assist agent is switched off'),
      );

      await expect(service.executeRun('run-1')).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.agentRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('refuses a run that does not exist', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(null);

      await expect(service.executeRun('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * 期二 G6 / ADR-0039 F10 — every change reaches the browser.
   *
   * 🔴 The risk this guards is not a crash, it is a card that stops updating
   * and gives no sign of it. Both halves matter: steps publish because
   * `writeStep` is the single writer, and status changes publish because they
   * are the one kind of change `writeStep` cannot see.
   */
  describe('🔴 G6 — publishing changes', () => {
    it('publishes on every step', async () => {
      await runFully(admin);

      expect(queue.publishChanged.mock.calls.length).toBeGreaterThanOrEqual(
        stepKeys().length,
      );
      for (const call of queue.publishChanged.mock.calls) {
        expect(call).toEqual(['run-1']);
      }
    });

    /**
     * 🔴 The sharp one: a completed run's status change writes NO step, so a
     * publish that only rode on `writeStep` would leave a browser sitting on
     * `running` until it gave up. Counting rather than merely asserting "it was
     * called" is what makes that visible — the step publishes would satisfy a
     * looser assertion on their own.
     */
    it('publishes the completion, which writes no step of its own', async () => {
      await runFully(admin);

      expect(queue.publishChanged).toHaveBeenCalledTimes(stepKeys().length + 1);
    });

    it('publishes after a run parks for approval', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      await runFully(admin);

      // start + proposal steps, then the status change to awaiting_approval.
      expect(queue.publishChanged).toHaveBeenCalledTimes(stepKeys().length + 1);
    });

    it('publishes after a run is stopped', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'running',
        request: { opcoId: 'opco-a' },
        steps: [],
        messages: [],
        proposals: [],
      });

      await service.abortRun(admin, 'run-1');

      expect(queue.publishChanged).toHaveBeenCalledWith('run-1');
    });

    it('publishes after a run expires', async () => {
      await service.expireRun('run-1', 'nobody decided');

      expect(queue.publishChanged).toHaveBeenCalledWith('run-1');
    });

    /**
     * 🔴 The "a failed publish must not fail a step" guarantee lives in ONE
     * place — `publishChanged` swallows, and `agent-run.queue.spec.ts` pins it.
     * This service deliberately does NOT catch a second time.
     *
     * ⚠️ Which makes this test read backwards at first glance: a rejecting mock
     * DOES propagate here. That is the correct answer, and the first draft of
     * this test got it wrong — it was named "does not let a publishing failure
     * break a run" and then asserted that it does. Two layers each promising
     * the same thing is how one of them drifts unnoticed, and the survivor
     * would be the one nobody reads.
     */
    it('leans on the queue to swallow, instead of catching a second time', async () => {
      queue.publishChanged.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(runFully(admin)).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('resumeRun', () => {
    const parkedRun = (overrides: Record<string, unknown> = {}) => ({
      id: 'run-1',
      status: 'awaiting_approval',
      runState: STATE,
      startedBy: opcoIt,
      profile: PROFILE,
      ...overrides,
    });

    beforeEach(() => {
      prisma.agentRun.findUnique.mockResolvedValue(parkedRun());
      runtime.resume.mockResolvedValue(completedTurn());
    });

    /**
     * 🔴 The reason `startedById` is a required column with a foreign key.
     *
     * An approver is ADMIN or REGIONAL and therefore usually unscoped. If the
     * resumed run took ITS scope from them, an approval would quietly widen
     * what the agent can read halfway through its own run — and nothing would
     * report that, because every tool would still be doing exactly what it was
     * told.
     */
    it('applies the run STARTER’s scope, never the approver’s', async () => {
      await service.resumeRun('run-1', [{ ref: 'call-1', approved: true }]);

      const setup = runtime.resume.mock.calls[0][0] as AgentSetup;
      expect(setup.ctx.user).toBe(opcoIt);
      expect(setup.ctx.runId).toBe('run-1');
    });

    it('hands the saved state and the decision to the runtime', async () => {
      const decisions = [{ ref: 'call-1', approved: false, reason: 'no' }];

      await service.resumeRun('run-1', decisions);

      expect(runtime.resume.mock.calls[0][1]).toBe(STATE);
      expect(runtime.resume.mock.calls[0][2]).toBe(decisions);
    });

    it('completes the run when the agent finishes', async () => {
      const result = await service.resumeRun('run-1', [
        { ref: 'call-1', approved: true },
      ]);

      expect(result.status).toBe('completed');
      const update = prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('completed');
      expect(update.data.endedAt).toBeInstanceOf(Date);
    });

    it('parks again when the agent proposes something else', async () => {
      runtime.resume.mockResolvedValue(awaitingTurn());

      const result = await service.resumeRun('run-1', [
        { ref: 'call-1', approved: true },
      ]);

      expect(result.status).toBe('awaiting_approval');
      expect(prisma.agentProposal.create).toHaveBeenCalledTimes(1);
    });

    it('refuses to resume a run that is not waiting on anyone', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(
        parkedRun({ status: 'completed' }),
      );

      await expect(
        service.resumeRun('run-1', [{ ref: 'call-1', approved: true }]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(runtime.resume).not.toHaveBeenCalled();
    });

    it.each([[null], [''], [{ not: 'a string' }]])(
      'refuses loudly when the saved state is unreadable: %p (R16)',
      async (runState) => {
        prisma.agentRun.findUnique.mockResolvedValue(parkedRun({ runState }));

        // 🔴 Loudly, and specifically NOT by starting a fresh run from the same
        // input: a new run would derive its own tool calls and execute them
        // under an approval that was never given for them.
        await expect(
          service.resumeRun('run-1', [{ ref: 'call-1', approved: true }]),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(runtime.start).not.toHaveBeenCalled();
        expect(runtime.resume).not.toHaveBeenCalled();
      },
    );

    /**
     * 🔴🔴 期二 G5 — throwing was not enough, and this is the assertion that
     * says so.
     *
     * Before G5 this path threw and left the row at `awaiting_approval`
     * FOREVER. OQ-3 allows one non-terminal run per request, so a single
     * unreadable state permanently locked that request out of ever getting
     * another run, with no path back (plan OQ-5 ①).
     *
     * ⚠️ Where the defect lived is the part worth remembering: this check sits
     * BEFORE the `try` that calls `failRun`, so it was the one early return
     * nobody handled — and nothing in the file looked wrong.
     */
    it('ends the run instead of leaving it parked forever (OQ-5 / R16)', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(parkedRun({ runState: '' }));

      await expect(
        service.resumeRun('run-1', [{ ref: 'call-1', approved: true }]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const update = prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('expired');
      expect(update.data.endedAt).toBeInstanceOf(Date);
    });
  });

  // ── expiry (期二 G5 / plan OQ-5) ────────────────────────────

  describe('expireRun', () => {
    it('marks the run expired and records why on the action ledger', async () => {
      await service.expireRun('run-1', 'No decision was made within 7 days');

      const step = prisma.agentStep.create.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(step.data.key).toBe('expired');
      expect(step.data.status).toBe('failed');
      expect(step.data.detail).toContain('7 days');
      // Honest, not pessimistic: there is no "try again" for this run — its
      // state is either too old to trust or unreadable, so the repair is a
      // person starting a new one.
      expect(step.data.retryable).toBe(false);
      expect(step.data.whoFixes).toBe('operator');

      const update = prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('expired');
    });

    /**
     * 🔴 `expired`, not `aborted` — and the reason is G7, not tidiness.
     * `aborted` already means "the platform cleared this up on instruction".
     * Merging expiry into it would blend "nobody reviewed this" with "the
     * platform stopped it", and the first is exactly what R13 measures.
     */
    it('does not reuse the aborted status', async () => {
      await service.expireRun('run-1', 'anything');
      const update = prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).not.toBe('aborted');
    });

    /**
     * 🔴🔴 The assertion G7 depends on.
     *
     * Writing `decidedAt` here would put every expired proposal into
     * review-stats' population as a rejection — so a team that ignores
     * proposals until they lapse would show a FALLING approval rate, i.e. would
     * look more sceptical the less they read. A risk metric must not improve
     * when the behaviour it measures gets worse.
     */
    it('rejects pending proposals WITHOUT writing the decision columns', async () => {
      await service.expireRun('run-1', 'No decision was made within 7 days');

      const call = prisma.agentProposal.updateMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      expect(call.where).toEqual({ runId: 'run-1', status: 'pending' });
      expect(call.data.status).toBe('rejected');
      expect(call.data.rejectedReason).toContain('expired');
      // Absent, not null: either spelling of "we wrote it" is the bug.
      expect(call.data).not.toHaveProperty('decidedAt');
      expect(call.data).not.toHaveProperty('approvedById');
    });
  });

  // ── the refusals ───────────────────────────────────────────

  describe('refusals', () => {
    it('refuses a second open run on the same request (OQ-3)', async () => {
      prisma.agentRun.findFirst.mockResolvedValue({
        id: 'run-0',
        status: 'awaiting_approval',
      });

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.agentRun.create).not.toHaveBeenCalled();
      expect(runtime.start).not.toHaveBeenCalled();
    });

    it('treats all three non-terminal statuses as open', async () => {
      // Spelled out rather than read from the exported constant: importing it
      // would make this assertion agree with whatever the code says, which is
      // the one thing it must not do. Dropping `approved` from the list is the
      // regression being pinned — an approved-but-not-yet-resumed run is very
      // much still in progress.
      await runFully(admin, 'req-1');

      const where = (
        prisma.agentRun.findFirst.mock.calls[0][0] as {
          where: { status: { in: string[] } };
        }
      ).where;
      expect(where.status.in).toEqual([
        'running',
        'awaiting_approval',
        'approved',
      ]);
    });

    it('refuses a request with no free-text wording', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        opcoId: 'opco-a',
        rawRequestText: '   ',
      });

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // No run row, so no paid round-trip whose only possible output is a guess.
      expect(prisma.agentRun.create).not.toHaveBeenCalled();
    });

    it('refuses a request outside the caller’s OpCo scope', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        opcoId: 'opco-b',
        rawRequestText: 'anything',
      });

      await expect(runFully(opcoIt, 'req-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.agentRun.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown request', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to run under a deactivated principal', async () => {
      prisma.agentPrincipal.upsert.mockResolvedValue({
        id: 'principal-1',
        active: false,
      });

      await expect(runFully(admin, 'req-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(runtime.start).not.toHaveBeenCalled();
    });
  });

  /**
   * 🔴 F10-2 — the gate here is the QUERY SHAPE, and that is why it needed its
   * own test rather than an assertion on a returned object.
   *
   * `runState` is the SDK's serialised state: the model's message history,
   * verbatim and never scrubbed (D6 scrubs on the way into `AgentMessage`,
   * which is a different column written for a different purpose). Selecting it
   * here would hand the client the unredacted original of the very transcript
   * the platform is careful to redact.
   *
   * The falsification that produced these tests: putting `runState: true` back
   * into the `select` left all 138 agent tests green. Nothing was watching —
   * and because Prisma is mocked, no assertion on the RETURN value ever could
   * be. The mock returns whatever the test tells it to, so only the arguments
   * the service passes to Prisma carry the fact.
   */
  describe('getRun — the API read path may not carry runState', () => {
    const parked = {
      id: 'run-1',
      requestId: 'req-1',
      status: 'awaiting_approval',
      steps: [],
      messages: [],
      proposals: [],
      request: { opcoId: 'opco-a' },
    };

    /** The single argument object handed to `agentRun.findUnique`. */
    const findUniqueArg = () =>
      prisma.agentRun.findUnique.mock.calls.at(-1)?.[0] as {
        select?: Record<string, unknown>;
        include?: Record<string, unknown>;
      };

    it('never selects runState', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(parked);

      await service.getRun(admin, 'run-1');

      // Falsy, not absent: `runState: false` is a legitimate spelling that also
      // does not leak. What must never happen is it being asked for.
      expect(findUniqueArg().select?.runState).toBeFalsy();
    });

    it('uses select rather than include, because include returns every scalar', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(parked);

      await service.getRun(admin, 'run-1');

      // `include` pulls the relations AND every scalar on the row, so it
      // reintroduces `runState` no matter how carefully the relations are
      // listed. The two assertions are not redundant: the one above catches an
      // added field, this one catches the shorter spelling.
      expect(findUniqueArg().include).toBeUndefined();
      expect(findUniqueArg().select).toBeDefined();
    });

    it('sends the request-card read down the same path, not a second query', async () => {
      prisma.request.findUnique.mockResolvedValue({ opcoId: 'opco-a' });
      prisma.agentRun.findFirst.mockResolvedValue({ id: 'run-1' });
      prisma.agentRun.findUnique.mockResolvedValue(parked);

      await service.findLatestForRequest(admin, 'req-1');

      // If this ever stops going through getRun, the guard above stops
      // covering the endpoint the card actually calls.
      expect(prisma.agentRun.findUnique).toHaveBeenCalledTimes(1);
      expect(findUniqueArg().select?.runState).toBeFalsy();
      expect(findUniqueArg().include).toBeUndefined();
    });

    it('still refuses a run belonging to another OpCo', async () => {
      // opcoIt is scoped to opco-a; this run hangs off a request in opco-b.
      prisma.agentRun.findUnique.mockResolvedValue({
        ...parked,
        request: { opcoId: 'opco-b' },
      });

      await expect(service.getRun(opcoIt, 'run-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    /**
     * 🔴 W47 `F1-5` / `R2` — the run that predates the registry.
     *
     * Every run that exists on the day W47 deploys has `profileId = null`, and
     * they are the majority for a while. A read path that assumed a profile
     * would 500 on all of them at once — on the request detail card, which is
     * where anybody would be looking.
     */
    it('reads a run started before the registry existed', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        ...parked,
        profileId: null,
        profile: null,
      });

      const run = await service.getRun(admin, 'run-1');

      expect(run.id).toBe('run-1');
      // Null is the ANSWER, not a gap: OQ-D shows these as "(before W47)"
      // rather than hiding them.
      expect(run.profileId).toBeNull();
      expect(run.profile).toBeNull();
    });

    it('never selects the profile prompt onto the run response', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(parked);

      await service.getRun(admin, 'run-1');

      // A prompt can be 8000 characters and belongs to the registry screen. On
      // this path it would ship the agent's instructions to everyone who can
      // read a run, on every poll.
      const profileSelect = findUniqueArg().select?.profile as
        { select?: Record<string, unknown> } | undefined;
      expect(profileSelect?.select?.prompt).toBeFalsy();
    });
  });

  /**
   * W47 F3 — which profile a run uses, and what happens when that is unclear.
   */
  describe('F3 — the run picks a profile', () => {
    it('stores the resolved profile on the run row', async () => {
      await service.startRun(admin, 'req-1', 'prof-9');

      expect(profiles.resolveForRun).toHaveBeenCalledWith(
        'prof-9',
        'principal-1',
      );
      const created = prisma.agentRun.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(created.data.profileId).toBe(PROFILE.id);
    });

    /**
     * 🔴 The refusal must land BEFORE the row exists, and this is the assertion
     * that says so.
     *
     * OQ-3 allows one non-terminal run per request. A refusal that left a
     * `running` row behind would count against that request forever — the same
     * permanent block 期二 G5-A found twice in this file, arriving through a
     * third door. "It threw" would be equally true of the broken version.
     */
    it('refuses an unusable profile without creating a run', async () => {
      profiles.resolveForRun.mockRejectedValue(
        new BadRequestException('That agent profile does not exist'),
      );

      await expect(
        service.startRun(admin, 'req-1', 'prof-gone'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.agentRun.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('hands the profile’s model and prompt to the runtime', async () => {
      profiles.resolveForRun.mockResolvedValue({
        ...PROFILE,
        model: 'a-specific-model',
        prompt: 'Only ever propose Power BI.',
      });
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'running',
        requestId: 'req-1',
        startedBy: admin,
        profile: {
          id: 'profile-1',
          name: 'test profile',
          model: 'a-specific-model',
          prompt: 'Only ever propose Power BI.',
        },
      });

      await service.executeRun('run-1');

      const setup = runtime.start.mock.calls[0][0] as AgentSetup;
      expect(setup.model).toBe('a-specific-model');
      // 🔴 REPLACES the built-in instructions rather than appending. Two sets of
      // instructions that disagree produce behaviour neither author predicted,
      // and an admin reading their own prompt on screen would have no way to
      // know what else sits in front of it.
      expect(setup.instructions).toBe('Only ever propose Power BI.');
    });

    it('treats a blank prompt as “not set” and keeps the built-in instructions', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'running',
        requestId: 'req-1',
        startedBy: admin,
        profile: { ...PROFILE, prompt: '   ' },
      });

      await service.executeRun('run-1');

      const setup = runtime.start.mock.calls[0][0] as AgentSetup;
      expect(setup.instructions).toContain('AI-Assist');
      expect(setup.instructions).not.toBe('   ');
    });

    /**
     * 🔴 F3-5 — the compatibility path, and the reason it is not a fallback.
     *
     * A run sitting at `awaiting_approval` when W47 deploys has no profile. If
     * resuming refused, that run would be stranded and its request blocked
     * (OQ-3 again). So the environment still answers for those — and ONLY those,
     * because `startRun` writes `profileId` on every row it creates.
     */
    it('resumes a pre-registry run on the configured model', async () => {
      connectorConfig.resolve.mockResolvedValue('legacy-model');
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'awaiting_approval',
        runState: '{"state":1}',
        startedBy: admin,
        profile: null,
      });
      runtime.resume.mockResolvedValue(completedTurn());

      await service.resumeRun('run-1', []);

      const setup = runtime.resume.mock.calls[0][0] as AgentSetup;
      expect(setup.model).toBe('legacy-model');
      expect(connectorConfig.resolve).toHaveBeenCalledWith(
        'agent',
        'agentModel',
      );
    });

    /**
     * ⚠️ The other half of the same rule: a pre-registry run with nothing
     * configured is refused OUT LOUD rather than run on a guessed model. OQ-1's
     * "no default anywhere" survives the move to the seam.
     */
    it('refuses a pre-registry run when nothing is configured either', async () => {
      connectorConfig.resolve.mockResolvedValue(undefined);
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'awaiting_approval',
        runState: '{"state":1}',
        startedBy: admin,
        profile: null,
      });

      await expect(service.resumeRun('run-1', [])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(runtime.resume).not.toHaveBeenCalled();
    });

    /**
     * 🔴 A profile retired mid-flight still finishes the run it started.
     *
     * `active: false` stops NEW runs (`resolveForRun` refuses it). Applying it
     * to a run already in flight would strand every `awaiting_approval` run the
     * moment somebody tidied the registry — a permanent block triggered by a
     * routine admin action rather than by a bug.
     */
    it('resumes on a profile that has since been retired', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'awaiting_approval',
        runState: '{"state":1}',
        startedBy: admin,
        profile: { ...PROFILE, model: 'retired-model' },
      });
      runtime.resume.mockResolvedValue(completedTurn());

      await service.resumeRun('run-1', []);

      const setup = runtime.resume.mock.calls[0][0] as AgentSetup;
      expect(setup.model).toBe('retired-model');
      // The registry is not consulted at all on this path — the row is.
      expect(profiles.resolveForRun).not.toHaveBeenCalled();
    });
  });

  /**
   * W47 F4 — the global run list.
   *
   * The structural gap W46 left: runs were only ever reachable one request at a
   * time, so "what has this agent been doing" had no answer that did not start
   * with knowing which request to look at.
   */
  describe('F4 — listing runs', () => {
    const listArg = () =>
      prisma.agentRun.findMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
        select: Record<string, unknown>;
        take: number;
        cursor?: { id: string };
        skip?: number;
        orderBy: unknown;
      };

    beforeEach(() => {
      prisma.agentRun.findMany.mockResolvedValue([]);
    });

    /**
     * 🔴 The merge-shaped defect, pinned — CH-031 / ADR-0040 × W47.
     *
     * ADR-0040 hid runs from the request card; W47 added a list that answers
     * "what has this agent been doing" for the whole platform. NEITHER branch
     * could have written this test, because on each of them one of the two
     * things did not exist — so a textually clean merge shipped a global list
     * that showed every hidden run, with both suites green.
     *
     * That makes this assertion the only place the rule is stated: hidden means
     * hidden everywhere that is a LIST. `getRun` stays unfiltered on purpose
     * (D3) — that asymmetry is the whole difference from a delete.
     *
     * Both callers are exercised because the clause is unconditional: a scoped
     * user with filters is the shape most likely to be rewritten later.
     */
    it('never lists hidden runs, for any caller or filter', async () => {
      await service.listRuns(admin);
      expect(listArg().where.hiddenAt).toBeNull();

      await service.listRuns(opcoIt, { status: 'running', profileId: 'p1' });
      expect(listArg().where.hiddenAt).toBeNull();
    });

    /**
     * 🔴 F4-4 — `runState` may not reach the wire, and a LIST is the easiest
     * place for that to go wrong: nobody reads a list response, so an `include`
     * here would hand out the model's unscrubbed history for every run at once
     * and look like nothing at all.
     */
    it('never selects runState', async () => {
      await service.listRuns(admin);

      expect(listArg().select.runState).toBeFalsy();
      expect(listArg().select).toBeDefined();
    });

    /**
     * 🔴 F4-2, and NOT what the plan said.
     *
     * The plan's wording was "scope comes from the starter". That belongs to
     * `OQ-2` (what an agent may see WHILE running); applying it to visibility
     * would disagree with `getRun`, which scopes on the run's REQUEST — so the
     * list would hide rows that the very next click opens successfully.
     */
    it('shows a scoped user only runs whose request is in their OpCo', async () => {
      await service.listRuns(opcoIt);

      expect(listArg().where.request).toEqual({ is: { opcoId: 'opco-a' } });
    });

    /**
     * ⚠️ The other half, and it is not symmetrical: for an unscoped user the
     * clause must be ABSENT, not `{ is: {} }`. A relation filter — even an empty
     * one — makes Prisma require the relation to exist, which would silently
     * drop every run that has no request from an ADMIN's list.
     */
    it('applies no request filter at all for an unscoped user', async () => {
      await service.listRuns(admin);

      expect(listArg().where.request).toBeUndefined();
    });

    it('filters by status, profile and start time', async () => {
      const since = new Date('2026-08-01T00:00:00.000Z');

      await service.listRuns(admin, {
        status: 'awaiting_approval',
        profileId: 'prof-1',
        since,
      });

      expect(listArg().where).toMatchObject({
        status: 'awaiting_approval',
        profileId: 'prof-1',
        startedAt: { gte: since },
      });
    });

    it('leaves out the filters that were not asked for', async () => {
      await service.listRuns(admin, { status: 'running' });

      const where = listArg().where;
      expect(where.status).toBe('running');
      // Present-but-undefined would be the same to Prisma, but not to a reader,
      // and `profileId: undefined` in a where clause is one refactor away from
      // `profileId: null`, which means something entirely different.
      expect('profileId' in where).toBe(false);
      expect('startedAt' in where).toBe(false);
    });

    /**
     * 🔴 `R5` — real paging, and the assertion is on `take`.
     *
     * "Supports pagination" is easy to claim with `take: 1000` and a `limit`
     * nobody enforces. The ceiling is enforced twice (DTO and service) because
     * the DTO stops being the only door the moment anything else calls this.
     */
    it('caps how much can be asked for at once', async () => {
      await service.listRuns(admin, { limit: 5000 });

      expect(listArg().take).toBe(101);
    });

    it('asks for one row more than requested, to know whether there is a next page', async () => {
      await service.listRuns(admin, { limit: 10 });

      expect(listArg().take).toBe(11);
    });

    it('skips the cursor row itself, so a page never repeats its predecessor’s last row', async () => {
      await service.listRuns(admin, { cursor: 'run-7' });

      expect(listArg().cursor).toEqual({ id: 'run-7' });
      expect(listArg().skip).toBe(1);
    });

    /**
     * ⚠️ Two runs can share `startedAt` to the millisecond — the queue starts
     * them in bursts. Without the `id` tiebreak the order is undefined between
     * them, and cursor paging then skips or repeats rows at page boundaries:
     * a bug that only appears under load and never reproduces.
     */
    it('orders by start time with id as a tiebreak', async () => {
      await service.listRuns(admin);

      expect(listArg().orderBy).toEqual([
        { startedAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('hands back a cursor only when there really is another page', async () => {
      prisma.agentRun.findMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({ id: `run-${i}` })),
      );

      const page = await service.listRuns(admin, { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBe('run-1');
    });

    it('returns a null cursor on the last page, rather than omitting it', async () => {
      prisma.agentRun.findMany.mockResolvedValue([{ id: 'run-0' }]);

      const page = await service.listRuns(admin, { limit: 2 });

      expect(page.items).toHaveLength(1);
      // Null rather than undefined: "no next page" is an answer the client can
      // read, not a missing field it has to guess the meaning of.
      expect(page.nextCursor).toBeNull();
    });
  });

  /**
   * CH-031 / ADR-0040 — hiding a run.
   *
   * The claim under all of these is one sentence: hiding changes what the card
   * OFFERS and nothing else. Every assertion here is a different way of asking
   * "and it really did not touch the record".
   */
  describe('CH-031 — hideRun / unhideRun', () => {
    const finished = {
      id: 'run-1',
      requestId: 'req-1',
      status: 'aborted',
      hiddenAt: null,
      steps: [],
      messages: [],
      proposals: [],
      request: { opcoId: 'opco-a' },
    };

    /** The `data` handed to the last `agentRun.update`. */
    const updateData = () =>
      (
        prisma.agentRun.update.mock.calls.at(-1)?.[0] as {
          data: Record<string, unknown>;
        }
      ).data;

    it('sets hiddenAt on a finished run', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(finished);

      await service.hideRun(admin, 'run-1');

      expect(updateData().hiddenAt).toBeInstanceOf(Date);
    });

    it('clears hiddenAt again', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        ...finished,
        hiddenAt: new Date(),
      });

      await service.unhideRun(admin, 'run-1');

      // `null`, not `undefined` — Prisma treats undefined as "leave alone", so
      // the one-way switch ADR-0040 D2 exists to avoid would come back silently.
      expect(updateData().hiddenAt).toBeNull();
    });

    /**
     * 🔴 The gate, and it is worth saying what it is NOT for. Hiding leaves
     * `status` alone, so the kill switch still counts a hidden run as live —
     * there is no false `settled` to prevent. What this stops is a hidden run
     * holding a `pending` proposal that stays in the approval queue while the
     * person who would decide it can no longer see it.
     */
    it.each(['running', 'awaiting_approval', 'approved'])(
      'refuses to hide a run that is still %s',
      async (status) => {
        prisma.agentRun.findUnique.mockResolvedValue({ ...finished, status });

        await expect(service.hideRun(admin, 'run-1')).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(prisma.agentRun.update).not.toHaveBeenCalled();
      },
    );

    it.each(['completed', 'failed', 'aborted', 'expired', 'rejected'])(
      'allows hiding a run that is %s',
      async (status) => {
        prisma.agentRun.findUnique.mockResolvedValue({ ...finished, status });

        await expect(service.hideRun(admin, 'run-1')).resolves.toBeDefined();
      },
    );

    it('refuses a run belonging to another OpCo', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        ...finished,
        request: { opcoId: 'opco-b' },
      });

      await expect(service.hideRun(opcoIt, 'run-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.unhideRun(opcoIt, 'run-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.agentRun.update).not.toHaveBeenCalled();
    });

    it('404s on a run that is not there', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(null);

      await expect(service.hideRun(admin, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    /**
     * 🔴🔴 The negative that carries the whole ADR. A delete would have taken
     * the steps, the transcript and the proposals with it through their
     * `onDelete: Cascade`. If this ever goes red, the change has quietly become
     * the thing ADR-0040 refused to build.
     */
    it('writes to no table but AgentRun — no step, no message, no proposal', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(finished);

      await service.hideRun(admin, 'run-1');

      expect(prisma.agentStep.create).not.toHaveBeenCalled();
      expect(prisma.agentMessage.createMany).not.toHaveBeenCalled();
      expect(prisma.agentProposal.create).not.toHaveBeenCalled();
      expect(prisma.agentProposal.updateMany).not.toHaveBeenCalled();
      // And the one write it does make touches exactly one column.
      expect(Object.keys(updateData())).toEqual(['hiddenAt']);
    });

    it('records who did it, inside the transaction', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(finished);

      await service.hideRun(admin, 'run-1');

      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][1] as {
        action: string;
        targetType: string;
        targetId: string;
        actorId: string;
        metadata: { hidden: boolean };
        before?: unknown;
        after?: unknown;
      };
      // Hardcoded rather than read back off AUDIT_ACTIONS on both sides: the
      // tautology CH-023 left behind (code and test drawing the value from the
      // same place) passes no matter what the value becomes.
      expect(entry.action).toBe('agent.run_hidden');
      expect(entry.action).toBe(AUDIT_ACTIONS.AGENT_RUN_HIDDEN);
      expect(entry.targetType).toBe('AgentRun');
      expect(entry.targetId).toBe('run-1');
      expect(entry.actorId).toBe(admin.id);
      expect(entry.metadata.hidden).toBe(true);
      // Event-only (D5) — the allow-list stays untouched because nothing
      // reaches before/after.
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
      // ADR-0009 D8.1: "hidden but unrecorded" must not be reachable.
      expect(auditSawOpenTransaction).toBe(true);
    });

    it('records the other direction as the same action', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({
        ...finished,
        hiddenAt: new Date(),
      });

      await service.unhideRun(admin, 'run-1');

      const entry = audit.log.mock.calls[0][1] as {
        action: string;
        metadata: { hidden: boolean };
      };
      expect(entry.action).toBe('agent.run_hidden');
      expect(entry.metadata.hidden).toBe(false);
    });

    /**
     * 🔴 D3 — the asymmetry between the two read paths IS the decision, so both
     * halves are pinned. Filtering both would make hiding a delete in all but
     * name; filtering neither would make the feature do nothing.
     */
    it('drops a hidden run from the card, and keeps it reachable by id', async () => {
      prisma.request.findUnique.mockResolvedValue({ opcoId: 'opco-a' });
      prisma.agentRun.findFirst.mockResolvedValue(null);

      const latest = await service.findLatestForRequest(admin, 'req-1');

      expect(latest).toBeNull();
      const where = (
        prisma.agentRun.findFirst.mock.calls.at(-1)?.[0] as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(where).toEqual({ requestId: 'req-1', hiddenAt: null });

      // The other half: getRun does NOT filter, so the id still resolves.
      prisma.agentRun.findUnique.mockResolvedValue({
        ...finished,
        hiddenAt: new Date(),
      });
      await expect(service.getRun(admin, 'run-1')).resolves.toMatchObject({
        id: 'run-1',
      });
      expect(
        (
          prisma.agentRun.findUnique.mock.calls.at(-1)?.[0] as {
            where: Record<string, unknown>;
          }
        ).where,
      ).toEqual({ id: 'run-1' });
    });

    it('returns hiddenAt to the client, so it can tell the two apart', async () => {
      prisma.agentRun.findUnique.mockResolvedValue(finished);

      await service.getRun(admin, 'run-1');

      const select = (
        prisma.agentRun.findUnique.mock.calls.at(-1)?.[0] as {
          select: Record<string, unknown>;
        }
      ).select;
      expect(select.hiddenAt).toBe(true);
    });
  });
});
