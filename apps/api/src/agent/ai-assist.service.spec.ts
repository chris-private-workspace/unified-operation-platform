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
      create: jest.Mock;
      update: jest.Mock;
    };
    agentStep: { create: jest.Mock };
    agentMessage: { createMany: jest.Mock };
    agentProposal: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
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
        create: jest.fn(),
        update: jest.fn(),
      },
      agentStep: { create: jest.fn() },
      agentMessage: { createMany: jest.fn() },
      agentProposal: { create: jest.fn() },
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiAssistService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentRuntimeProvider, useValue: runtime },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AiAssistService);
  });

  // ── A6 — needsApproval really stops the run ────────────────

  describe('A6 — a write tool stops the run', () => {
    it('parks the run at awaiting_approval instead of finishing it', async () => {
      runtime.start.mockResolvedValue(awaitingTurn());

      const result = await service.startRun(admin, 'req-1');

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

      await service.startRun(admin, 'req-1');

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

      await service.startRun(admin, 'req-1');

      const update = prisma.agentRun.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.runState).toBe(STATE);
    });

    it('refuses a pause on a write tool it cannot classify, and ends the run', async () => {
      // Unreachable through today's registry — which is the point: if a future
      // tool ever pauses here, a proposal with a guessed `kind` is a row someone
      // would approve without knowing what they approved.
      runtime.start.mockResolvedValue(awaitingTurn('propose_assign'));

      await expect(service.startRun(admin, 'req-1')).rejects.toBeInstanceOf(
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

      await service.startRun(admin, 'req-1');

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

      await service.startRun(admin, 'req-1');

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

      await service.startRun(admin, 'req-1');

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

      await service.startRun(admin, 'req-1');
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

      await service.startRun(admin, 'req-1');
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

      await service.startRun(admin, 'req-1');

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

      await service.startRun(admin, 'req-1');

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
      await service.startRun(opcoIt, 'req-1');

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

      await service.startRun(opcoIt, 'req-1');

      expect(captured?.ctx).toEqual({ runId: 'run-1', user: opcoIt });
    });

    it('records the runtime that is actually running on the principal', async () => {
      await service.startRun(admin, 'req-1');

      const call = prisma.agentPrincipal.upsert.mock.calls[0][0] as {
        update: { runtime: string };
        create: { runtime: string };
      };
      expect(call.update.runtime).toBe('openai-agents');
      expect(call.create.runtime).toBe('openai-agents');
    });

    it('marks a run that blew up as failed rather than leaving it running', async () => {
      runtime.start.mockRejectedValue(new Error(`Graph said ${UPN} is gone`));

      await expect(service.startRun(admin, 'req-1')).rejects.toThrow();

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
      await service.startRun(opcoIt, 'req-1');

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
      await service.startRun(admin, 'req-1');

      const entry = audit.log.mock.calls[0][1] as { metadata: unknown };
      expect(entry.metadata).toEqual({ source: 'ai-assist' });
    });

    it('🔴 A11 — passes no before/after at all', async () => {
      await service.startRun(admin, 'req-1');

      // Belt and braces with the whitelist test in audit-fields.spec.ts: that
      // one proves the filter drops everything, this one proves the call site
      // never even offers it. Either alone leaves the other half assumed.
      const entry = audit.log.mock.calls[0][1] as Record<string, unknown>;
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
    });

    it('writes the audit row INSIDE the same transaction as the run row', async () => {
      await service.startRun(admin, 'req-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // ADR-0009 D8.1 — "done but unrecorded" is worse than "not done", and
      // here nothing irreversible precedes it, so both can roll back together.
      expect(auditSawOpenTransaction).toBe(true);
    });

    it('writes no audit row when the request is refused before a run exists', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.startRun(admin, 'req-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  // ── resume (F6) ────────────────────────────────────────────

  describe('resumeRun', () => {
    const parkedRun = (overrides: Record<string, unknown> = {}) => ({
      id: 'run-1',
      status: 'awaiting_approval',
      runState: STATE,
      startedBy: opcoIt,
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
  });

  // ── the refusals ───────────────────────────────────────────

  describe('refusals', () => {
    it('refuses a second open run on the same request (OQ-3)', async () => {
      prisma.agentRun.findFirst.mockResolvedValue({
        id: 'run-0',
        status: 'awaiting_approval',
      });

      await expect(service.startRun(admin, 'req-1')).rejects.toBeInstanceOf(
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
      await service.startRun(admin, 'req-1');

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

      await expect(service.startRun(admin, 'req-1')).rejects.toBeInstanceOf(
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

      await expect(service.startRun(opcoIt, 'req-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.agentRun.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown request', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.startRun(admin, 'req-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to run under a deactivated principal', async () => {
      prisma.agentPrincipal.upsert.mockResolvedValue({
        id: 'principal-1',
        active: false,
      });

      await expect(service.startRun(admin, 'req-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(runtime.start).not.toHaveBeenCalled();
    });
  });
});
