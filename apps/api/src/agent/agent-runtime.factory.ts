import { Logger } from '@nestjs/common';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { SeamRuntimeRegistry } from '../integration/seam-runtime.registry';
import { AgentRuntimeProvider } from './agent-runtime.provider';
import { OpenAiAgentsProvider } from './openai-agents.provider';
import { ClaudeToolRunnerProvider } from './claude-tool-runner.provider';

/**
 * W46 F3 — the switch for seam ⑤ (ADR-0017 D1: one per seam; ADR-0013 C2: read
 * once at boot, a change takes effect on restart).
 *
 * Exported rather than written inline for the reason W40 gave when it pulled
 * the other two out: the one property worth testing here is the fail-safe
 * direction, and an inline factory has nowhere to test it from.
 *
 * 🔄 期二 G4 changed one thing here and nothing else: `claude-tool-runner` is
 * now BUILT, so it resolves to its own provider instead of falling back. An
 * unrecognised value — including a typo — still resolves to `openai-agents`.
 * Three alternatives were considered and rejected when this was written, and
 * they remain rejected:
 *
 *   throw at boot        — a config typo would stop the whole platform from
 *                          starting. The blast radius of a wrong agent runtime
 *                          is one feature; of a dead API, everything.
 *   return a stub that   — the same failure, just moved to whenever someone
 *   throws on first use    happens to press the button, with no signal in
 *                          between.
 *   silently substitute  — this is the one that would be dishonest, and it is
 *                          exactly what `recordChoice` below prevents: the
 *                          registry stores the runtime that IS running, so the
 *                          Integrations panel reports "configured X, running Y"
 *                          instead of claiming the switch took effect (BUG-011).
 *
 * 🔴 Selecting the Claude runtime does NOT mean it can run. It refuses to build
 * a client without `ANTHROPIC_API_KEY` (ADR-0038 D3), because OQ-7's Claude half
 * has never been answered (ADR-0037 E7). Choosing it on a deployment with no key
 * produces a 503 on first use, NOT a silent fall back to OpenAI — the platform
 * must not answer "run this on Claude" by running it somewhere else.
 */
export async function agentRuntimeProviderFactory(
  openai: OpenAiAgentsProvider,
  claude: ClaudeToolRunnerProvider,
  connectorConfig: ConnectorConfigService,
  seamRuntime: SeamRuntimeRegistry,
): Promise<AgentRuntimeProvider> {
  const logger = new Logger('AgentRuntimeFactory');
  const configured = await connectorConfig.resolve('agent', 'agentRuntime');

  const chosen: AgentRuntimeProvider =
    configured === claude.runtime ? claude : openai;

  if (configured && configured !== chosen.runtime) {
    logger.warn(
      `Agent runtime '${configured}' is not a runtime this build implements; running '${chosen.runtime}' instead`,
    );
  }

  // BUG-011 — record the EFFECTIVE runtime, never the configured string. A
  // value that was asked for but is not running must not be reported as though
  // it were.
  seamRuntime.recordChoice('agent', chosen.runtime);
  return chosen;
}
