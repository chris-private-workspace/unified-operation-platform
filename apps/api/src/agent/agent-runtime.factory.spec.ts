import { agentRuntimeProviderFactory } from './agent-runtime.factory';
import type { OpenAiAgentsProvider } from './openai-agents.provider';
import type { ClaudeToolRunnerProvider } from './claude-tool-runner.provider';
import type { ConnectorConfigService } from '../integration/connector-config.service';
import type { SeamRuntimeRegistry } from '../integration/seam-runtime.registry';

/**
 * W46 F3 — seam ⑤'s switch.
 *
 * The property worth testing is the same one W40 pulled the other two factories
 * out of the module for: the FAIL-SAFE DIRECTION, plus the thing BUG-011 added
 * — that what gets recorded is the runtime actually running, never the one that
 * was merely asked for.
 *
 * 🔄 期二 G4 flipped ONE of these cases and left the rest alone: since
 * `claude-tool-runner` is now built, it resolves to its own provider instead of
 * falling back. The two tests that asserted the fall back were not deleted —
 * they were rewritten to assert the new answer, and the fall-back property they
 * were protecting is still covered by the typo case, which is where it always
 * mattered.
 */
describe('agentRuntimeProviderFactory', () => {
  const openai = { runtime: 'openai-agents' } as OpenAiAgentsProvider;
  const claude = { runtime: 'claude-tool-runner' } as ClaudeToolRunnerProvider;
  let connectorConfig: { resolve: jest.Mock };
  let seamRuntime: { recordChoice: jest.Mock };

  const build = () =>
    agentRuntimeProviderFactory(
      openai,
      claude,
      connectorConfig as unknown as ConnectorConfigService,
      seamRuntime as unknown as SeamRuntimeRegistry,
    );

  beforeEach(() => {
    connectorConfig = { resolve: jest.fn() };
    seamRuntime = { recordChoice: jest.fn() };
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['a typo', 'openai-agent'],
    ['the default spelled out', 'openai-agents'],
  ])('resolves to the OpenAI runtime when the config is %s', async (_l, v) => {
    connectorConfig.resolve.mockResolvedValue(v);
    await expect(build()).resolves.toBe(openai);
  });

  /**
   * 🔄 期二 G4 — 'claude-tool-runner' is now BUILT, so the answer changed.
   *
   * 🔴 The point of asserting it: a build that quietly kept falling back would
   * be answering "run this on Claude" by running it on OpenAI — the dishonest
   * substitution the factory's own comment rejects. Selecting it is still not
   * permission to run: the provider refuses without ANTHROPIC_API_KEY
   * (ADR-0038 D3), which is a 503 on first use rather than a different runtime.
   */
  it('resolves to the Claude runtime now that it is implemented', async () => {
    connectorConfig.resolve.mockResolvedValue('claude-tool-runner');
    await expect(build()).resolves.toBe(claude);
  });

  /**
   * 🔴 BUG-011 — what gets recorded is what is RUNNING.
   *
   * Kept pointed at the fall-back case (a typo), because that is where the two
   * values differ and so the only place this assertion can fail. With the Claude
   * runtime now built, asserting it there would compare 'claude-tool-runner'
   * with 'claude-tool-runner' — green whichever string the factory recorded.
   */
  it('records the runtime that is actually running, not the one configured', async () => {
    connectorConfig.resolve.mockResolvedValue('claude-tool-runnr');
    await build();

    expect(seamRuntime.recordChoice).toHaveBeenCalledWith(
      'agent',
      'openai-agents',
    );
    expect(seamRuntime.recordChoice).not.toHaveBeenCalledWith(
      'agent',
      'claude-tool-runnr',
    );
  });

  /**
   * 🔴 And the Claude side of the same rule: when it IS running, that is what
   * gets recorded. Without this, the pair above would be satisfied by a factory
   * that recorded 'openai-agents' unconditionally.
   */
  it('records the Claude runtime when the Claude runtime is what booted', async () => {
    connectorConfig.resolve.mockResolvedValue('claude-tool-runner');
    await build();

    expect(seamRuntime.recordChoice).toHaveBeenCalledWith(
      'agent',
      'claude-tool-runner',
    );
  });

  it('reads its switch from the agent connector (ADR-0013 C2: once, at boot)', async () => {
    connectorConfig.resolve.mockResolvedValue(undefined);
    await build();
    expect(connectorConfig.resolve).toHaveBeenCalledWith(
      'agent',
      'agentRuntime',
    );
  });
});
