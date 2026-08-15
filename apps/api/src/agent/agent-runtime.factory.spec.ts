import { agentRuntimeProviderFactory } from './agent-runtime.factory';
import type { OpenAiAgentsProvider } from './openai-agents.provider';
import type { ConnectorConfigService } from '../integration/connector-config.service';
import type { SeamRuntimeRegistry } from '../integration/seam-runtime.registry';

/**
 * W46 F3 — seam ⑤'s switch.
 *
 * The property worth testing is the same one W40 pulled the other two factories
 * out of the module for: the FAIL-SAFE DIRECTION, plus the thing BUG-011 added
 * — that what gets recorded is the runtime actually running, never the one that
 * was merely asked for.
 */
describe('agentRuntimeProviderFactory', () => {
  const openai = { runtime: 'openai-agents' } as OpenAiAgentsProvider;
  let connectorConfig: { resolve: jest.Mock };
  let seamRuntime: { recordChoice: jest.Mock };

  const build = () =>
    agentRuntimeProviderFactory(
      openai,
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
   * 'claude-tool-runner' is a REAL value with no implementation until 期二 G4.
   * Falling back keeps a config typo from stopping the whole platform booting —
   * the blast radius of a wrong agent runtime is one feature, of a dead API it
   * is everything.
   */
  it('falls back rather than refusing to boot when an unbuilt runtime is configured', async () => {
    connectorConfig.resolve.mockResolvedValue('claude-tool-runner');
    await expect(build()).resolves.toBe(openai);
  });

  /**
   * 🔴 BUG-011 — the fallback is only acceptable BECAUSE this is recorded. The
   * Integrations panel has to be able to say "configured claude-tool-runner,
   * running openai-agents"; recording the configured string instead would turn
   * a silent substitution into a claim that the switch took effect.
   */
  it('records the runtime that is actually running, not the one configured', async () => {
    connectorConfig.resolve.mockResolvedValue('claude-tool-runner');
    await build();

    expect(seamRuntime.recordChoice).toHaveBeenCalledWith(
      'agent',
      'openai-agents',
    );
    expect(seamRuntime.recordChoice).not.toHaveBeenCalledWith(
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
