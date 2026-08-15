import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Agent,
  RunResult,
  RunState,
  run,
  setTracingDisabled,
  tool,
  type RunToolApprovalItem,
} from '@openai/agents';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { AgentToolRegistry } from './tool-registry';
import type { AgentTool, AgentToolContext } from './agent-tool';
import {
  AgentRuntimeProvider,
  type AgentSetup,
  type AgentTurn,
  type ApprovalDecision,
  type PendingApproval,
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
) {
  return registered.map((entry) =>
    tool({
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
      strict: true,
      needsApproval: entry.needsApproval,
      execute: async (args: unknown) => {
        const result = await entry.execute(args, ctx);
        return JSON.stringify(result);
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

  constructor(
    private readonly registry: AgentToolRegistry,
    private readonly connectorConfig: ConnectorConfigService,
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
    return new Agent({
      name: AGENT_NAME,
      instructions: setup.instructions,
      model: await this.resolveModel(),
      tools: toSdkTools(this.registry.list(), setup.ctx),
    });
  }

  /**
   * 🔴 No default, on purpose (plan OQ-1 / OQ-7).
   *
   * Which model this runs on decides what it costs, what it can do, and which
   * third party receives a real person's request text. A fallback constant
   * would make all three choices silently and then hide them in this file, so
   * an unset value stops the run instead.
   */
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
