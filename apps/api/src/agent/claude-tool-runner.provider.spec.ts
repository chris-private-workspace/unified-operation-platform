import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import type { AgentTool, AgentToolContext } from './agent-tool';
import type { AgentSetup, ToolExecution } from './agent-runtime.provider';

/**
 * 🔴 ONLY the client is mocked, and that split is the whole design of this file
 * (ADR-0038 D4).
 *
 * `betaTool` lives at `@anthropic-ai/sdk/helpers/beta/json-schema` — a different
 * module specifier from the root client — so it runs FOR REAL here while the
 * network-facing half is replaced. That is the difference between proving D1
 * and proving that I am consistent with myself: if both sides were fixtures I
 * wrote, `toClaudeTools` would be converting our shape into my guess at the
 * SDK's shape, and the test would be green no matter which of us was wrong.
 *
 * W46 has already been caught by that family three times (symmetric fixtures
 * hiding mean-vs-median, a `for` over an empty list satisfying any claim, an
 * expectation derived from the same step it was checking).
 */
const mockAnthropicCtor = jest.fn();
const mockToolRunner = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    beta = { messages: { toolRunner: mockToolRunner } };
    constructor(...args: unknown[]) {
      mockAnthropicCtor(...args);
    }
  },
}));

// Imported AFTER the mock so the provider picks up the fake client. `betaTool`
// is untouched by it.
/* eslint-disable @typescript-eslint/no-var-requires */
const {
  ClaudeToolRunnerProvider,
  toClaudeTools,
  pendingApprovalsOf,
  parseConversation,
} =
  require('./claude-tool-runner.provider') as typeof import('./claude-tool-runner.provider');
/* eslint-enable @typescript-eslint/no-var-requires */

const CTX: AgentToolContext = {
  runId: 'run_1',
  user: { id: 'u_1', opcoId: 'opco_1' } as unknown as AppUser,
};

const READ_TOOL: AgentTool = {
  name: 'get_request',
  description: 'Read one request.',
  parameters: {
    type: 'object',
    properties: { requestId: { type: 'string' } },
    required: ['requestId'],
    additionalProperties: false,
  },
  needsApproval: false,
  execute: jest.fn().mockResolvedValue({ id: 'req_1' }),
};

const WRITE_TOOL: AgentTool = {
  name: 'propose_assign',
  description: 'Propose an assignment.',
  parameters: {
    type: 'object',
    properties: { lineItemId: { type: 'string' } },
    required: ['lineItemId'],
    additionalProperties: false,
  },
  needsApproval: true,
  execute: jest.fn().mockResolvedValue({ proposed: true }),
};

const TOOLS = [READ_TOOL, WRITE_TOOL];

/** An assistant turn that asks to run the write tool. */
const assistantAsking = (id = 'toolu_1') => ({
  role: 'assistant',
  content: [
    { type: 'text', text: 'I suggest this.' },
    {
      type: 'tool_use',
      id,
      name: 'propose_assign',
      input: { lineItemId: 'li_1' },
    },
  ],
});

const assistantDone = () => ({
  role: 'assistant',
  content: [{ type: 'text', text: 'All done.' }],
});

/**
 * A stand-in for `BetaToolRunner`: an async iterable over the turns given, with
 * a `params.messages` the provider reads on completion.
 *
 * ⚠️ It deliberately does NOT append yielded turns to `params.messages`, because
 * the real runner does that AFTER the yield (`BetaToolRunner.js:31-33`) — which
 * is exactly the trap the provider has to work around. A helpful fake would
 * paper over the bug this file exists to pin down.
 */
const fakeRunner = (turns: unknown[], finalMessages: unknown[] = []) => ({
  params: { messages: finalMessages },
  async *[Symbol.asyncIterator]() {
    for (const turn of turns) yield turn;
  },
});

describe('ClaudeToolRunnerProvider (期二 G4 / ADR-0038)', () => {
  let registry: { list: jest.Mock };
  let config: { get: jest.Mock };
  let provider: InstanceType<typeof ClaudeToolRunnerProvider>;
  let recorded: ToolExecution[];
  let setup: AgentSetup;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = { list: jest.fn().mockReturnValue(TOOLS) };
    config = { get: jest.fn().mockReturnValue('sk-ant-fake') };
    recorded = [];
    setup = {
      instructions: 'Be useful.',
      // W47 F3-5 — the model now arrives WITH the setup. Before, this adapter
      // resolved it from `ConnectorConfig` itself.
      model: 'claude-x-1',
      ctx: CTX,
      onToolExecuted: async (r) => {
        recorded.push(r);
      },
    };
    provider = new ClaudeToolRunnerProvider(registry as never, config as never);
  });

  /* ------------------------------------------------------------------ D1 */

  describe('D1 — one tool definition, two runtimes', () => {
    /**
     * 🔴🔴 The double cast is a FINDING, not tidying up.
     *
     * `betaTool` returns `BetaRunnableTool`, which is `BetaToolUnion & { run }` —
     * and that union includes Anthropic's own built-in tools (text editor, bash,
     * …), which have no `inputSchema` at all. So TypeScript refuses a direct
     * cast, and it is right to: the return type genuinely may not carry the
     * field.
     *
     * That is the entire argument for ADR-0038 D4 arriving as evidence rather
     * than as an opinion. Against a fixture I had written, this assertion would
     * have compiled on the first try and proved nothing; against the real type
     * it immediately said my guess at the return shape was wrong.
     *
     * 🟢 It also puts D2's allow-list in a new light on this runtime: those
     * built-in tools are reachable through the same `tools` array. Nothing here
     * passes them, and nothing can — `toClaudeTools` maps the registry and only
     * the registry, which is what "the boundary is the registry" means when the
     * SDK's own type is offering you a shell.
     */
    it('hands the registry JSON Schema to betaTool unchanged, by identity', () => {
      const [read] = toClaudeTools(TOOLS, CTX) as unknown as Array<
        Record<string, unknown>
      >;

      // 🔴 `input_schema`, not `inputSchema` — the third thing the real SDK
      // corrected in this file. `betaTool` takes a camelCase option and emits
      // the API's snake_case wire field. D1 is unharmed by that: the SCHEMA
      // OBJECT crosses by identity (`toBe` below), only the key holding it is
      // renamed, and renaming a key is exactly the "shape conversion and
      // nothing else" an adapter is allowed to do.
      expect(read.input_schema).toBe(READ_TOOL.parameters);
      expect(read.name).toBe('get_request');
    });

    it('produces a tool the real betaTool accepted — not an object we shaped', () => {
      const [read] = toClaudeTools(TOOLS, CTX);

      // Asserting the fields betaTool ITSELF sets is what makes this a check on
      // the SDK rather than on my own object literal.
      expect(read).toHaveProperty('name', 'get_request');
      expect(read).toHaveProperty('description', 'Read one request.');
      expect(read).toHaveProperty('run', expect.any(Function));
    });

    it('runs the registry execute and stringifies for the model', async () => {
      const [read] = toClaudeTools(TOOLS, CTX, async (r) => {
        recorded.push(r);
      });

      const out = await (
        read as unknown as { run: (a: unknown) => Promise<string> }
      ).run({ requestId: 'req_1' });

      expect(READ_TOOL.execute).toHaveBeenCalledWith(
        { requestId: 'req_1' },
        CTX,
      );
      // A string, because `betaTool.run` may not return an object — the same
      // JSON.stringify the OpenAI adapter does, so the model sees identical text.
      expect(out).toBe('{"id":"req_1"}');
      expect(recorded).toEqual([{ toolName: 'get_request', status: 'ok' }]);
    });

    it('records a failed execution and rethrows unchanged', async () => {
      const boom = {
        ...READ_TOOL,
        execute: jest.fn().mockRejectedValue(new Error('nope')),
      };
      const [tool] = toClaudeTools([boom], CTX, async (r) => {
        recorded.push(r);
      });

      await expect(
        (tool as unknown as { run: (a: unknown) => Promise<string> }).run({}),
      ).rejects.toThrow('nope');
      expect(recorded).toEqual([
        { toolName: 'get_request', status: 'failed', detail: 'nope' },
      ]);
    });

    it('never lets the observer decide: its throw does not fail the tool', async () => {
      const [read] = toClaudeTools(TOOLS, CTX, async () => {
        throw new Error('ledger down');
      });

      await expect(
        (read as unknown as { run: (a: unknown) => Promise<string> }).run({
          requestId: 'req_1',
        }),
      ).resolves.toBe('{"id":"req_1"}');
    });
  });

  /* ------------------------------------------------------- D3 / R21 gate */

  describe('ADR-0038 D3 — implemented, not permitted to run', () => {
    it('refuses without an API key AND never constructs a client', async () => {
      config.get.mockReturnValue(undefined);

      await expect(provider.start(setup, 'hello')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // 🔴 The assertion R21 is actually about. "It threw" would also be true
      // of a provider that built a client, opened a connection and failed later.
      expect(mockAnthropicCtor).not.toHaveBeenCalled();
      expect(mockToolRunner).not.toHaveBeenCalled();
    });

    it('names OQ-7 in the refusal, so the reason is not read as a missing setting', async () => {
      config.get.mockReturnValue('   ');
      await expect(provider.start(setup, 'hi')).rejects.toThrow(/OQ-7/);
    });

    /**
     * 🔴 W47 F3-5 — this used to assert that the adapter REFUSED an unconfigured
     * model. That refusal has not been removed, it has moved: `AgentSetup.model`
     * is required, so "no model" is now a compile error at every call site
     * rather than a runtime throw here, and the refusal for a genuinely
     * unanswerable choice lives in `AgentProfileService.resolveForRun`.
     *
     * ⚠️ The obvious replacement — asserting `connectorConfig.resolve` was never
     * called — was written first and thrown away: this adapter no longer TAKES
     * that service, so the mock would be wired to nothing and the assertion
     * could not fail. What holds the claim instead is `agent.boundary.spec.ts`
     * (neither adapter may import it) plus the positive assertion further down
     * that `params.model` IS the value from the setup.
     */
    it('sends the caller’s model to the SDK, not one of its own (F3-5)', async () => {
      mockToolRunner.mockReturnValue(fakeRunner([assistantDone()]));

      await provider.start({ ...setup, model: 'a-different-model' }, 'hi');

      const params = mockToolRunner.mock.calls.at(-1)?.[0] as { model: string };
      expect(params.model).toBe('a-different-model');
    });
  });

  /* --------------------------------------------------- the approval gate */

  describe('pendingApprovalsOf', () => {
    it('pauses on a write tool', () => {
      expect(pendingApprovalsOf(assistantAsking(), TOOLS)).toEqual([
        {
          ref: 'toolu_1',
          toolName: 'propose_assign',
          args: { lineItemId: 'li_1' },
        },
      ]);
    });

    it('does not pause on a read tool', () => {
      const turn = {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 't1', name: 'get_request', input: {} },
        ],
      };
      expect(pendingApprovalsOf(turn, TOOLS)).toEqual([]);
    });

    /**
     * 🔴 D2 — `needsApproval` is read off the REGISTRY, never off the message.
     * A model that could mark its own call as pre-approved would be deciding
     * the one thing Tier 1 exists to keep with a person.
     */
    it('ignores a needsApproval claim carried in the message itself', () => {
      const turn = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'get_request',
            input: {},
            needsApproval: true,
          },
        ],
      };
      expect(pendingApprovalsOf(turn, TOOLS)).toEqual([]);
    });

    it('skips a tool that is not registered', () => {
      const turn = {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'rm_rf', input: {} }],
      };
      expect(pendingApprovalsOf(turn, TOOLS)).toEqual([]);
    });

    it('drops a pause with no id rather than inventing a ref', () => {
      const turn = {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'propose_assign', input: {} }],
      };
      expect(pendingApprovalsOf(turn, TOOLS)).toEqual([]);
    });
  });

  /* ------------------------------------------------------------- drive() */

  describe('start — the loop is the approval gate', () => {
    it('stops on a write tool and reports awaiting_approval', async () => {
      mockToolRunner.mockReturnValue(fakeRunner([assistantAsking()]));

      const turn = await provider.start(setup, 'assign something');

      expect(turn.status).toBe('awaiting_approval');
      expect(turn.pendingApprovals).toEqual([
        {
          ref: 'toolu_1',
          toolName: 'propose_assign',
          args: { lineItemId: 'li_1' },
        },
      ]);
      // 🔴 The write tool must not have run. On this runtime that is not a
      // refusal the SDK performs — it is the consumer declining to pull the
      // next value, which leaves `#generateToolResponse` unreached.
      expect(WRITE_TOOL.execute).not.toHaveBeenCalled();
    });

    /**
     * 🔴🔴 The trap only the real SDK reveals (BetaToolRunner.js:31-33).
     *
     * The runner appends the assistant turn to `params.messages` AFTER the
     * yield, so leaving the loop skips it. Without the provider's own push, the
     * saved conversation would have no `tool_use` block — and on resume its
     * `tool_result` would reference a call that is not there, which the Messages
     * API rejects with a 400. Nothing in a type signature says this, and no
     * amount of mocking would have surfaced it.
     */
    it('saves the paused assistant turn itself, since the runner has not', async () => {
      mockToolRunner.mockReturnValue(fakeRunner([assistantAsking()]));

      const turn = await provider.start(setup, 'assign something');
      const saved = JSON.parse(turn.state) as Array<{
        role: string;
        content: unknown;
      }>;

      expect(saved).toHaveLength(2);
      expect(saved[0]).toEqual({ role: 'user', content: 'assign something' });
      expect(saved[1].role).toBe('assistant');
      expect(saved[1].content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_use', id: 'toolu_1' }),
        ]),
      );
    });

    it('completes when nothing needs approval', async () => {
      mockToolRunner.mockReturnValue(
        fakeRunner([assistantDone()], [{ role: 'user', content: 'hi' }]),
      );

      const turn = await provider.start(setup, 'hi');

      expect(turn.status).toBe('completed');
      expect(turn.pendingApprovals).toEqual([]);
      expect(turn.finalOutput).toBe('All done.');
    });

    it('passes the registry tools and the system prompt to the runner', async () => {
      mockToolRunner.mockReturnValue(fakeRunner([assistantDone()]));
      await provider.start(setup, 'hi');

      const params = mockToolRunner.mock.calls[0][0] as {
        system: string;
        model: string;
        tools: unknown[];
        max_iterations: number;
      };
      expect(params.system).toBe('Be useful.');
      // 🔴 Both of these now come from the SETUP — the prompt always did, the
      // model since W47 F3-5. Asserted together because they travel together:
      // a profile is a model AND a prompt, and an adapter that honoured one
      // while resolving the other itself would make half of every profile a lie.
      expect(params.model).toBe('claude-x-1');
      expect(params.tools).toHaveLength(TOOLS.length);
      // A ceiling exists. Deliberately asserted as "a number", not the constant:
      // pinning the value would only restate the source line.
      expect(typeof params.max_iterations).toBe('number');
    });
  });

  /* ------------------------------------------------------------ resume() */

  describe('resume', () => {
    const parked = () =>
      JSON.stringify([{ role: 'user', content: 'go' }, assistantAsking()]);

    it('runs the approved tool itself and feeds the result back', async () => {
      mockToolRunner.mockReturnValue(fakeRunner([assistantDone()]));

      await provider.resume(setup, parked(), [
        { ref: 'toolu_1', approved: true },
      ]);

      expect(WRITE_TOOL.execute).toHaveBeenCalledWith(
        { lineItemId: 'li_1' },
        CTX,
      );
      expect(recorded).toEqual([{ toolName: 'propose_assign', status: 'ok' }]);

      const sent = (mockToolRunner.mock.calls[0][0] as { messages: unknown[] })
        .messages;
      expect(sent[sent.length - 1]).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '{"proposed":true}',
          },
        ],
      });
    });

    it('sends a rejection back as an error result so the model can react', async () => {
      mockToolRunner.mockReturnValue(fakeRunner([assistantDone()]));

      await provider.resume(setup, parked(), [
        { ref: 'toolu_1', approved: false, reason: 'Wrong SKU' },
      ]);

      expect(WRITE_TOOL.execute).not.toHaveBeenCalled();
      const sent = (mockToolRunner.mock.calls[0][0] as { messages: unknown[] })
        .messages;
      expect(sent[sent.length - 1]).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            is_error: true,
            content: 'Wrong SKU',
          },
        ],
      });
    });

    /**
     * 🔴 Same rule the OpenAI adapter enforces: resuming with an undecided pause
     * standing would mean whether that call runs depends on runtime behaviour
     * rather than on what a person chose.
     */
    it('refuses when a pending approval has no decision', async () => {
      await expect(provider.resume(setup, parked(), [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockToolRunner).not.toHaveBeenCalled();
    });

    it('refuses a decision that matches no pending approval', async () => {
      await expect(
        provider.resume(setup, parked(), [
          { ref: 'toolu_1', approved: true },
          { ref: 'ghost', approved: true },
        ]),
      ).rejects.toThrow(/ghost/);
    });

    it('refuses loudly when the approved tool is no longer registered', async () => {
      registry.list.mockReturnValueOnce(TOOLS).mockReturnValue([READ_TOOL]);

      await expect(
        provider.resume(setup, parked(), [{ ref: 'toolu_1', approved: true }]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('reports a tool that broke after approval as an error result, not a throw', async () => {
      const broken: AgentTool = {
        ...WRITE_TOOL,
        execute: jest.fn().mockRejectedValue(new Error('gate said no')),
      };
      registry.list.mockReturnValue([READ_TOOL, broken]);
      mockToolRunner.mockReturnValue(fakeRunner([assistantDone()]));

      await provider.resume(setup, parked(), [
        { ref: 'toolu_1', approved: true },
      ]);

      expect(recorded).toEqual([
        {
          toolName: 'propose_assign',
          status: 'failed',
          detail: 'gate said no',
        },
      ]);
      const sent = (mockToolRunner.mock.calls[0][0] as { messages: unknown[] })
        .messages;
      expect(sent[sent.length - 1]).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            is_error: true,
            content: 'gate said no',
          },
        ],
      });
    });
  });

  /* -------------------------------------------------------------- state */

  describe('parseConversation (R16)', () => {
    it.each([
      ['not JSON', 'not json at all'],
      ['an empty array', '[]'],
      ['an object', '{"messages":[]}'],
      ['null', 'null'],
    ])('refuses %s rather than resuming into nonsense', (_label, state) => {
      expect(() => parseConversation(state)).toThrow(
        ServiceUnavailableException,
      );
    });

    /**
     * 🟢 The contrast worth stating: this runtime's state is the Messages API's
     * own public wire format, not an SDK-internal structure, so an upgrade
     * cannot make an old parked run unreadable the way `RunState.fromString`
     * can. R16 barely applies here — which is a property of the runtime, and
     * the reason to check that a plain array still round-trips.
     */
    it('accepts a plain conversation array', () => {
      expect(parseConversation('[{"role":"user","content":"hi"}]')).toEqual([
        { role: 'user', content: 'hi' },
      ]);
    });
  });
});
