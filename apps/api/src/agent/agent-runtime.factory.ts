import { Logger } from '@nestjs/common';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { SeamRuntimeRegistry } from '../integration/seam-runtime.registry';
import { AgentRuntimeProvider } from './agent-runtime.provider';
import { OpenAiAgentsProvider } from './openai-agents.provider';

/**
 * W46 F3 — the switch for seam ⑤ (ADR-0017 D1: one per seam; ADR-0013 C2: read
 * once at boot, a change takes effect on restart).
 *
 * Exported rather than written inline for the reason W40 gave when it pulled
 * the other two out: the one property worth testing here is the fail-safe
 * direction, and an inline factory has nowhere to test it from.
 *
 * 🔴 An unrecognised value resolves to `openai-agents`, and so — for now — does
 * `claude-tool-runner`, which is a real value with no implementation until 期二
 * G4. Three alternatives were considered and rejected:
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
 * So: fall back, record the truth, and say so in the log.
 */
export async function agentRuntimeProviderFactory(
  openai: OpenAiAgentsProvider,
  connectorConfig: ConnectorConfigService,
  seamRuntime: SeamRuntimeRegistry,
): Promise<AgentRuntimeProvider> {
  const logger = new Logger('AgentRuntimeFactory');
  const configured = await connectorConfig.resolve('agent', 'agentRuntime');

  if (configured && configured !== openai.runtime) {
    logger.warn(
      `Agent runtime '${configured}' is configured but not implemented in this build; running '${openai.runtime}' instead (W46 G4)`,
    );
  }

  // BUG-011 — record the EFFECTIVE runtime, never the configured string. A
  // value that was asked for but is not running must not be reported as though
  // it were.
  seamRuntime.recordChoice('agent', openai.runtime);
  return openai;
}
