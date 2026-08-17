import { readFileSync } from 'fs';
import { join } from 'path';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { getGlobalTraceProvider, setTracingDisabled } from '@openai/agents';
import type { AppUser } from '@prisma/client';
import {
  OpenAiAgentsProvider,
  buildAzureClient,
  normaliseTurn,
  toSdkTools,
  type RunResultLike,
} from './openai-agents.provider';
import { AgentToolRegistry } from './tool-registry';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConnectorConfigService } from '../integration/connector-config.service';
import type { AgentTool, AgentToolContext } from './agent-tool';

/**
 * W46 F3 / F4 — the OpenAI adapter.
 *
 * Two things are pinned here and they are not the same kind of claim:
 *   - TRACING IS OFF (A4 / D11) — a property of the process, asserted against
 *     the live trace provider.
 *   - THE SEAM CARRIES WHAT IT SAYS (D1/D3) — `needsApproval` survives the
 *     conversion, and a run waiting on a human is never reported as finished.
 */

const ctx: AgentToolContext = {
  runId: 'run-1',
  user: { id: 'u-admin', opcoScopeId: null } as unknown as AppUser,
};

/** The SDK's sentinel id for a trace that was never really created. */
const NOOP_TRACE_ID = 'no-op';

const currentTraceId = () =>
  getGlobalTraceProvider().createTrace({ name: 'probe' }).traceId;

const fakeTool = (
  name: string,
  needsApproval: boolean,
  execute: AgentTool['execute'] = async () => ({}),
): AgentTool => ({
  name,
  description: `what ${name} does`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  needsApproval,
  execute,
});

/**
 * 🔴 The SDK normalises `needsApproval: true` into `async () => true`, so the
 * obvious assertion (`expect(tool.needsApproval).toBe(true)`) cannot work — and
 * the tempting repair (`toBeDefined()`) would pass whatever was configured,
 * including `false`. The policy has to be CALLED.
 */
const approvalPolicyOf = (sdkTool: { needsApproval: unknown }) =>
  sdkTool.needsApproval as unknown as () => Promise<boolean>;

const resultLike = (over: Partial<RunResultLike> = {}): RunResultLike => ({
  state: { toString: () => 'SERIALISED-STATE' },
  history: [],
  ...over,
});

const interruption = (callId: string, name: string, args: string) => ({
  toolName: name,
  rawItem: { callId, name, arguments: args },
});

/**
 * A `ConfigService` stand-in. Defaults to a COMPLETE Azure configuration, so a
 * test that is not about E1 does not have to think about it — and the E1 tests
 * below take things away one at a time.
 */
const configOf = (over: Record<string, string | undefined> = {}) =>
  ({
    get: (key: string) =>
      ({
        AZURE_OPENAI_ENDPOINT: 'https://uop-test.openai.azure.com/',
        AZURE_OPENAI_API_KEY: 'azure-fake-key',
        AZURE_OPENAI_API_VERSION: '2024-10-21',
        ...over,
      })[key],
  }) as unknown as ConfigService;

describe('OpenAiAgentsProvider', () => {
  let registry: AgentToolRegistry;
  let connectorConfig: { resolve: jest.Mock };
  let config: ConfigService;
  let provider: OpenAiAgentsProvider;

  beforeEach(() => {
    // The registry builds its tool list in the constructor and touches nothing
    // on Prisma until a tool actually executes.
    registry = new AgentToolRegistry({} as unknown as PrismaService);
    connectorConfig = { resolve: jest.fn() };
    config = configOf();
    provider = new OpenAiAgentsProvider(
      registry,
      connectorConfig as unknown as ConnectorConfigService,
      config,
    );
  });

  /**
   * 🔴🔴 ADR-0037 `E1` — inference only ever goes to the company's Azure
   * OpenAI resource.
   *
   * ⚠️ These tests are the ONLY thing enforcing that. Before 2026-08-17, E1 was
   * held up by nobody having set `OPENAI_API_KEY` — an absence, not a boundary.
   * One env var would have sent a real person's email text to the public API
   * with no error and nothing red.
   *
   * 📌 The asymmetry worth remembering: the CLAUDE runtime, which nobody uses,
   * already had exactly this guard (ADR-0038 D3). The default runtime did not.
   * The weaker guard sat on the busier path, and no checklist noticed — it took
   * a question about "how does one actually use this" to surface it.
   */
  describe('🔴 E1 — the public OpenAI API is not a fallback (ADR-0037)', () => {
    it('refuses to run rather than defaulting to api.openai.com', () => {
      expect(() =>
        buildAzureClient(configOf({ AZURE_OPENAI_ENDPOINT: undefined })),
      ).toThrow(ServiceUnavailableException);
    });

    /**
     * The message is asserted, not just the throw. An operator reading
     * "inference is not configured" would reasonably reach for the nearest key
     * they have — which is the public one. The refusal has to say that is not
     * the answer.
     */
    it('says why, so nobody reaches for a public API key instead', () => {
      expect(() =>
        buildAzureClient(configOf({ AZURE_OPENAI_ENDPOINT: undefined })),
      ).toThrow(/NOT an allowed fallback/);
    });

    it('refuses without a credential', () => {
      expect(() =>
        buildAzureClient(configOf({ AZURE_OPENAI_API_KEY: undefined })),
      ).toThrow(ServiceUnavailableException);
    });

    /**
     * 🔴 No default api-version, deliberately. It decides whether the deployment
     * speaks the Responses API — which is what `@openai/agents` uses — so a
     * guessed value turns a configuration problem into a 404 that mentions
     * neither.
     */
    it('refuses without an api-version rather than guessing one', () => {
      expect(() =>
        buildAzureClient(configOf({ AZURE_OPENAI_API_VERSION: undefined })),
      ).toThrow(/AZURE_OPENAI_API_VERSION/);
    });

    /**
     * 🔴 The positive half, and it asserts the thing that actually matters:
     * where the client POINTS. Asserting "a client was returned" would pass for
     * a perfectly-constructed client aimed at the public API.
     */
    it('builds a client aimed at the company resource, not the public API', () => {
      const client = buildAzureClient(configOf());

      expect(client.baseURL).toContain('uop-test.openai.azure.com');
      expect(client.baseURL).not.toContain('api.openai.com');
    });

    /**
     * 📌 `deployment` is NOT pinned on the client, on purpose: Azure then reads
     * it from the per-request `model`, which is `AGENT_MODEL` /
     * `ConnectorConfig.agentModel`. That keeps the one value an operator really
     * does change editable at run time (ADR-0013 Model C / ADR-0037 E3) instead
     * of freezing it into a client built once.
     */
    it('leaves the deployment to the per-request model', () => {
      expect(buildAzureClient(configOf()).deploymentName).toBeUndefined();
    });
  });

  // ── A4 / D11 — tracing ─────────────────────────────────────

  describe('tracing is off (A4 / D11 / H4)', () => {
    // Global process state: leaving it on would silently arm every later test.
    afterEach(() => setTracingDisabled(true));

    it('constructing the provider disables the LIVE trace provider', () => {
      setTracingDisabled(false);

      /**
       * 🔴 This line is half the test, not setup.
       *
       * `config.tracing.disabled` returns true whenever NODE_ENV === 'test', and
       * the global TraceProvider reads it once in its constructor — so under
       * Jest tracing is ALREADY off before anything here runs. Without switching
       * it back on first, the assertion below would pass with the provider's
       * `enforceTracingDisabled()` call deleted, which is the exact shape of an
       * assertion that looks strict and catches nothing.
       */
      expect(currentTraceId()).not.toBe(NOOP_TRACE_ID);

      new OpenAiAgentsProvider(
        registry,
        connectorConfig as unknown as ConnectorConfigService,
        config,
      );

      expect(currentTraceId()).toBe(NOOP_TRACE_ID);
    });

    it('.env.example carries the env kill-switch as well (D11 layer 1)', () => {
      const example = readFileSync(
        join(__dirname, '..', '..', '.env.example'),
        'utf8',
      );
      expect(example).toContain('OPENAI_AGENTS_DISABLE_TRACING=1');
    });
  });

  // ── D1 — one tool definition, converted ────────────────────

  describe('toSdkTools (D1)', () => {
    it('carries needsApproval across the seam, asserted by calling the policy', async () => {
      const [read, write] = toSdkTools(
        [fakeTool('read_thing', false), fakeTool('write_thing', true)],
        ctx,
      );

      await expect(approvalPolicyOf(read)()).resolves.toBe(false);
      await expect(approvalPolicyOf(write)()).resolves.toBe(true);
    });

    it('keeps every tool, with its name and description', () => {
      const sdk = toSdkTools(
        [fakeTool('alpha', false), fakeTool('beta', true)],
        ctx,
      );
      expect(sdk.map((t) => t.name)).toEqual(['alpha', 'beta']);
      expect(sdk.map((t) => t.description)).toEqual([
        'what alpha does',
        'what beta does',
      ]);
    });

    /**
     * The real registry, through the real converter. `tool()` validates the
     * schema under strict mode and throws on a shape it will not accept, so
     * this is where a registry schema that OpenAI rejects gets caught — at
     * build time rather than on somebody's first run.
     */
    it('accepts every tool the real registry exposes, under strict mode', () => {
      const sdk = toSdkTools(registry.list(), ctx);
      expect(sdk).toHaveLength(registry.list().length);
      expect(sdk.every((t) => t.strict)).toBe(true);
    });

    it('asks the model for approval on exactly the registry tools that require it', async () => {
      const sdk = toSdkTools(registry.list(), ctx);
      const needing: string[] = [];
      for (const t of sdk) {
        if (await approvalPolicyOf(t)()) needing.push(t.name);
      }
      // Same fact as the registry's own allow-list test, checked on the far
      // side of the conversion — that is the point: it is the crossing that
      // could lose it.
      expect(needing).toEqual(['propose_line_items', 'propose_assign']);
    });
  });

  // ── ADR-0017 D2 — the normalised vocabulary ────────────────

  describe('normaliseTurn', () => {
    it('reports completed when nothing is pending', () => {
      const turn = normaliseTurn(resultLike({ finalOutput: 'done' }));
      expect(turn.status).toBe('completed');
      expect(turn.pendingApprovals).toEqual([]);
      expect(turn.state).toBe('SERIALISED-STATE');
    });

    /**
     * 🔴 The case the status rule exists for. A model can produce text AND still
     * be stopped in front of a write; reading the text as completion is how an
     * unapproved proposal ends up recorded as a finished run.
     */
    it('reports awaiting_approval even when the model also produced text', () => {
      const turn = normaliseTurn(
        resultLike({
          interruptions: [
            interruption('call-1', 'propose_line_items', '{"requestId":"r1"}'),
          ],
          finalOutput: 'I suggest E5 and Visio',
        }),
      );
      expect(turn.status).toBe('awaiting_approval');
      expect(turn.finalOutput).toBe('I suggest E5 and Visio');
    });

    it('gives every pause a ref a later decision can be matched against', () => {
      const turn = normaliseTurn(
        resultLike({
          interruptions: [
            interruption('call-1', 'propose_line_items', '{"a":1}'),
            interruption('call-2', 'propose_line_items', '{"a":2}'),
          ],
        }),
      );
      expect(turn.pendingApprovals.map((p) => p.ref)).toEqual([
        'call-1',
        'call-2',
      ]);
      expect(turn.pendingApprovals[0].toolName).toBe('propose_line_items');
      expect(turn.pendingApprovals[0].args).toEqual({ a: 1 });
    });

    /**
     * A pause with no call id cannot be matched back to a decision, so it is
     * dropped from the list — but the run must STAY waiting. Anything else
     * would let an unapprovable write proceed because it was unapprovable.
     */
    it('drops an unidentifiable pause but keeps the run waiting', () => {
      const turn = normaliseTurn(
        resultLike({ interruptions: [{ rawItem: {} }] }),
      );
      expect(turn.pendingApprovals).toEqual([]);
      expect(turn.status).toBe('awaiting_approval');
    });

    it('hands back raw text when the model produced arguments that are not JSON', () => {
      const turn = normaliseTurn(
        resultLike({
          interruptions: [
            interruption('call-1', 'propose_line_items', 'not json at all'),
          ],
        }),
      );
      // A human is about to read this to decide. "Nothing to show" is worse
      // than "here is exactly what it said".
      expect(turn.pendingApprovals[0].args).toBe('not json at all');
    });

    it('ignores a non-string finalOutput rather than stringifying it', () => {
      const turn = normaliseTurn(resultLike({ finalOutput: { a: 1 } }));
      expect(turn.finalOutput).toBeUndefined();
    });
  });

  // ── OQ-1 — no model, no run ────────────────────────────────

  describe('model configuration (OQ-1)', () => {
    it('refuses to start when no model is configured, instead of picking one', async () => {
      connectorConfig.resolve.mockResolvedValue(undefined);
      await expect(
        provider.start({ instructions: 'help', ctx }, 'hello'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('treats a blank configured model as unset', async () => {
      connectorConfig.resolve.mockResolvedValue('   ');
      await expect(
        provider.start({ instructions: 'help', ctx }, 'hello'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('reads the model from the agent connector, DB-then-env', async () => {
      connectorConfig.resolve.mockResolvedValue(undefined);
      await provider
        .start({ instructions: 'help', ctx }, 'hello')
        .catch(() => undefined);
      expect(connectorConfig.resolve).toHaveBeenCalledWith(
        'agent',
        'agentModel',
      );
    });
  });
});
