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
import { assertOpcoScope, scopeWhere } from '../auth/opco-scope';
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
import { AgentProfileService } from './agent-profile.service';
import { ConnectorConfigService } from '../integration/connector-config.service';

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
/**
 * W48 F4-3 / ADR-0041 D9 — how much of a conversation a run is given.
 *
 * 🔴 D9 requires a ceiling and deliberately does not say which, because the
 * right number needs token data nobody has yet. These are a STARTING POINT, and
 * the two exist together because either alone fails where the other holds:
 * twenty one-word turns cost nothing, and two turns at `MAX_TURN_LENGTH` each
 * are 8000 characters.
 *
 * ⚠️ What this bounds is COST, not damage — a Tier 1 agent cannot write (D3), so
 * a long history buys a bigger bill, not a bigger blast radius. Calling it a
 * safety limit would overstate it, the same distinction
 * `MAX_AUTONOMOUS_TOOL_CALLS` draws.
 */
export const MAX_HISTORY_TURNS = 20;
export const MAX_HISTORY_CHARS = 20_000;

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
    private readonly profiles: AgentProfileService,
    /**
     * W47 F3-5 — read ONLY for runs that predate the registry.
     *
     * 🔴 Not a fallback for new runs. `resolveForRun` refuses rather than
     * reaching for the environment, and this must not quietly undo that. See
     * `modelForLegacyRun`.
     */
    private readonly connectorConfig: ConnectorConfigService,
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
  async startRun(
    user: AppUser,
    requestId: string,
    profileId?: string,
  ): Promise<AiAssistRunResult> {
    // 期二 G3 — first, because everything below it costs something: a model
    // call, a row, a person's attention. `startRun` already refused a
    // deactivated principal further down; that check now lives in one place
    // with the two it was missing (resume, and approval).
    await this.killSwitch.assertEnabled();
    await this.assertRequestIsUsable(user, requestId);
    await this.assertNoOpenRun(requestId);

    return this.queueRun(user, {
      requestId,
      conversationId: null,
      profileId,
      startDetail: `Run started for request ${requestId}`,
    });
  }

  /**
   * W48 F3 / ADR-0041 D4 — a run started by a CONVERSATION rather than by a
   * request screen.
   *
   * 🔴 Deliberately the same machinery as `startRun`, down to the principal, the
   * audit action and the queue. D8 says a chat cannot bypass approval, and the
   * cheapest way to keep that true is for a chat's run to be an ordinary run:
   * same table, same proposals, same `agent-approval` path. A second execution
   * path would be a second place for the approval gate to not quite apply.
   *
   * ⚠️ The two request-shaped guards `startRun` runs first are absent here, and
   * neither is an oversight:
   *   - `assertRequestIsUsable` — the CONVERSATION already checked its request
   *     when it was created, and a conversation with no request has nothing to
   *     check. `ctx.requestId` then removes the tools rather than a guard
   *     refusing them (D3).
   *   - `assertNoOpenRun` — that rule is "one open run per REQUEST" (OQ-3), and
   *     it exists so a request card cannot show two runs disagreeing. A
   *     conversation is a sequence of turns, each with its own run; applying
   *     the request rule here would make the second question in a conversation
   *     fail while the first was still thinking.
   */
  async startConversationRun(
    user: AppUser,
    conversation: {
      id: string;
      requestId: string | null;
      profileId: string | null;
    },
  ): Promise<AiAssistRunResult> {
    await this.killSwitch.assertEnabled();

    return this.queueRun(user, {
      requestId: conversation.requestId,
      conversationId: conversation.id,
      profileId: conversation.profileId ?? undefined,
      startDetail: conversation.requestId
        ? `Run started from conversation ${conversation.id} on request ${conversation.requestId}`
        : `Run started from conversation ${conversation.id} with no request context`,
    });
  }

  /**
   * Everything both entry points do once their own guards have passed: settle
   * the principal and the profile, write the row and its audit entry together,
   * record the opening step, and queue the work.
   *
   * Extracted rather than copied when W48 added the second caller — the
   * alternative was two transactions writing the same table with the same audit
   * action, which drift apart one fix at a time.
   */
  private async queueRun(
    user: AppUser,
    opts: {
      requestId: string | null;
      conversationId: string | null;
      profileId?: string;
      startDetail: string;
    },
  ): Promise<AiAssistRunResult> {
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
     * W47 F3 — which profile this run uses, settled BEFORE the row exists.
     *
     * 🔴 Position matters. `resolveForRun` refuses when the choice is
     * unanswerable (no active profile, several with none named, one that has
     * been switched off), and every one of those is a 400 that must land before
     * anything is written — otherwise a refusal leaves a `running` row that
     * OQ-3 then counts against the request, blocking it from ever getting
     * another run. Same permanent-block shape 期二 G5-A found twice already.
     */
    const profile = await this.profiles.resolveForRun(
      opts.profileId,
      principal.id,
    );

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
          requestId: opts.requestId,
          // W48 F3 / ADR-0041 D4 — null for a run started from a request
          // screen. It is what makes "which sentence produced this proposal"
          // answerable, and a column rather than an inference for the reason
          // `AgentRun.requestId` gives: a link nobody wrote down holds only as
          // long as somebody remembers it.
          conversationId: opts.conversationId,
          status: 'running',
          profileId: profile.id,
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
      detail: opts.startDetail,
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
      select: {
        id: true,
        status: true,
        requestId: true,
        // W48 F3 — decides what this run is being asked (`inputFor`).
        conversationId: true,
        startedBy: true,
        // W47 F3 — the run's own profile, not whatever is configured now. A
        // queued job can execute long after an admin edited the registry.
        profile: {
          select: { id: true, name: true, model: true, prompt: true },
        },
      },
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

    const setup = await this.buildSetup(
      run.id,
      run.startedBy,
      run.profile,
      run.requestId,
    );

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
        await this.inputFor(run),
      );
      return await this.persistTurn(run.id, turn);
    } catch (err) {
      await this.failRun(run.id, err);
      throw err;
    }
  }

  /**
   * What this run is being asked to do — W48 F3.
   *
   * 🔴 Two callers, two sentences, and the difference is not cosmetic. A run
   * started from a request screen has one job stated by the platform; a run
   * started from a conversation is answering a PERSON, and the words are
   * theirs.
   *
   * ⚠️ This READS `AgentChatTurn`, a table `agent-conversation.service` owns
   * and is the only writer of. That split is deliberate and the boundary spec
   * enforces the writing half: an agent may read what it was asked, and must
   * not be able to write the record of what was asked.
   *
   * A conversation run with no turn to answer would be a run with nothing to
   * say. It cannot happen — `addTurn` writes the turn and queues the run in one
   * transaction — so it throws rather than inventing a prompt, which is the
   * rule R16 states for saved state and this is the same class of fact.
   */
  private async inputFor(run: {
    id: string;
    requestId: string | null;
    conversationId: string | null;
  }): Promise<string> {
    if (!run.conversationId) {
      return `Work out the licence line items for request ${run.requestId}.`;
    }

    /**
     * One more than the cap, so "were there older turns?" is answered by the
     * read rather than guessed from whether the page came back full.
     */
    const rows = await this.prisma.agentChatTurn.findMany({
      where: { conversationId: run.conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_TURNS + 1,
      select: { role: true, content: true },
    });
    if (!rows.some((row) => row.role === 'user')) {
      throw new ServiceUnavailableException(
        `Conversation ${run.conversationId} has no question for run ${run.id} to answer`,
      );
    }

    /**
     * 🔴 D9 / R3 — the cost limit, and it is TWO limits because either alone
     * fails in the case the other covers: twenty one-word turns are cheap, and
     * two turns of 4000 characters each are not.
     *
     * Walked newest-first so the budget is spent on what was said most
     * recently. The newest turn is always kept even if it alone exceeds the
     * budget — a run with no question is not a cheaper run, it is a broken one.
     */
    const kept: typeof rows = [];
    let budget = MAX_HISTORY_CHARS;
    for (const row of rows.slice(0, MAX_HISTORY_TURNS)) {
      if (kept.length > 0 && budget - row.content.length < 0) break;
      kept.push(row);
      budget -= row.content.length;
    }
    const dropped = rows.length - kept.length;
    kept.reverse();

    /**
     * ⚠️ The history is FLATTENED INTO TEXT, and that is a real limitation
     * rather than a formatting choice.
     *
     * The seam takes `input: string` (`AgentRuntimeProvider.start`). Passing a
     * structured message list would mean widening it — an H1 change to
     * ADR-0036's seam — for a phase whose streaming decision deliberately went
     * the other way. What it costs: the model reads a TRANSCRIPT of the
     * conversation rather than participating in one, and tool calls from
     * earlier turns are not in it (only what the agent finally said).
     *
     * 🔴 Truncation is announced. A model handed a silently shortened history
     * would answer "as discussed earlier" about turns it cannot see, and the
     * person reading that has no way to tell.
     */
    const lines = kept.map(
      (row) => `${row.role === 'user' ? 'Person' : 'You'}: ${row.content}`,
    );
    if (dropped > 0) {
      lines.unshift(
        `[${dropped} earlier turn(s) omitted — say so if you need them.]`,
      );
    }
    return lines.join('\n\n');
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
      select: {
        id: true,
        status: true,
        runState: true,
        startedBy: true,
        // W48 F3-4 — the resume has to rebuild the SAME tool set the run
        // started with, and `list(ctx)` decides that from this column. Missing
        // it here would silently widen a resumed chat, which is the direction
        // that never announces itself.
        requestId: true,
        // The SAME profile the run started on — an approval can land overnight,
        // and by then the registry may say something different.
        profile: {
          select: { id: true, name: true, model: true, prompt: true },
        },
      },
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

    const setup = await this.buildSetup(
      run.id,
      run.startedBy,
      run.profile,
      run.requestId,
    );

    try {
      const turn = await this.runtime.resume(setup, run.runState, decisions);
      return await this.persistTurn(run.id, turn);
    } catch (err) {
      await this.failRun(run.id, err);
      throw err;
    }
  }

  /**
   * The setup both `executeRun` and `resumeRun` hand to the runtime — W47 F3-5.
   *
   * 🔴 Built from the RUN'S profile, read off the row, never from the registry
   * as it stands now. A run is queued and may execute minutes later; an
   * `awaiting_approval` run may resume the next morning. In both gaps an admin
   * can edit or retire a profile, and "which model did this run use" has to keep
   * one answer across the whole run rather than changing under it.
   *
   * ⚠️ A retired profile still runs a run that already started. Retiring is how
   * you stop NEW runs (`resolveForRun` refuses it); applying it to a run already
   * in flight would strand every `awaiting_approval` run the moment somebody
   * tidied the list — the permanent-block shape again, this time triggered by a
   * routine admin action rather than a bug.
   */
  private async buildSetup(
    runId: string,
    user: AgentSetup['ctx']['user'],
    profile: {
      id: string;
      name: string;
      model: string;
      prompt: string | null;
    } | null,
    /**
     * 🔴 W48 F3-4 — required, and it takes `null` rather than being optional.
     *
     * `requestId?: string` would let a caller that simply forgot produce a run
     * with no request tools, which is a silent narrowing on the run path and a
     * silent widening on nothing — but the same shape one refactor later, with
     * the default flipped, is a chat seeing every request in the OpCo. An
     * argument you cannot omit has neither failure.
     */
    requestId: string | null,
  ): Promise<AgentSetup> {
    return {
      /**
       * 🔴 `prompt` REPLACES the built-in instructions rather than appending to
       * them, and an empty string is treated as "not set".
       *
       * Appending would be the safer-sounding choice and is the wrong one: two
       * sets of instructions that disagree produce behaviour neither author
       * predicted, and an admin reading their own prompt on screen would have no
       * way to know what else is in front of it. D2 already establishes that
       * prompt text is not a security boundary — the tool allow-list and the
       * OpCo scope are — so what is being handed over here is usefulness, not
       * authority.
       */
      instructions: profile?.prompt?.trim() || INSTRUCTIONS,
      model: profile?.model ?? (await this.modelForLegacyRun(runId)),
      ctx: { runId, user, requestId },
      onToolExecuted: (record) => this.recordToolExecution(runId, record),
    };
  }

  /**
   * 🔴 The ONLY place the environment can still decide a model, and it exists
   * for exactly one situation: a run that was started before the registry did.
   *
   * The situation is real and it is not rare — deploying W47 while a run sits at
   * `awaiting_approval` is the ordinary case, not the edge one. Those rows have
   * `profileId = null`, and refusing them here would strand them: OQ-3 allows
   * one non-terminal run per request, `AgentRunExpiryService` does not sweep
   * every state, and the person approving would get a 503 with no way forward.
   * That is 期二 G5-A's permanent block, and it has already been found twice in
   * this file by two different routes.
   *
   * ⚠️ So this is a compatibility path, NOT a fallback. It cannot be reached by
   * a run started after W47, because `startRun` writes `profileId` on every row
   * it creates and `resolveForRun` refuses rather than returning nothing. It
   * logs at warn level for the same reason: the day this fires for a NEW run,
   * something is wrong upstream and the log is how anyone would find out.
   */
  private async modelForLegacyRun(runId: string): Promise<string> {
    const model = await this.connectorConfig.resolve('agent', 'agentModel');
    if (!model?.trim()) {
      throw new ServiceUnavailableException(
        `Run ${runId} predates the agent registry and no model is configured to run it on — set ConnectorConfig.agentModel or AGENT_MODEL (W47 F3-5)`,
      );
    }
    this.logger.warn(
      `Run ${runId} has no profile (started before W47) — falling back to the configured model`,
    );
    return model.trim();
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
        // CH-031 / ADR-0040 D3. Deliberately selected on the path that does NOT
        // filter on it: the client has to be able to tell a hidden run apart
        // from a visible one, and this is the endpoint that still returns it.
        hiddenAt: true,
        startedById: true,
        /**
         * W47 F3-4 — what this run ran on.
         *
         * 🔴 `null` for runs started before the registry, and the screen says
         * "(before W47)" rather than hiding them (OQ-D). `prompt` is NOT
         * selected: it can be 8000 characters and belongs on the registry
         * screen, not on every run detail response.
         */
        profileId: true,
        profile: { select: { id: true, name: true, model: true } },
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
   * Every run, newest first — W47 F4.
   *
   * 🔴 **Scope follows `getRun`, not the run's starter, and the plan said the
   * other thing.** `F4-2` reads "OpCo scope comes from the starter"; that
   * sentence is about `OQ-2` (what an agent may SEE while it runs, which is
   * capped by whoever started it) and applying it to VISIBILITY would put the
   * two endpoints in disagreement: `getRun` lets an OPCO_IT operator open a run
   * a colleague started on a request they both own, so filtering this list by
   * starter would hide rows the very next click can open. Worse in the other
   * direction: a REGIONAL's runs are unscoped, so a starter-based filter would
   * either leak them to everyone or hide them from everyone.
   *
   * So: a run is visible if its REQUEST is (`request: scopeWhere(user)`), which
   * is `getRun`'s rule expressed as a query instead of an assertion. Logged as a
   * plan deviation.
   *
   * 🔴 `runState` is absent from the select for the reason `getRun` states at
   * length: it is the SDK's serialised history, unscrubbed. A list is the
   * easiest place for that to escape, because nobody reads a list response.
   */
  async listRuns(
    user: AppUser,
    filters: {
      status?: string;
      profileId?: string;
      since?: Date;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    /**
     * ⚠️ A ceiling, not a suggestion — `R5`.
     *
     * `take: 1000` with a `limit` parameter that callers may exceed is how a
     * list "supports pagination" while still loading everything, and the day
     * that hurts is the day there are enough runs for it to matter, by which
     * point the screen is already built on it.
     */
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);

    const rows = await this.prisma.agentRun.findMany({
      where: {
        /**
         * 🔴 CH-031 / ADR-0040 — added when W47 merged `main`, and it is the
         * one line neither branch's tests could have asked for.
         *
         * CH-031 put `hiddenAt: null` on `findLatestForRequest` because that
         * was the only list-shaped read that existed at the time. This endpoint
         * did not exist on that branch, and `hiddenAt` did not exist on this
         * one — so a textually clean merge yields a global list that shows
         * every run an admin has just taken out of the workflow, with BOTH
         * suites green. The defect lives between the two changes, which is
         * where this project keeps finding them.
         *
         * ADR-0040 wrote the answer down before either side landed, in its own
         * Consequences: "Tier 2 用得返:`T2-a` 個 run list 直接 `hiddenAt: null`".
         *
         * Unconditional, with no `includeHidden` escape hatch: `GET
         * /agent/runs/:id` is deliberately the way back to a hidden run (D3),
         * and a flag here would be a second answer to the same question.
         */
        hiddenAt: null,
        // 🔴 `is:` — a nullable relation. `AgentRun.requestId` is optional, and
        // a bare `request: { opcoId }` would silently drop every run that has no
        // request at all rather than including it. For a SCOPED user dropping
        // them is right (an unattached run belongs to no OpCo, so it is not
        // theirs to see); for an unscoped one `scopeWhere` returns `{}` and this
        // whole clause disappears, which is why it is safe to write once.
        ...(user.opcoScopeId ? { request: { is: scopeWhere(user) } } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.profileId ? { profileId: filters.profileId } : {}),
        ...(filters.since ? { startedAt: { gte: filters.since } } : {}),
      },
      select: {
        id: true,
        requestId: true,
        status: true,
        startedAt: true,
        endedAt: true,
        startedById: true,
        profileId: true,
        profile: { select: { id: true, name: true, model: true } },
      },
      // `id` breaks ties. Two runs can share a `startedAt` to the millisecond,
      // and an unstable order makes cursor paging skip or repeat rows.
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    /**
     * One extra row is fetched purely to answer "is there more?" without a
     * second count query — and it is dropped here rather than returned, so
     * `items.length` always means what it says.
     */
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      // null, not undefined: "there is no next page" is an answer the client
      // should be able to read, not a missing field it has to interpret.
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
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
      /**
       * 🔴 CH-031 / ADR-0040 D3 — this read filters on `hiddenAt`, and `getRun`
       * deliberately does not.
       *
       * ⚠️ This said "the ONE read" until W47's global run list merged and
       * became the second one. Same rule, other endpoint — the asymmetry below
       * is between LISTS and `getRun`, not between this method and everything
       * else.
       *
       * That asymmetry IS the decision. Hiding a run means "stop putting this
       * in front of people doing the day job", not "this never happened": the
       * card stops offering it here, while anyone holding the id can still open
       * it, and every AgentStep / AgentMessage / AgentProposal underneath is
       * untouched. A delete would have taken all three with it (their
       * `onDelete: Cascade`), which is what ADR-0022 D1 refused on the
       * identical shape.
       */
      where: { requestId, hiddenAt: null },
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
   * CH-031 / ADR-0040 — take a finished run out of the day-to-day workflow.
   *
   * 🔴 This is not a delete, and the whole change turns on that. Deleting the
   * row cascades `AgentStep`, `AgentMessage` and `AgentProposal` away — the
   * audit truth, the transcript ADR-0036 D6 keeps forever, and `approvedById`,
   * i.e. who approved what. ADR-0022 D1 met the identical shape on
   * `OpcoSkuLedger` and answered it the same way: same effect, one-sided cost.
   *
   * 🔴 Terminal-only (D6), and NOT for the reason it looks like. Hiding leaves
   * `status` alone, so the kill switch still counts a hidden run as live and
   * cannot report a false `settled`. What the gate stops is quieter: a hidden
   * run holding a `pending` proposal would leave that proposal in the kill
   * switch's `pendingProposals` and in the approval queue, waiting on a person
   * who can no longer see it. So: stop it first, then hide it — the mirror of
   * `abortRun`'s guard above.
   */
  async hideRun(user: AppUser, runId: string) {
    const run = await this.getRun(user, runId);
    if (NON_TERMINAL_RUN_STATUSES.includes(run.status as 'running')) {
      throw new ConflictException(
        `This run is still ${run.status}; stop it before hiding it`,
      );
    }
    return this.setRunHidden(user, runId, new Date());
  }

  /**
   * Put a hidden run back.
   *
   * 🔴 Added by ADR-0040 D2 rather than inherited from the change request, and
   * the reason is the incident that started CH-031: once `hiddenAt` is set,
   * nothing in the platform could clear it, and the DEV database sits behind a
   * private endpoint. A one-way switch whose only undo is an infrastructure
   * ticket is the same problem this change exists to fix.
   *
   * No status gate: a run can only have been hidden while terminal, and nothing
   * moves a terminal run back.
   */
  async unhideRun(user: AppUser, runId: string) {
    await this.getRun(user, runId);
    return this.setRunHidden(user, runId, null);
  }

  private async setRunHidden(
    user: AppUser,
    runId: string,
    hiddenAt: Date | null,
  ) {
    /**
     * Audit inside the transaction, `startRun`'s reasoning rather than the
     * approval path's: nothing irreversible happens here, so if the audit write
     * fails the visibility change must go back with it. "Hidden but unrecorded"
     * is the state ADR-0009 exists to prevent.
     */
    await this.prisma.$transaction(async (tx) => {
      await tx.agentRun.update({ where: { id: runId }, data: { hiddenAt } });
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.AGENT_RUN_HIDDEN,
        targetType: 'AgentRun',
        targetId: runId,
        // The human. `actorType` stays at its 'user' default for the reason
        // AGENT_RUN_STARTED gives: a person really did this.
        actorId: user.id,
        // One action for both directions, told apart here — the reasoning
        // AGENT_PROPOSAL_DECIDED states for approve/reject: splitting them
        // makes "how often does this get hidden" two queries and a subtraction.
        metadata: { hidden: hiddenAt !== null },
      });
    });

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
