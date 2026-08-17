import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOpcoScope } from '../auth/opco-scope';
import { scrubPii } from '../integration/scrub-pii';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  AgentRuntimeProvider,
  type AgentSetup,
  type AgentTurn,
  type ApprovalDecision,
  type ToolExecution,
} from './agent-runtime.provider';
import { toTranscript } from './transcript';
import { AgentKillSwitchService } from './kill-switch.service';
import { AgentRunQueue } from './agent-run.queue';
import {
  AI_ASSIST_PRINCIPAL,
  NON_TERMINAL_RUN_STATUSES,
} from './agent-run-status';

/**
 * W46 F5 / ADR-0036 — the AI-Assist run.
 *
 * The agent reads a request, picks SKUs, and proposes line items. It creates
 * nothing: `propose_line_items` carries `needsApproval: true`, so the runtime
 * stops in front of it and this service turns each pause into an
 * `AgentProposal` for a person to decide (D3).
 *
 * 🔴 What this file must be judged on is what it does NOT write. A whole run
 * touches the five `Agent*` tables and nothing else — no `RequestLineItem`, no
 * `OpcoSkuLedger`, no stage change. That is acceptance A5, and it is what makes
 * "the agent proposed something" a genuinely different event from "something
 * happened".
 */

/**
 * The system prompt.
 *
 * ⚠️ Prompt text is NOT a security boundary (D2). Nothing here is load-bearing:
 * the tools the agent has are the ones in the registry, the rows it can see are
 * the ones its OpCo scope allows, and the writes it can cause are none. This
 * exists to make the agent USEFUL, and it is allowed to fail at that without
 * anything unsafe happening.
 *
 * The one line that matters operationally is the GUID rule, and even that is
 * belt-and-braces: `propose_line_items` re-checks the format AND the existence
 * of every id (R15 / ADR-0020), so a model that ignores this paragraph gets a
 * 400, not a wrong licence.
 */
const INSTRUCTIONS = `You are AI-Assist inside an IT licence fulfilment platform.

A colleague has received a request for Microsoft 365 licences, written in free text by a real person. Your job is to work out which catalogue SKUs that text is asking for, and to propose them for a human to approve.

How to work:
1. Call get_request to read the request, including its original wording.
2. Call search_catalog to find candidate SKUs. Search on the words the request actually uses.
3. Call get_ledger if it helps you judge whether the OpCo already has budget for a SKU.
4. Call propose_line_items once, with your final list.

Rules:
- Name every SKU by its skuId GUID from search_catalog. Never by product name or part number: the catalogue holds more than one variant of some products, so a name does not identify one.
- Propose only what the request asks for. If the wording is ambiguous, say so in your reasoning and propose the reading you think is most likely — a person reviews this before anything is created.
- If the request does not name any licence you can match, call propose_line_items with an empty reasoning explaining that, rather than guessing.
- You create nothing. propose_line_items sends your list to a person.`;

/** What a caller gets back — deliberately not the raw runtime state. */
export interface AiAssistRunResult {
  runId: string;
  status: string;
  proposals: { id: string; kind: string; toolName: string }[];
  finalOutput?: string;
}

@Injectable()
export class AiAssistService {
  private readonly logger = new Logger(AiAssistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: AgentRuntimeProvider,
    private readonly audit: AuditService,
    private readonly killSwitch: AgentKillSwitchService,
    private readonly queue: AgentRunQueue,
  ) {}

  /**
   * Start a run against one request — and, since 期二 G5-B, ONLY start it.
   *
   * 🔴 **ADR-0039 F1.** This used to wait for the whole model conversation
   * inside the POST. It now creates the row, hands the id to the queue and
   * returns; `executeRun` does the work on a worker. The response shape is
   * unchanged (F2) — same `AiAssistRunResult`, with `status: 'running'` and no
   * proposals yet — because `AgentRunDto` always allowed for that state and the
   * card has rendered it since F8. What changed is the MEANING: the response no
   * longer says "this finished", which is why this needed an ADR at all.
   *
   * @param user the person starting it. Their OpCo scope becomes the run's, and
   *   it is stored on the row so a resume after an overnight approval applies
   *   the same one (F1-6). 期二 G5-B leans on that column a second time: the
   *   worker has no `user` and reads scope back off the row, exactly as
   *   `resumeRun` already did.
   */
  async startRun(user: AppUser, requestId: string): Promise<AiAssistRunResult> {
    // 期二 G3 — first, because everything below it costs something: a model
    // call, a row, a person's attention. `startRun` already refused a
    // deactivated principal further down; that check now lives in one place
    // with the two it was missing (resume, and approval).
    await this.killSwitch.assertEnabled();
    await this.assertRequestIsUsable(user, requestId);
    await this.assertNoOpenRun(requestId);

    const principal = await this.prisma.agentPrincipal.upsert({
      where: { name: AI_ASSIST_PRINCIPAL },
      // The EFFECTIVE runtime, read off the provider that actually booted —
      // never the configured string (BUG-011). A principal claiming a runtime
      // that is not running would misattribute every row hanging off it.
      update: { runtime: this.runtime.runtime },
      create: {
        name: AI_ASSIST_PRINCIPAL,
        runtime: this.runtime.runtime,
        active: true,
      },
    });

    /**
     * 期二 G3 — kept as a SECOND read, not left over from before it had a gate.
     *
     * `assertEnabled()` above and this line read the row at two different
     * moments, and an admin hitting the kill switch in between is the exact
     * situation a kill switch is flipped in. This is the read that has the row
     * already in hand, so the second check is free.
     */
    if (!principal.active) {
      throw new ConflictException(
        'The ai-assist agent principal is deactivated',
      );
    }

    /**
     * Run row and audit row in ONE transaction (ADR-0009 D8.1: "done but
     * unrecorded" is worse than "not done").
     *
     * 🔴 It is safe to be strict HERE and it is not safe in the approval path,
     * and the difference is worth stating rather than looking like drift:
     * nothing irreversible has happened at this point — no model call, no line
     * item — so rolling both back costs nothing. By the time a PROPOSAL is
     * decided, line items already exist, so there the audit runs outside and
     * an audit hiccup must not undo a real side-effect (the precedent
     * `outbound-retry.service.ts:398-401` states for the same reason).
     */
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.agentRun.create({
        data: {
          principalId: principal.id,
          startedById: user.id,
          requestId,
          status: 'running',
        },
        select: { id: true },
      });

      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.AGENT_RUN_STARTED,
        targetType: 'AgentRun',
        targetId: created.id,
        // 🔴 The HUMAN, with actorType left at its 'user' default. A person
        // really did start this, and writing 'agent' would be less accurate.
        actorId: user.id,
        // Which agent capability — the one fact this row cannot otherwise
        // carry, because `AuditLog.actorId` is a foreign key to AppUser and an
        // AgentPrincipal id cannot go in it (see AuditEntryInput.actorType).
        metadata: { source: AI_ASSIST_PRINCIPAL },
      });

      return created;
    });

    await this.writeStep(run.id, {
      key: 'start',
      status: 'ok',
      detail: `Run started for request ${requestId}`,
    });

    /**
     * 🔴 A failed enqueue must END the run, not just report itself.
     *
     * The row already exists and says `running`. If this throws and leaves it
     * there, OQ-3 (one non-terminal run per request) locks that request out of
     * ever getting another run — and `AgentRunExpiryService` deliberately does
     * NOT sweep `running`, so nothing would ever clear it. That is the same
     * permanent-block shape 期二 G5-A found in `resumeRun`, arriving through a
     * different door: an infrastructure outage rather than an SDK upgrade.
     */
    try {
      await this.queue.enqueue(run.id);
    } catch (err) {
      await this.failRun(run.id, err);
      throw err;
    }

    return { runId: run.id, status: 'running', proposals: [] };
  }

  /**
   * Run the agent. Called by `AgentRunWorker`, off the request thread.
   *
   * 🔴 No `user` parameter, and that is the point rather than an omission. The
   * worker has no session; scope comes from `startedBy` on the row — the same
   * answer `resumeRun` reaches for, for the same reason (F1-6). A background
   * job that took scope from anywhere else would be able to widen what a run
   * can see after the fact.
   */
  async executeRun(runId: string): Promise<AiAssistRunResult> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      // 🔴 No `runState` — it carries the model's unscrubbed history and
      // nothing here needs it (the `getRun` lesson, and `run-expiry` repeats
      // it). A fresh start has no state to resume from by definition.
      select: { id: true, status: true, requestId: true, startedBy: true },
    });
    if (!run) throw new NotFoundException('Agent run not found');

    /**
     * ⚠️ Refused WITHOUT calling `failRun`, unlike everything below.
     *
     * A run that is no longer `running` has already reached an outcome — it was
     * aborted, it expired, or a duplicate job is arriving late. Marking it
     * `failed` here would overwrite a real result with a wrong one, which is
     * worse than the duplicate job it is guarding against.
     */
    if (run.status !== 'running') {
      throw new ConflictException(
        `This run is ${run.status}, so there is nothing to execute`,
      );
    }

    const setup: AgentSetup = {
      instructions: INSTRUCTIONS,
      ctx: { runId: run.id, user: run.startedBy },
      onToolExecuted: (record) => this.recordToolExecution(run.id, record),
    };

    /**
     * 🔴 The kill switch is INSIDE the try, and 期二 G5-A is why.
     *
     * `startRun` checked it, but that was before this job was queued and a
     * switch exists to be flipped in exactly that gap. Were the check to sit
     * above the `try` — the obvious place — a disabled agent would throw and
     * leave the row at `running` forever, which is the precise defect G5-A
     * found in `resumeRun`'s R16 early return. Once was a bug; twice would be
     * a pattern.
     *
     * Persisting is inside for the older reason: if writing the proposals
     * throws — an unrecognised write tool, a database hiccup — the run would
     * otherwise sit at `running` forever, which reads as "still working" to
     * every screen and every later guard. A run that ended has to say so,
     * whichever half of the work ended it.
     */
    try {
      await this.killSwitch.assertEnabled();
      const turn: AgentTurn = await this.runtime.start(
        setup,
        `Work out the licence line items for request ${run.requestId}.`,
      );
      return await this.persistTurn(run.id, turn);
    } catch (err) {
      await this.failRun(run.id, err);
      throw err;
    }
  }

  /**
   * Continue a run a person has decided on (F6, D3 step 4).
   *
   * 🔴 The scope comes from `startedBy` — the person who OPENED the run — and
   * never from whoever approved. An approver is ADMIN or REGIONAL and therefore
   * usually unscoped, so reading scope off them would let an approval quietly
   * widen what the agent can see halfway through its own run. That is why
   * `startedById` is a required column with a foreign key (F1-6): after an
   * overnight approval, this row is the only place the answer can come from.
   *
   * 🔴 It does NOT decide anything. The caller (the approval orchestrator) has
   * already done the real work and recorded the decision; this replays that
   * decision to the runtime so the agent sees the outcome and keeps reasoning.
   */
  async resumeRun(
    runId: string,
    decisions: ApprovalDecision[],
  ): Promise<AiAssistRunResult> {
    /**
     * 期二 G3 — a resume is the agent running, so the switch applies.
     *
     * ⚠️ Worth knowing where this lands in the approval flow: the orchestrator
     * checks the switch BEFORE it does any domain work, so in practice a
     * disabled agent never reaches here through that path. This is the guard
     * for every other way in — a retry, a future queue worker (G5), a direct
     * call — and it exists because "the caller already checked" is the sentence
     * that precedes most missing checks.
     */
    await this.killSwitch.assertEnabled();

    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, runState: true, startedBy: true },
    });
    if (!run) throw new NotFoundException('Agent run not found');
    if (run.status !== 'awaiting_approval') {
      throw new ConflictException(
        `This run is ${run.status}, so there is nothing waiting to resume`,
      );
    }

    /**
     * 🔴 R16 — stored in a Json column, so what comes back is whatever the SDK
     * put in. If it is not the string this code wrote, the run is not resumable
     * and that has to be said out loud: the alternative, starting fresh from
     * the same input, would execute a NEW set of tool calls under an approval
     * nobody gave for them.
     */
    if (typeof run.runState !== 'string' || run.runState.trim() === '') {
      /**
       * 🔴🔴 期二 G5 — this used to throw and leave the row untouched, and that
       * was a real defect plan OQ-5 ① names: the run stayed `awaiting_approval`
       * FOREVER. Because OQ-3 allows only one non-terminal run per request, a
       * single unreadable state permanently blocked that request from ever
       * getting another run — and the platform had no path back.
       *
       * ⚠️ Note where the bug lived: this check sits BEFORE the `try` below, so
       * it never reached `failRun`. Everything after it was handled; this one
       * early return was not, and nothing was red about that.
       */
      await this.expireRun(
        run.id,
        'The saved state is not readable, so this run cannot be resumed (R16)',
      );
      throw new ServiceUnavailableException(
        'This run has no readable saved state and cannot be resumed (R16)',
      );
    }

    const setup: AgentSetup = {
      instructions: INSTRUCTIONS,
      ctx: { runId: run.id, user: run.startedBy },
      onToolExecuted: (record) => this.recordToolExecution(run.id, record),
    };

    try {
      const turn = await this.runtime.resume(setup, run.runState, decisions);
      return await this.persistTurn(run.id, turn);
    } catch (err) {
      await this.failRun(run.id, err);
      throw err;
    }
  }

  // ── the parts that read ────────────────────────────────────

  /**
   * One run in full — steps, transcript and proposals.
   *
   * 🔴 Scope is checked against the RUN'S REQUEST, not against `startedById`.
   * Reading is not "seeing your own runs": a REGIONAL operator has to be able
   * to read a run an OPCO_IT colleague started on a request they both own,
   * otherwise the approval screen would show a decision nobody can inspect.
   */
  async getRun(user: AppUser, runId: string) {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      /**
       * 🔴 An explicit `select`, and `runState` is the reason.
       *
       * `include` would have returned every scalar on the row — including the
       * SDK's serialised run state, which carries the model's own message
       * history VERBATIM. That history never went through `scrubPii`: D6 scrubs
       * on the way into `AgentMessage`, and `runState` is a different column
       * written for a different purpose (resumption, R16).
       *
       * So an `include` here would have handed the client the unscrubbed copy
       * of the very transcript the platform is careful to redact — a hole with
       * no error, no log and nothing red, opened by the shorter spelling.
       */
      select: {
        id: true,
        requestId: true,
        status: true,
        startedAt: true,
        endedAt: true,
        startedById: true,
        steps: { orderBy: { createdAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' } },
        proposals: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            kind: true,
            status: true,
            payload: true,
            approvedById: true,
            rejectedReason: true,
            decidedAt: true,
            createdAt: true,
          },
        },
        request: { select: { opcoId: true } },
      },
    });
    if (!run) throw new NotFoundException('Agent run not found');
    if (run.request) assertOpcoScope(user, run.request.opcoId);
    return run;
  }

  /**
   * The most recent run on a request, or null.
   *
   * The card needs this to decide what to show, and "most recent" rather than
   * "the open one" on purpose: a finished run's proposals and transcript are
   * still the thing a person wants to look at.
   */
  async findLatestForRequest(user: AppUser, requestId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { opcoId: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    assertOpcoScope(user, request.opcoId);

    const latest = await this.prisma.agentRun.findFirst({
      where: { requestId },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    return latest ? this.getRun(user, latest.id) : null;
  }

  /**
   * Stop a run a person no longer wants.
   *
   * ⚠️ What this does NOT do is reach into the runtime. A run is only ever
   * inside `runtime.start()` / `resume()` for the duration of one HTTP request;
   * the state this ends is the platform's own — a run parked at
   * `awaiting_approval`, waiting for a decision that is never coming. Calling
   * it "abort" rather than "cancel" would promise more than that.
   */
  async abortRun(user: AppUser, runId: string) {
    const run = await this.getRun(user, runId);
    if (!NON_TERMINAL_RUN_STATUSES.includes(run.status as 'running')) {
      throw new ConflictException(
        `This run is already ${run.status}; there is nothing to stop`,
      );
    }

    await this.writeStep(runId, {
      key: 'abort',
      status: 'ok',
      detail: `Stopped by ${user.id}`,
    });
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'aborted', endedAt: new Date() },
    });

    /**
     * 🔴 Pending proposals go with it. Leaving them `pending` would leave rows
     * an approval screen still offers to approve — and approving one would try
     * to resume a run that is over, which `resumeRun` refuses. A button that
     * can only produce an error is worse than no button.
     */
    await this.prisma.agentProposal.updateMany({
      where: { runId, status: 'pending' },
      data: { status: 'rejected', rejectedReason: 'The run was stopped' },
    });

    // Status + proposals both moved after the step — see `persistTurn`.
    await this.queue.publishChanged(runId);

    return this.getRun(user, runId);
  }

  /**
   * 期二 G5 / plan OQ-5 — end a run that nobody decided on.
   *
   * 🔴 Public because it has TWO callers and they must not drift apart
   * (the `openSyncGate` precedent from CH-015, where a sweep and an on-demand
   * check both had to open the same gate the same way):
   *
   *   `AgentRunExpiryService`  — the clock: parked longer than the threshold
   *   `resumeRun`              — the structure: saved state is unreadable (R16)
   *
   * The two are genuinely different expiries, and OQ-5 names both. A time
   * threshold cannot detect the second one: it is caused by a DEPLOYMENT, not
   * by elapsed time, so an upgrade could make every parked run unresumable
   * within the same minute.
   *
   * 🔴 `expired` rather than `aborted`, and the reason is G7 not tidiness.
   * `aborted` already means "the platform cleared this up" — `abortRun` above
   * writes it, and G7's population (`decidedAt != null`) is built around that
   * distinction. Folding expiry into it would merge "nobody reviewed this" with
   * "the platform stopped it", and the FIRST of those is exactly what R13 is
   * trying to measure. Zero migration: `AgentRun.status` is a `String`, not a
   * Prisma enum — ADR-0031 D1 paying off.
   */
  async expireRun(runId: string, reason: string): Promise<void> {
    this.logger.warn(`AI-Assist run ${runId} expired: ${scrubPii(reason)}`);

    await this.writeStep(runId, {
      key: 'expired',
      status: 'failed',
      detail: reason,
      /**
       * NOT retryable, and that is the honest answer rather than a pessimistic
       * one: there is no "try again" for this run. Its saved state is either
       * too old to trust or unreadable, and resuming it would execute tool
       * calls under an approval nobody gave. Starting a NEW run is the repair,
       * which is a person's action — hence `operator`.
       */
      retryable: false,
      whoFixes: 'operator',
    });

    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'expired', endedAt: new Date() },
    });

    /**
     * 🔴 Same as `abortRun`: pending proposals go with the run, and the two
     * decision columns stay NULL.
     *
     * Writing `decidedAt` here would put every expired proposal into G7's
     * population as a rejection — so a team that ignores proposals until they
     * lapse would show a FALLING approval rate, i.e. would look more sceptical
     * the less they read. R13's metric must not improve when the behaviour it
     * measures gets worse.
     */
    await this.prisma.agentProposal.updateMany({
      where: { runId, status: 'pending' },
      data: {
        status: 'rejected',
        rejectedReason: `The run expired before anyone decided: ${reason}`,
      },
    });

    // Status + proposals both moved after the step — see `persistTurn`.
    await this.queue.publishChanged(runId);
  }

  // ── the parts that write ───────────────────────────────────

  /**
   * 🔴 A7 / INC-001 — every `AgentStep` in the system is written here or by
   * `recordToolExecution`, and both are reached only from facts the platform
   * observed itself. Nothing derives a step from what the model said.
   *
   * That is why a mock model narrating "I have created the line items" leaves
   * an action ledger that says only `start`: the narration lands in
   * `AgentMessage`, where its authority level is written into the table it
   * lives in.
   */
  private async writeStep(
    runId: string,
    step: {
      key: string;
      status: 'ok' | 'failed' | 'skipped';
      detail?: string;
      retryable?: boolean;
      whoFixes?: string;
    },
  ): Promise<void> {
    await this.prisma.agentStep.create({
      data: {
        runId,
        key: step.key,
        status: step.status,
        // Scrubbed on the way in, without exception. A step detail can carry a
        // vendor error, and vendor errors quote request paths containing a UPN
        // (BUG-004). D6 makes this permanent storage, which turns "good habit"
        // into the only defence there is.
        detail: step.detail ? scrubPii(step.detail) : null,
        retryable: step.retryable ?? null,
        whoFixes: step.whoFixes ?? null,
      },
    });

    /**
     * 🔴 期二 G6 / ADR-0039 F10 — the single publish point, and it is single
     * because this method already was.
     *
     * `agent.boundary.spec.ts` asserts `AgentStep` has exactly one writer. That
     * rule was written for A7 / INC-001 — so nothing can fabricate an action
     * ledger entry — and it pays a second dividend here: putting the notify on
     * the one door means every step a run produces reaches the browser, with no
     * list of call sites to keep in step.
     *
     * Awaited, but it cannot throw (`publishChanged` swallows): the step is
     * already written, and a missed screen update must not undo a real record.
     */
    await this.queue.publishChanged(runId);
  }

  /**
   * The adapter saw a registry tool run. `whoFixes` uses the vocabulary of
   * `assign-step.ts:106-113` ('operator' | 'admin' | 'identity' | 'servicenow'
   * | 'procurement' | 'platform') — copied as literals rather than imported,
   * because the agent module does not reach into a domain module and an
   * exception for "it is only a type" is how that rule stops being mechanical.
   */
  private async recordToolExecution(
    runId: string,
    record: ToolExecution,
  ): Promise<void> {
    await this.writeStep(runId, {
      key: record.toolName,
      status: record.status,
      detail: record.detail,
      ...(record.status === 'failed'
        ? { retryable: true, whoFixes: 'platform' }
        : {}),
    });
  }

  private async failRun(runId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`AI-Assist run ${runId} failed: ${scrubPii(message)}`);
    await this.writeStep(runId, {
      key: 'run',
      status: 'failed',
      detail: message,
      retryable: true,
      whoFixes: 'platform',
    });
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'failed', endedAt: new Date() },
    });
    // The status moved after the step did — see `persistTurn`. Every status
    // change re-publishes, because `writeStep` cannot see them.
    await this.queue.publishChanged(runId);
  }

  /**
   * Turn one stretch of execution into rows.
   *
   * Order matters and is not arbitrary: the transcript is written FIRST, so a
   * run that dies while creating proposals still leaves behind what the agent
   * actually said. The reverse order loses exactly the evidence someone would
   * want in that situation.
   */
  private async persistTurn(
    runId: string,
    turn: AgentTurn,
  ): Promise<AiAssistRunResult> {
    await this.persistTranscript(runId, turn.providerItems);

    if (turn.status !== 'awaiting_approval') {
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          endedAt: new Date(),
          // Cleared, not left behind: a finished run holding a resumable state
          // is an invitation to resume something that is over. `DbNull` is a
          // real SQL NULL — `JsonNull` would store the literal `null` value,
          // and the two read back differently.
          runState: Prisma.DbNull,
        },
      });
      /**
       * 🔴 The one status change that writes no step, so the one the single
       * publish point in `writeStep` cannot cover.
       *
       * Without this line a run that completes without proposing anything —
       * G1's `Nothing proposed.` case — changes status with nothing to
       * announce, and a browser watching it would sit on `running` until it
       * gave up. Named here rather than solved by making `writeStep` fire on
       * status changes too, because that would put a second meaning on the
       * action ledger.
       */
      await this.queue.publishChanged(runId);
      return {
        runId,
        status: 'completed',
        proposals: [],
        finalOutput: turn.finalOutput,
      };
    }

    const proposals: AiAssistRunResult['proposals'] = [];
    for (const pending of turn.pendingApprovals) {
      const proposal = await this.prisma.agentProposal.create({
        data: {
          runId,
          kind: kindOf(pending.toolName),
          interruptionRef: pending.ref,
          // The model's arguments, unvalidated by design — the tool re-checks
          // on execution (agent-runtime.provider.ts). It is stored so a person
          // can read what they are being asked to approve, and it must not be
          // treated downstream as a fact about the catalogue.
          payload: (pending.args ?? {}) as object,
          status: 'pending',
        },
        select: { id: true, kind: true },
      });
      proposals.push({
        id: proposal.id,
        kind: proposal.kind,
        toolName: pending.toolName,
      });

      await this.writeStep(runId, {
        key: 'proposal',
        status: 'ok',
        detail: `${pending.toolName} is waiting for a decision`,
      });
    }

    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'awaiting_approval',
        // 🔴 Stored so the SAME run can resume (D3). Not audit truth — R16
        // says an SDK upgrade can make this unreadable, and when that happens
        // resuming must fail loudly rather than start something new.
        runState: turn.state,
      },
    });

    /**
     * 🔴 And again here, for a race that is easy to miss: the proposal steps
     * above each published, but the STATUS change is written after them. A
     * browser that refetched on the last step's notification would read
     * `running` and then never hear again — the card would show the proposal
     * with a spinner over it, forever.
     */
    await this.queue.publishChanged(runId);

    return {
      runId,
      status: 'awaiting_approval',
      proposals,
      finalOutput: turn.finalOutput,
    };
  }

  private async persistTranscript(
    runId: string,
    providerItems: unknown[],
  ): Promise<void> {
    const entries = toTranscript(providerItems);
    if (entries.length === 0) return;
    await this.prisma.agentMessage.createMany({
      data: entries.map((entry) => ({
        runId,
        role: entry.role,
        content: entry.content,
      })),
    });
  }

  // ── the parts that refuse ──────────────────────────────────

  private async assertRequestIsUsable(
    user: AppUser,
    requestId: string,
  ): Promise<void> {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, opcoId: true, rawRequestText: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    assertOpcoScope(user, request.opcoId);

    // Refused here rather than left to the model: AI-Assist's whole input is
    // this text, so an empty one buys a paid round-trip whose only possible
    // output is a guess. ⚠️ The value is read to test that it is non-empty and
    // for nothing else — it is never logged and never stored by this service.
    if (!request.rawRequestText?.trim()) {
      throw new BadRequestException(
        'This request has no free-text wording for AI-Assist to read',
      );
    }
  }

  /** plan OQ-3 — one open run per request. */
  private async assertNoOpenRun(requestId: string): Promise<void> {
    const open = await this.prisma.agentRun.findFirst({
      where: { requestId, status: { in: [...NON_TERMINAL_RUN_STATUSES] } },
      select: { id: true, status: true },
    });
    if (open) {
      throw new ConflictException(
        `This request already has an agent run in progress (${open.id}, ${open.status})`,
      );
    }
  }
}

/**
 * Tool name → `AgentProposal.kind`.
 *
 * 🔴 Throws on anything unrecognised rather than defaulting. A pause the
 * platform cannot classify must not become a proposal with a plausible-looking
 * kind — that is a row a person would approve without knowing what they were
 * approving. `propose_assign` joined this list in 期二 G1.
 */
function kindOf(toolName: string): string {
  if (toolName === 'propose_line_items') return 'line_items';
  if (toolName === 'propose_assign') return 'assign';
  throw new BadRequestException(
    `A run paused on an unrecognised write tool: ${toolName}`,
  );
}
