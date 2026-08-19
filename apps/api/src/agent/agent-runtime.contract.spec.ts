import type { AppUser } from '@prisma/client';
import { toSdkTools } from './openai-agents.provider';
import { toClaudeTools } from './claude-tool-runner.provider';
import type { AgentTool, AgentToolContext } from './agent-tool';
import type { ToolExecution } from './agent-runtime.provider';

/**
 * W46 期二 `B3` — the contract test ADR-0036 D1 asks for.
 *
 * 🔴 Why this file exists on top of the two provider specs: each of those proves
 * its own adapter is self-consistent, which is a different claim from "the two
 * agree". D1 says one tool definition serves both runtimes, and the version of
 * that claim which actually matters operationally is narrower and sharper —
 * **the same tool call produces the same `AgentStep`, whichever runtime ran it**.
 * If it did not, the action ledger would mean something different depending on a
 * configuration string, and every audit built on it would be reading two
 * vocabularies as one. Shape agreement (`toSdkTools` and `toClaudeTools` both
 * accept the registry's JSON Schema) is already covered; this is the behaviour.
 *
 * Same family as `license-ops.contract.spec.ts` (W39 F2), and the technique is
 * borrowed wholesale: reduce what happened to something comparable, then assert
 * the two reductions are equal — never assert each side separately against a
 * fixture, because two specs that each match my expectations can still disagree
 * with each other.
 *
 * 🔴 The two entry points genuinely differ — `invoke(runContext, jsonString)`
 * against `run(object)` — and that asymmetry is the point. It is exactly what an
 * adapter is FOR, and a contract that could only be written if the two SDKs
 * looked alike would be testing the SDKs rather than the seam.
 *
 * ⚠️ Neither SDK is mocked here. `tool()` and `betaTool()` both run for real;
 * nothing constructs a client, so nothing reaches the network (ADR-0038 D3).
 */

const CTX: AgentToolContext = {
  runId: 'run-1',
  user: { id: 'u-admin', opcoScopeId: null } as unknown as AppUser,
  requestId: 'req-1',
};

const ARGS = { requestId: 'req-1' };

/** One registry tool, parameterised by what its `execute` does. */
const toolThat = (execute: AgentTool['execute']): AgentTool => ({
  name: 'get_request',
  description: 'Read one request.',
  parameters: {
    type: 'object',
    properties: { requestId: { type: 'string' } },
    required: ['requestId'],
    additionalProperties: false,
  },
  needsApproval: false,
  requestScoped: true,
  execute,
});

/**
 * The two adapters, each with the one thing that differs about it: how the SDK
 * it targets hands arguments to a tool.
 *
 * `invoke`'s first parameter is the SDK's run context, which our `execute` never
 * touches — passing an empty object keeps the call honest without dragging a
 * whole runner in.
 */
const ADAPTERS = [
  {
    runtime: 'openai-agents',
    build: toSdkTools,
    call: (sdkTool: unknown, args: unknown) =>
      (
        sdkTool as { invoke: (ctx: unknown, input: string) => Promise<unknown> }
      ).invoke({}, JSON.stringify(args)),
  },
  {
    runtime: 'claude-tool-runner',
    build: toClaudeTools,
    call: (sdkTool: unknown, args: unknown) =>
      (sdkTool as { run: (args: unknown) => Promise<unknown> }).run(args),
  },
] as const;

/**
 * Put one situation to one adapter and reduce it to something comparable.
 *
 * ⚠️ `returned` is captured but never compared between the two. The OpenAI SDK
 * wants a string back and Claude's helper takes either, so a difference there
 * is a vendor detail rather than a contract breach. It is here for ONE
 * assertion — the divergence block at the bottom, where it is the evidence that
 * a swallowed error still reaches the model.
 */
const observe = async (
  adapter: (typeof ADAPTERS)[number],
  tool: AgentTool,
  onToolExecuted?: (record: ToolExecution) => Promise<void>,
) => {
  const recorded: ToolExecution[] = [];
  const sdkTools = adapter.build([tool], CTX, async (record) => {
    recorded.push(record);
    if (onToolExecuted) await onToolExecuted(record);
  });

  let threw: string | null = null;
  let returned: unknown = undefined;
  try {
    returned = await adapter.call(sdkTools[0], ARGS);
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }

  return { recorded, threw, returned };
};

/** Run one situation through BOTH adapters and hand back the two reductions. */
const bothRuntimes = async (
  makeTool: () => AgentTool,
  onToolExecuted?: (record: ToolExecution) => Promise<void>,
) => {
  const [openai, claude] = await Promise.all(
    ADAPTERS.map((adapter) => observe(adapter, makeTool(), onToolExecuted)),
  );
  return { openai, claude };
};

describe('AgentRuntimeProvider contract — both adapters write the same AgentStep (B3 / D1)', () => {
  it('has two adapters to compare at all', () => {
    // Guards every assertion below: with one adapter, "the two agree" is
    // vacuously true and this whole file would be a row of green nothing.
    // (W46 has been caught by a `for` over an empty list once already.)
    expect(ADAPTERS).toHaveLength(2);
  });

  describe('a tool that succeeds', () => {
    it('records the same execution on both runtimes', async () => {
      const { openai, claude } = await bothRuntimes(() =>
        toolThat(async () => ({ id: 'req-1' })),
      );

      // 🔴 The contract, in one line: identical, not merely similar. A runtime
      // that recorded `status: 'success'` instead of `'ok'`, or prefixed the
      // tool name, would still look perfectly reasonable in its own spec.
      expect(openai.recorded).toEqual(claude.recorded);
      expect(openai.recorded).toEqual([
        { toolName: 'get_request', status: 'ok' },
      ]);
    });

    it('records exactly one step per call on both runtimes', async () => {
      const { openai, claude } = await bothRuntimes(() =>
        toolThat(async () => ({ id: 'req-1' })),
      );

      // A second record would double-count the action ledger; none would leave
      // a run whose transcript shows work that its ledger does not.
      expect(openai.recorded).toHaveLength(1);
      expect(claude.recorded).toHaveLength(1);
    });
  });

  describe('a tool that throws', () => {
    it('records the same failure on both runtimes, message included', async () => {
      const { openai, claude } = await bothRuntimes(() =>
        toolThat(async () => {
          throw new Error('Request not found');
        }),
      );

      expect(openai.recorded).toEqual(claude.recorded);
      expect(openai.recorded).toEqual([
        {
          toolName: 'get_request',
          status: 'failed',
          detail: 'Request not found',
        },
      ]);
    });

    /**
     * 🔴🔴 A REAL divergence, found by this file on its first run, and PINNED
     * rather than papered over — the `license-ops.contract.spec.ts` precedent,
     * which does the same for W39 OQ-1's replay difference.
     *
     * Both adapters re-throw; identical code, three lines apart. The SDKs then
     * disagree about what happens next:
     *
     *   `@openai/agents` — `tool()` catches it and returns an error STRING,
     *                      which the runner feeds back to the model
     *   `betaTool`       — lets it propagate to whoever called `run`
     *
     * 🔴 Why this does not break B3, stated rather than assumed: the divergence
     * sits BELOW the adapter and ABOVE the ledger. The `AgentStep` is identical
     * either way (asserted above, and that is the claim B3 makes), and the model
     * is told the tool failed on both paths — which is what the two assertions
     * below actually check, one per mechanism.
     *
     * ⚠️ The reason it is worth a test at all is that it is invisible from
     * either provider's own spec: each one is entirely correct about itself.
     */
    it('tells the model it failed on both — but through different mechanisms', async () => {
      const { openai, claude } = await bothRuntimes(() =>
        toolThat(async () => {
          throw new Error('Request not found');
        }),
      );

      // Claude: the throw reaches the caller.
      expect(claude.threw).toContain('Request not found');

      // OpenAI: the SDK swallowed it — so the evidence that the model still
      // learns of the failure has to come from the RETURN value. Asserting only
      // `threw === null` would pin the swallow without pinning that anything
      // survives it, which is the half that matters.
      expect(openai.threw).toBeNull();
      expect(String(openai.returned)).toContain('Request not found');
    });
  });

  /**
   * ADR-0036 D4 — the observer is TOLD, it does not decide. Both adapters
   * swallow its throw, and they have to agree on that too: a runtime where a
   * database hiccup in the action ledger could fail a tool call would behave
   * differently under load than its counterpart, from the same configuration.
   */
  describe('an observer that throws', () => {
    it('changes nothing on either runtime', async () => {
      const { openai, claude } = await bothRuntimes(
        () => toolThat(async () => ({ id: 'req-1' })),
        async () => {
          throw new Error('the ledger is down');
        },
      );

      expect(openai.threw).toBeNull();
      expect(claude.threw).toBeNull();
      expect(openai.recorded).toEqual(claude.recorded);
    });
  });

  /**
   * The shape half, stated once so this file describes the whole of D1 rather
   * than only its behavioural end. `claude-tool-runner.provider.spec.ts` pins
   * the stronger version of it (schema identity, `toBe`); here it is the fact
   * that neither adapter adds, drops or renames a tool.
   */
  it('exposes the same tool names from the same registry list', () => {
    const tools = [toolThat(async () => ({}))];

    const names = ADAPTERS.map((adapter) =>
      adapter
        .build(tools, CTX, undefined)
        .map((sdkTool: { name: string }) => sdkTool.name),
    );

    expect(names[0]).toEqual(names[1]);
    expect(names[0]).toEqual(['get_request']);
  });
});
