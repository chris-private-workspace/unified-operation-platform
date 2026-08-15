import { readFileSync } from 'fs';
import { join } from 'path';
import { ServiceUnavailableException } from '@nestjs/common';
import { getGlobalTraceProvider, setTracingDisabled } from '@openai/agents';
import type { AppUser } from '@prisma/client';
import {
  OpenAiAgentsProvider,
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

describe('OpenAiAgentsProvider', () => {
  let registry: AgentToolRegistry;
  let connectorConfig: { resolve: jest.Mock };
  let provider: OpenAiAgentsProvider;

  beforeEach(() => {
    // The registry builds its tool list in the constructor and touches nothing
    // on Prisma until a tool actually executes.
    registry = new AgentToolRegistry({} as unknown as PrismaService);
    connectorConfig = { resolve: jest.fn() };
    provider = new OpenAiAgentsProvider(
      registry,
      connectorConfig as unknown as ConnectorConfigService,
    );
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
      expect(needing).toEqual(['propose_line_items']);
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
