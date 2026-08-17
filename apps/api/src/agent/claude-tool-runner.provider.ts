import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { AgentToolRegistry } from './tool-registry';
import type { AgentTool, AgentToolContext } from './agent-tool';
import {
  AgentRuntimeProvider,
  type AgentSetup,
  type AgentTurn,
  type ApprovalDecision,
  type PendingApproval,
  type ToolExecution,
} from './agent-runtime.provider';

/**
 * W46 期二 G4 / ADR-0038 — the `@anthropic-ai/sdk` Tool Runner adapter.
 *
 * 🔴 This provider exists to PROVE ADR-0036 D1 ("one tool definition, two
 * runtimes"), not to ship a second product surface — Chris 2026-08-16. ADR-0037
 * E2 already swapped the OpenAI client for an Azure one without touching the
 * registry, but that only demonstrated "change the endpoint"; D1's actual claim
 * was "change the SDK". This file is the first thing that tests it.
 *
 * 🟢 The verdict, up front: `AgentToolRegistry`, all six tools, `AgentTool`,
 * `AgentToolSchema` and the seam ⑤ vocabulary are UNCHANGED by this file. Per
 * ADR-0037 E2's yardstick — "if implementing it needs the registry changed,
 * then D1 was wrong and we say so rather than forcing it here" — D1 holds.
 *
 * 🔴 It does NOT reach the network. See `buildClient`: no API key configured,
 * no client, and the run stops with a 503. That is not a promise in a comment —
 * `claude-tool-runner.provider.spec.ts` asserts the Anthropic constructor is
 * never called. ADR-0038 D3 + R21: "we installed the SDK" must not quietly
 * become "we may call Anthropic", because OQ-7's Claude half has never been
 * answered (ADR-0037 E7).
 */

/**
 * Ceiling on API round-trips in one run — the Tool Runner's own
 * `max_iterations`.
 *
 * The same stop-gap role as `MAX_TURNS` on the OpenAI side, and deliberately
 * the same value: two runtimes that stop at different points would be a
 * behavioural difference introduced by an adapter, which is the one thing
 * ADR-0017 D0 says an adapter may not do.
 */
const MAX_ITERATIONS = 12;

/**
 * `max_tokens` is required by the Messages API and has no default.
 *
 * Stated as a constant rather than read from config because it is a transport
 * requirement, not a choice anyone has made: OQ-1 covers which model runs, and
 * a second knob here would imply a decision that has not been taken.
 */
const MAX_OUTPUT_TOKENS = 4096;

/**
 * The shape this adapter reads out of an assistant message.
 *
 * A structural type rather than the SDK's `BetaMessage`, for exactly the reason
 * `RunResultLike` exists on the OpenAI side: it lets the normalisation below be
 * driven by a hand-built message in a test, with no client, no API key and no
 * network — which is the only way "two pending approvals" or "text AND a
 * tool_use in the same turn" ever get exercised.
 */
export interface ClaudeMessageLike {
  role: string;
  content: unknown;
}

interface ToolUseBlockLike {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

function blocksOf(message: ClaudeMessageLike): ToolUseBlockLike[] {
  return Array.isArray(message.content)
    ? (message.content as ToolUseBlockLike[])
    : [];
}

/**
 * D1 — the registry's JSON Schema handed straight to `betaTool`.
 *
 * 🟢 Compare with `toSdkTools` in the OpenAI adapter: `name` and `description`
 * cross verbatim, and `parameters` becomes `inputSchema` by RENAMING ONLY. That
 * is the whole of D1's claim, and it is why a single definition can serve both
 * — the two tool contracts were never different kinds of thing.
 *
 * 🔴 Two places where the crossing is NOT a rename, both recorded because a
 * silent difference here is exactly what D1 would fail on:
 *
 *  1. `run` must return a string (or content blocks); the registry's `execute`
 *     returns an object. `JSON.stringify` closes it — the same call the OpenAI
 *     adapter makes, so the model sees identical text on both runtimes.
 *
 *  2. `betaTool` has NO `needsApproval` field. The Tool Runner has no native
 *     pause/resume at all. Approval is enforced by the LOOP instead (see
 *     `drive`), which is a real finding about ADR-0036 D3: that decision's
 *     substance — a human decides, and the decision is recorded in the
 *     platform's own tables — is untouched, but its phrase "use the SDK's
 *     native pause/resume" only ever described the OpenAI half.
 *
 * The cast on `inputSchema` is about a TYPE-SYSTEM rule, not the value:
 * `betaTool` constrains its schema to `json-schema-to-ts`' `JSONSchema`, whose
 * `properties` are recursively typed, while `AgentToolSchema.properties` is
 * `Record<string, unknown>` on purpose (agent-tool.ts: the plain object IS what
 * goes to the SDK, so a richer local type would only have to be compiled back
 * down to it). The runtime value is the very JSON Schema both SDKs accept.
 */
export function toClaudeTools(
  registered: readonly AgentTool[],
  ctx: AgentToolContext,
  onToolExecuted?: (record: ToolExecution) => Promise<void>,
) {
  /**
   * 🔴 The observer is TOLD, it does not decide (D4) — its throw is swallowed
   * here and only here. Copied deliberately rather than shared with the OpenAI
   * adapter: the two call it at different points in different SDK loops, and a
   * shared helper would suggest a common execution path that does not exist.
   */
  const record = async (entry: ToolExecution) => {
    if (!onToolExecuted) return;
    try {
      await onToolExecuted(entry);
    } catch {
      // Bookkeeping must never turn into a tool failure.
    }
  };

  return registered.map((entry) =>
    betaTool({
      name: entry.name,
      description: entry.description,
      inputSchema: entry.parameters as never,
      run: async (args: unknown) => {
        try {
          const result = await entry.execute(args, ctx);
          // AFTER it resolves: "about to run" and "ran" are different facts,
          // and only the second is what an action ledger records.
          await record({ toolName: entry.name, status: 'ok' });
          return JSON.stringify(result);
        } catch (err) {
          await record({
            toolName: entry.name,
            status: 'failed',
            detail: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    }),
  );
}

/**
 * The write tools this assistant turn is asking to run.
 *
 * 🔴 `needsApproval` is read back off the REGISTRY, never off the message. The
 * model chooses which tool to call; whether that tool needs a human is a
 * platform fact (D2), and letting the turn carry it would put the answer in
 * the one place an adversarial model controls.
 */
export function pendingApprovalsOf(
  message: ClaudeMessageLike,
  registered: readonly AgentTool[],
  logger?: Logger,
): PendingApproval[] {
  const pending: PendingApproval[] = [];

  for (const block of blocksOf(message)) {
    if (block.type !== 'tool_use') continue;

    const tool = registered.find((entry) => entry.name === block.name);
    if (!tool) {
      /**
       * The model named a tool that is not registered. Nothing to approve and
       * nothing to run — D2's allow-list means the runner has no such tool to
       * dispatch to either, so it will report the error back to the model.
       */
      logger?.warn(
        `The agent asked for an unregistered tool '${String(block.name)}'`,
      );
      continue;
    }
    if (!tool.needsApproval) continue;

    if (!block.id) {
      /**
       * Should not happen — every `tool_use` block carries an id. Dropping it
       * is the SAFE direction, not a shrug: the caller counts pending
       * approvals to decide whether to stop, and an unmatched pause means the
       * run stays parked and nothing executes. An invented ref would do the
       * opposite.
       */
      logger?.warn(
        'A tool_use block carried no id; it cannot be presented for approval',
      );
      continue;
    }

    pending.push({ ref: block.id, toolName: tool.name, args: block.input });
  }

  return pending;
}

/** Messages as this adapter persists them — see `AgentTurn.state`. */
type Conversation = Anthropic.Beta.Messages.BetaMessageParam[];

/**
 * 🟢 R16 barely applies on this runtime, and that is worth stating.
 *
 * `AgentTurn.state` here is `JSON.stringify(messages)` — the Messages API's own
 * public wire format, not an SDK-internal structure. An SDK upgrade cannot make
 * an old parked run unreadable the way `RunState.fromString` can on the OpenAI
 * side. It is still validated rather than trusted: a `runState` column holds
 * whatever was written, and "readable JSON" is not "an array of messages".
 */
export function parseConversation(state: string): Conversation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(state);
  } catch (err) {
    throw new ServiceUnavailableException(
      `This run cannot be resumed; its saved state is not readable (R16): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ServiceUnavailableException(
      'This run cannot be resumed; its saved state is not a conversation (R16)',
    );
  }
  return parsed as Conversation;
}

@Injectable()
export class ClaudeToolRunnerProvider extends AgentRuntimeProvider {
  readonly runtime = 'claude-tool-runner' as const;

  private readonly logger = new Logger(ClaudeToolRunnerProvider.name);

  constructor(
    private readonly registry: AgentToolRegistry,
    private readonly connectorConfig: ConnectorConfigService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async start(setup: AgentSetup, input: string): Promise<AgentTurn> {
    return this.drive(setup, [{ role: 'user', content: input }]);
  }

  async resume(
    setup: AgentSetup,
    state: string,
    decisions: ApprovalDecision[],
  ): Promise<AgentTurn> {
    const messages = parseConversation(state);
    const last = messages[messages.length - 1] as ClaudeMessageLike;
    const pending = pendingApprovalsOf(last, this.registry.list(), this.logger);

    /**
     * 🔴 Every pause must be decided before the run continues — the same rule
     * the OpenAI adapter enforces, for the same reason: resuming with an
     * undecided pause still standing means whether that call eventually runs
     * depends on runtime behaviour rather than on what a person chose.
     */
    const undecided = pending.filter(
      (candidate) => !decisions.some((d) => d.ref === candidate.ref),
    );
    if (undecided.length > 0) {
      throw new BadRequestException(
        `${undecided.length} pending approval(s) on this run have no decision; resume was refused`,
      );
    }

    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];

    for (const decision of decisions) {
      const paused = pending.find(
        (candidate) => candidate.ref === decision.ref,
      );
      if (!paused) {
        throw new BadRequestException(
          `No pending approval '${decision.ref}' on this run`,
        );
      }

      if (!decision.approved) {
        /**
         * Sent back as a tool result rather than by dropping the call, so the
         * model can REACT to the refusal instead of retrying blindly. `is_error`
         * is what tells it apart from a tool that ran and returned bad news.
         */
        results.push({
          type: 'tool_result',
          tool_use_id: decision.ref,
          is_error: true,
          content:
            decision.reason ?? 'A reviewer rejected this proposed tool call.',
        });
        continue;
      }

      /**
       * 🔴 The platform executes the approved call itself.
       *
       * The OpenAI adapter hands the decision back to the SDK (`state.approve`)
       * and lets it dispatch. The Tool Runner has no equivalent — an approval
       * is simply "we continue" — so the adapter runs the registry's own
       * `execute` and feeds the result back as a `tool_result`. The observable
       * outcome is identical, which is the property that matters: the same
       * registry function runs, `onToolExecuted` records it the same way, and
       * the model sees the same text.
       */
      const tool = this.registry
        .list()
        .find((entry) => entry.name === paused.toolName);
      if (!tool) {
        // Registered when the run parked, absent now: the allow-list changed
        // under a pending approval. Refuse loudly rather than resume into a
        // conversation whose next step cannot happen.
        throw new ServiceUnavailableException(
          `Tool '${paused.toolName}' is no longer registered; this run cannot be resumed`,
        );
      }

      results.push(await this.executeApproved(tool, paused, setup));
    }

    messages.push({ role: 'user', content: results });
    return this.drive(setup, messages);
  }

  /**
   * Run one approved tool and shape its outcome as a `tool_result`.
   *
   * A failure comes back as `is_error` rather than throwing: the human said
   * yes, the tool broke, and the model is the thing that has to be told. The
   * platform's own record of the failure is the `onToolExecuted` call inside
   * `toClaudeTools`... except that path is the SDK's, not this one — so this
   * method reports it directly, and that asymmetry is the reason it is written
   * out here rather than folded into the loop.
   */
  private async executeApproved(
    tool: AgentTool,
    paused: PendingApproval,
    setup: AgentSetup,
  ): Promise<Anthropic.Beta.Messages.BetaToolResultBlockParam> {
    const record = async (entry: ToolExecution) => {
      if (!setup.onToolExecuted) return;
      try {
        await setup.onToolExecuted(entry);
      } catch {
        // Told, not deciding (D4).
      }
    };

    try {
      const result = await tool.execute(paused.args, setup.ctx);
      await record({ toolName: tool.name, status: 'ok' });
      return {
        type: 'tool_result',
        tool_use_id: paused.ref,
        content: JSON.stringify(result),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await record({ toolName: tool.name, status: 'failed', detail });
      return {
        type: 'tool_result',
        tool_use_id: paused.ref,
        is_error: true,
        content: detail,
      };
    }
  }

  /**
   * The loop — and the approval gate lives in its `break`.
   *
   * 🔴 This is the finding that made G4 worth doing, and it is a fact about the
   * SDK, not a guess (`lib/tools/BetaToolRunner.js:23,27` vs `:54`): the async
   * iterator YIELDS the assistant message BEFORE it executes that turn's tools.
   * A generator suspended at `yield` runs nothing further until the consumer
   * asks for the next value — so returning out of this loop means
   * `#generateToolResponse` is never reached and the write tool never runs.
   * "Approval" on this runtime is not a mechanism; it is declining to continue.
   *
   * 🔴 And the trap that only shows up against the real SDK: the same code
   * pushes the assistant message onto `params.messages` AFTER the yield
   * (`:31-33`). Leaving the loop skips it — so the `tool_use` block would be
   * missing from the saved conversation, and on resume its `tool_result` would
   * reference a `tool_use` that is not there, which the API rejects with a 400.
   * Hence the explicit push below. Nothing in a type signature says this.
   */
  private async drive(
    setup: AgentSetup,
    messages: Conversation,
  ): Promise<AgentTurn> {
    const client = this.buildClient();
    const registered = this.registry.list();

    const runner = client.beta.messages.toolRunner({
      model: await this.resolveModel(),
      max_tokens: MAX_OUTPUT_TOKENS,
      system: setup.instructions,
      messages,
      tools: toClaudeTools(registered, setup.ctx, setup.onToolExecuted),
      max_iterations: MAX_ITERATIONS,
    });

    const transcript: unknown[] = [];
    let finalOutput: string | undefined;

    for await (const message of runner) {
      const turn = message as unknown as ClaudeMessageLike;
      transcript.push(turn);

      const pendingApprovals = pendingApprovalsOf(
        turn,
        registered,
        this.logger,
      );
      if (pendingApprovals.length > 0) {
        // See the trap above — the runner has not recorded this turn yet.
        messages.push(turn as Anthropic.Beta.Messages.BetaMessageParam);
        return {
          status: 'awaiting_approval',
          state: JSON.stringify(messages),
          pendingApprovals,
          providerItems: transcript,
        };
      }

      finalOutput = textOf(turn) ?? finalOutput;
    }

    return {
      status: 'completed',
      state: JSON.stringify(runner.params.messages),
      pendingApprovals: [],
      providerItems: transcript,
      finalOutput,
    };
  }

  /**
   * 🔴 ADR-0038 D3 / R21 — no API key, no client, no network.
   *
   * The key is read and checked BEFORE the client is constructed, so an
   * unconfigured deployment cannot reach Anthropic even by accident. Same shape
   * as `resolveModel` on the OpenAI side, and it is carrying more weight here:
   * OQ-7 is answered for OpenAI (ADR-0037 — company-tenant Azure only) and has
   * NEVER been answered for Anthropic, so the honest state of this runtime today
   * is "implemented, not permitted to run".
   *
   * 🔴 The explicit read is the point. `new Anthropic()` with no argument falls
   * back to `process.env.ANTHROPIC_API_KEY` on its own — so leaving the key to
   * the SDK would mean an environment variable nobody reviewed is the only thing
   * between this file and a third party receiving a real person's request text.
   * The same reasoning as ADR-0036 D11 (tracing): a default that reaches out is
   * one nothing in the code says out loud.
   *
   * 🟢 Read from env, not `ConnectorConfig` — ADR-0013 Model C: non-secret
   * settings live in the DB, real secrets only in env. A key column would also
   * be a Prisma change (H1) for something that must not be in the database.
   */
  private buildClient(): Anthropic {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey?.trim()) {
      throw new ServiceUnavailableException(
        'No Anthropic API key is configured, and W46 OQ-7 has not been answered for Anthropic (ADR-0037 E7) — this runtime cannot start a run',
      );
    }
    return new Anthropic({ apiKey: apiKey.trim() });
  }

  /** Same rule, same reason as the OpenAI adapter: no default model (OQ-1). */
  private async resolveModel(): Promise<string> {
    const model = await this.connectorConfig.resolve('agent', 'agentModel');
    if (!model?.trim()) {
      throw new ServiceUnavailableException(
        'No agent model is configured — set ConnectorConfig.agentModel or AGENT_MODEL (W46 OQ-1)',
      );
    }
    return model.trim();
  }
}

/** The assistant's prose for this turn, if it produced any. */
function textOf(message: ClaudeMessageLike): string | undefined {
  const text = blocksOf(message)
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text?: string }).text ?? '')
    .join('')
    .trim();
  return text.length > 0 ? text : undefined;
}
