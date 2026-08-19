import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Agent,
  RunResult,
  RunState,
  run,
  setDefaultOpenAIClient,
  setTracingDisabled,
  tool,
  type RunToolApprovalItem,
} from '@openai/agents';
import { AzureOpenAI } from 'openai';
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
 * W46 F3 / ADR-0036 — the `@openai/agents` adapter (Chris's first choice, D10).
 *
 * It converts shapes and drives the loop. Every decision — which tools exist,
 * what the caller may see, what happens when a write is proposed — was already
 * made by the platform before execution reaches this file (D0/D1/D2).
 */

/**
 * 🔴 D11 / H4 — tracing off, in code, not only in env.
 *
 * `@openai/agents` ships tracing ON by default and exports LLM generations,
 * TOOL CALLS, handoffs and guardrail results to OpenAI's backend. Our
 * `get_request` tool returns a target UPN. So the default behaviour of this
 * library is to send PII to a third party, and forgetting to turn it off
 * produces no error, no warning and no log line — the exact "the default is
 * unsafe and nothing tells you" shape this project keeps meeting.
 *
 * ⚠️ TWO SEPARATE SWITCHES, and knowing the difference is what makes the test
 * around this worth anything:
 *   - `config.tracing.disabled` is a getter over env, read ONCE by the global
 *     TraceProvider's constructor. It also returns `true` whenever
 *     `NODE_ENV === 'test'` — so under Jest tracing is already off before this
 *     function runs, and asserting on it would pass with this call deleted.
 *   - `setTracingDisabled()` writes the provider's live flag, which is what
 *     `createTrace()` actually consults. That is the thing worth asserting, and
 *     the assertion has to switch tracing back ON first (see the spec).
 *
 * Exported so both the provider and its test call the same one function; a
 * second copy of "turn it off" is a second thing to keep in step.
 */
export function enforceTracingDisabled(): void {
  setTracingDisabled(true);
}

/**
 * 🔴🔴 ADR-0037 `E1` — inference goes to the COMPANY's Azure OpenAI resource,
 * and `api.openai.com` is not an allowed fallback.
 *
 * Until this existed, E1 was enforced by nobody setting `OPENAI_API_KEY`. That
 * is not a boundary — it is an absence. `@openai/agents` defaults to the public
 * API, so one env var would have sent a real person's email text (names, UPNs)
 * to a third party with no error, no log and nothing red.
 *
 * ⚠️ **The asymmetry that made this worth writing**: the Claude runtime — which
 * nobody uses — already refused to build a client without explicit
 * configuration, and a test held that in place (ADR-0038 D3). The DEFAULT
 * runtime had no such thing. The weaker guard was on the busier path, which is
 * the wrong way round, and it took a question from Chris (2026-08-17) to
 * surface it rather than any checklist.
 *
 * A free function returning the client, rather than a method calling
 * `setDefaultOpenAIClient` itself — same reason as `toSdkTools`: it makes the
 * claim testable without a model call. What a test can then assert is the thing
 * that actually matters, which is where the client POINTS.
 *
 * 🔴 Three values, all required, none with a code-side default:
 *   - endpoint    — the whole point of E1. Missing ⇒ refuse, never fall back.
 *   - api key     — H4: only ever from env, never DB, never an API response.
 *   - api version — deliberately no default: it decides whether the deployment
 *                   speaks the Responses API, which is what `@openai/agents`
 *                   uses. Guessing one here would turn "wrong API version" into
 *                   a puzzling 404 rather than a clear refusal.
 *
 * 📌 `deployment` is deliberately NOT set on the client. Azure then takes the
 * deployment name from the per-request `model`, which is `AGENT_MODEL` /
 * `ConnectorConfig.agentModel` — so the one value an operator really does
 * change stays changeable at run time (ADR-0013 Model C), exactly as ADR-0037
 * E3 describes.
 */
export function buildAzureClient(config: ConfigService): AzureOpenAI {
  const endpoint = config.get<string>('AZURE_OPENAI_ENDPOINT')?.trim();
  if (!endpoint) {
    throw new ServiceUnavailableException(
      'AI-Assist inference is restricted to the company Azure OpenAI resource (ADR-0037 E1). Set AZURE_OPENAI_ENDPOINT — the public OpenAI API is NOT an allowed fallback.',
    );
  }

  const apiKey = config.get<string>('AZURE_OPENAI_API_KEY')?.trim();
  if (!apiKey) {
    throw new ServiceUnavailableException(
      'Azure OpenAI is configured but has no credential. Set AZURE_OPENAI_API_KEY (env only — never the database, ADR-0013 Model C).',
    );
  }

  const apiVersion = config.get<string>('AZURE_OPENAI_API_VERSION')?.trim();
  if (!apiVersion) {
    throw new ServiceUnavailableException(
      'Set AZURE_OPENAI_API_VERSION. It decides whether the deployment speaks the Responses API, so a guessed default would surface as an unexplained 404.',
    );
  }

  return new AzureOpenAI({ endpoint, apiKey, apiVersion });
}

/**
 * Ceiling on model turns in a single run.
 *
 * A stop-gap, stated as one: the real blast-radius limit is 期二 G3, which has
 * to count tool calls and cost rather than turns. This exists because a loop
 * with NO ceiling at all is not something to leave in the tree while waiting
 * for the proper version.
 */
const MAX_TURNS = 12;

/** The principal name this runtime runs as — matches `AgentPrincipal.name`. */
const AGENT_NAME = 'ai-assist';

/**
 * The parts of a `RunResult` this adapter normalises.
 *
 * A structural type rather than the SDK's generic class, deliberately: it lets
 * the normalisation below be tested against a hand-built result, with no model
 * call, no API key and no network. The alternative — testing normalisation only
 * through a live run — is how "we never checked what happens with two pending
 * approvals" happens.
 */
export interface RunResultLike {
  interruptions?: unknown[];
  state: { toString(): string };
  history: unknown[];
  finalOutput?: unknown;
}

/** The raw runtime item behind an interruption. */
interface RawToolCall {
  callId?: string | null;
  name?: string;
  arguments?: unknown;
}

/**
 * The pauses currently standing in a deserialised run state.
 *
 * ⚠️ The cast is about a TYPE-SYSTEM rule, not about the value. `RunResult`'s
 * agent parameter is constrained to `Agent<TContext, AgentOutputType>`, and a
 * concrete `Agent<unknown, 'text'>` does not satisfy that under
 * strictFunctionTypes: `instructions` may be a callback that receives the agent,
 * which makes the position contravariant. The state being passed is the state
 * this very agent produced, so the runtime relationship is exactly right.
 */
function interruptionsOf(state: unknown): RunToolApprovalItem[] {
  return new RunResult(state as never).interruptions ?? [];
}

function parseArgs(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // The model produced something that is not JSON. Hand back the raw string
    // rather than dropping it: a human is about to read this to decide, and
    // "nothing to show" is worse than "here is what it said".
    return value;
  }
}

function refOf(interruption: unknown): string | undefined {
  const raw = (interruption as { rawItem?: RawToolCall })?.rawItem;
  return raw?.callId ?? undefined;
}

/**
 * D1 — the registry's JSON Schema handed straight to the SDK.
 *
 * A free function, not a method, because that is what it is: a pure conversion
 * with no state and no decision in it. It is also the only way to test the
 * conversion without a model call — and the claim worth testing (`needsApproval`
 * survives the crossing) is exactly the kind that a live run would exercise
 * only by accident.
 *
 * `needsApproval` is passed through as-is rather than re-derived here. The
 * registry is where that fact lives; an adapter that decided it would be a
 * second place for it to be wrong, and only one of the two would be tested.
 */
export function toSdkTools(
  registered: readonly AgentTool[],
  ctx: AgentToolContext,
  onToolExecuted?: (record: ToolExecution) => Promise<void>,
) {
  /**
   * 🔴 The observer is TOLD, it does not decide (D4). A failure to record must
   * never change whether a tool ran or what it returned — so its own throw is
   * swallowed here, and only here. The opposite wiring would let the action
   * ledger's availability decide the agent's behaviour, which is a decision
   * living in the wrong place.
   */
  const record = async (entry: ToolExecution) => {
    if (!onToolExecuted) return;
    try {
      await onToolExecuted(entry);
    } catch {
      // Deliberately silent: the caller writes its own log line, and throwing
      // here would turn a bookkeeping problem into a tool failure.
    }
  };

  return registered.map((entry) =>
    tool({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
      strict: true,
      needsApproval: entry.needsApproval,
      execute: async (args: unknown) => {
        try {
          const result = await entry.execute(args, ctx);
          // AFTER the call resolves, never before: "we are about to run this"
          // and "this ran" are different facts, and only the second one is
          // what an action ledger is for.
          await record({ toolName: entry.name, status: 'ok' });
          return JSON.stringify(result);
        } catch (err) {
          await record({
            toolName: entry.name,
            status: 'failed',
            detail: err instanceof Error ? err.message : String(err),
          });
          // Re-thrown unchanged — the SDK turns it into something the model
          // can react to, and observing must not alter that.
          throw err;
        }
      },
    }),
  );
}

/**
 * Runtime result → the platform's own vocabulary (ADR-0017 D2).
 *
 * Also a free function, for the same reason as `toSdkTools`: it lets a test
 * hand it a result with two pending approvals, or one with a final output AND
 * an interruption, without a network call — and the second of those is the case
 * the status rule below exists for.
 */
export function normaliseTurn(
  result: RunResultLike,
  logger?: Logger,
): AgentTurn {
  const interruptions = result.interruptions ?? [];
  const pendingApprovals: PendingApproval[] = [];

  for (const interruption of interruptions) {
    const ref = refOf(interruption);
    if (!ref) {
      /**
       * Should not happen — every function tool call carries a callId. If one
       * ever does not, the pause cannot be matched back to a decision, so it is
       * dropped from the approvals list rather than given an invented ref.
       *
       * Dropping it is the SAFE direction and not a shrug: the interruption is
       * still counted below, so the run stays `awaiting_approval` forever and
       * nothing executes. A fabricated ref would do the opposite.
       */
      logger?.warn(
        'An agent interruption carried no call id; it cannot be presented for approval',
      );
      continue;
    }
    const raw = (interruption as { rawItem?: RawToolCall }).rawItem;
    pendingApprovals.push({
      ref,
      toolName:
        (interruption as { toolName?: string }).toolName ??
        raw?.name ??
        'unknown',
      args: parseArgs(raw?.arguments),
    });
  }

  return {
    /**
     * 🔴 Driven by the interruptions themselves, never by "did we get a final
     * output". A run can produce text AND still be waiting on a write, and
     * reading the text as completion is how an unapproved proposal ends up
     * recorded as a finished run.
     */
    status: interruptions.length > 0 ? 'awaiting_approval' : 'completed',
    state: result.state.toString(),
    pendingApprovals,
    providerItems: result.history,
    finalOutput:
      typeof result.finalOutput === 'string' ? result.finalOutput : undefined,
  };
}

@Injectable()
export class OpenAiAgentsProvider extends AgentRuntimeProvider {
  readonly runtime = 'openai-agents' as const;

  private readonly logger = new Logger(OpenAiAgentsProvider.name);

  /**
   * ⚠️ No `ConnectorConfigService`, since W47 F3-5 — and its absence is the
   * point rather than a tidy-up. This adapter can no longer read what model is
   * configured, so it cannot quietly reacquire an opinion about which one to
   * run: the caller's profile is the only source, and that is now enforced by
   * what this class can reach rather than by a comment.
   */
  constructor(
    private readonly registry: AgentToolRegistry,
    private readonly config: ConfigService,
  ) {
    super();
    enforceTracingDisabled();
  }

  async start(setup: AgentSetup, input: string): Promise<AgentTurn> {
    const agent = await this.buildAgent(setup);
    const result = await run(agent, input, { maxTurns: MAX_TURNS });
    return normaliseTurn(result as unknown as RunResultLike, this.logger);
  }

  async resume(
    setup: AgentSetup,
    state: string,
    decisions: ApprovalDecision[],
  ): Promise<AgentTurn> {
    const agent = await this.buildAgent(setup);

    /**
     * 🔴 R16 — the saved state is an SDK-internal structure, so an upgrade can
     * make an old `awaiting_approval` run un-resumable. Fail LOUD.
     *
     * The tempting alternative — start a fresh run from the same input — is the
     * one thing that must not happen: the human approved a specific tool call,
     * and a new run would re-derive its own, then execute under an approval that
     * was never given for it.
     */
    const runState = await RunState.fromString(agent, state).catch(
      (err: Error) => {
        throw new ServiceUnavailableException(
          `This run cannot be resumed; its saved state is not readable by the current SDK version (R16): ${err?.message}`,
        );
      },
    );

    const pending = interruptionsOf(runState);

    for (const decision of decisions) {
      const item = pending.find(
        (candidate) => refOf(candidate) === decision.ref,
      );
      if (!item) {
        throw new BadRequestException(
          `No pending approval '${decision.ref}' on this run`,
        );
      }
      if (decision.approved) {
        // No `alwaysApprove`: an approval is for THIS call. Blanket-approving a
        // tool for the rest of the run would mean one click authorising writes
        // nobody has seen yet — Tier 2 by accident (ADR-0036 D3).
        runState.approve(item);
      } else {
        runState.reject(item, { message: decision.reason });
      }
    }

    /**
     * 🔴 Every pause must have been decided before the run continues.
     *
     * Resuming with an undecided interruption still standing is the failure D2
     * exists to prevent: the run carries on, and whether that untouched call
     * eventually executes depends on runtime behaviour rather than on anything
     * a person chose. Refusing is the only reading that keeps "a human decided"
     * true.
     */
    const undecided = pending.filter(
      (candidate) => !decisions.some((d) => d.ref === refOf(candidate)),
    );
    if (undecided.length > 0) {
      throw new BadRequestException(
        `${undecided.length} pending approval(s) on this run have no decision; resume was refused`,
      );
    }

    const result = await run(agent, runState, { maxTurns: MAX_TURNS });
    return normaliseTurn(result as unknown as RunResultLike, this.logger);
  }

  private async buildAgent(setup: AgentSetup) {
    /**
     * 🔴 E1 is applied HERE, on every run, rather than once in the constructor.
     *
     * Two reasons, and the second is the one that matters:
     *   1. It matches `resolveModel` below — configuration is read when it is
     *      used, so a change takes effect without a restart.
     *   2. 🔴 A constructor that threw would take the whole Nest module down at
     *      boot, which turns "AI-Assist is not configured" into "the API will
     *      not start" — and the platform's other nine screens have nothing to
     *      do with this. Refusing per-run keeps the blast radius at the feature
     *      that is actually unconfigured.
     */
    setDefaultOpenAIClient(buildAzureClient(this.config));

    return new Agent({
      name: AGENT_NAME,
      instructions: setup.instructions,
      /**
       * W47 F3-5 — from the caller, which got it from the run's profile.
       *
       * 🔴 The "no default" rule this file used to enforce with its own
       * `resolveModel` has not been relaxed, it has MOVED: `AgentSetup.model` is
       * required, so an unset model is now a compile error here and a refusal in
       * `AgentProfileService.resolveForRun` there. What is gone is this adapter
       * having a private opinion about which model "the" model is — two
       * adapters holding that opinion separately is how they drift.
       */
      model: setup.model,
      // W48 F3-4 — `list(ctx)`, never `all()`: a run with no request is shown
      // no request tools, and "shown" is the boundary (ADR-0041 D3).
      tools: toSdkTools(
        this.registry.list(setup.ctx),
        setup.ctx,
        setup.onToolExecuted,
      ),
    });
  }
}
