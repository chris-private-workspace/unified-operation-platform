import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { SeamRuntimeRegistry } from '../integration/seam-runtime.registry';
import { AgentToolRegistry } from './tool-registry';
import { AgentRuntimeProvider } from './agent-runtime.provider';
import { OpenAiAgentsProvider } from './openai-agents.provider';
import { ClaudeToolRunnerProvider } from './claude-tool-runner.provider';
import { agentRuntimeProviderFactory } from './agent-runtime.factory';
import { AiAssistService } from './ai-assist.service';
import { AgentRunQueue } from './agent-run.queue';
import { AgentRunWorker } from './agent-run.worker';
import { AgentRunExpiryService } from './run-expiry.service';
import { AgentKillSwitchService } from './kill-switch.service';
import { AgentReviewStatsService } from './review-stats.service';
import { AgentRunController } from './agent-run.controller';
import { AgentKillSwitchController } from './kill-switch.controller';
import { AgentReviewStatsController } from './review-stats.controller';

/**
 * W46 / ADR-0036 — the agent module.
 *
 * 🔴 It imports no DOMAIN module, and that is the enforced half of D0: an agent
 * cannot reach AssignService, RequestService or the ledger writers, so it
 * cannot cause a side-effect that skips a gate. Everything real still runs the
 * platform's existing path, triggered by a person approving a proposal.
 *
 * ⚠️ IntegrationModule IS imported, for two services that decide nothing:
 * ConnectorConfigService (which runtime and model are configured) and
 * SeamRuntimeRegistry (recording which one actually booted). Importing that
 * module does make GraphService and the license seam injectable here — the
 * boundary spec is a static check on what these files IMPORT, and none of them
 * imports either. Which is the honest form of the rule: "nothing in this folder
 * reaches for a domain service" is checkable; "nothing is reachable" is not,
 * once anything at all is shared.
 *
 * PrismaService arrives via the @Global PrismaModule. Reading the database is
 * not the thing D0 forbids — deciding is.
 */
@Module({
  imports: [IntegrationModule],
  providers: [
    AgentToolRegistry,
    // ADR-0036 seam ⑤ — both concrete runtimes are instantiable, but consumers
    // inject the abstract class only, so nothing downstream can tell which one
    // it got (D0). 期二 G4 added the second one.
    //
    // 🔴 Instantiating ClaudeToolRunnerProvider is NOT the same as being able to
    // use it: it refuses to build a client without ANTHROPIC_API_KEY, which is
    // unset everywhere (ADR-0038 D3 — OQ-7's Claude half is unanswered).
    OpenAiAgentsProvider,
    ClaudeToolRunnerProvider,
    {
      provide: AgentRuntimeProvider,
      useFactory: agentRuntimeProviderFactory,
      inject: [
        OpenAiAgentsProvider,
        ClaudeToolRunnerProvider,
        ConnectorConfigService,
        SeamRuntimeRegistry,
      ],
    },
    /**
     * 期二 G5-B + G6 / ADR-0039 — the queue, and the worker that drains it.
     *
     * 🔴 Two providers rather than one, because they depend in opposite
     * directions: `AiAssistService` needs the QUEUE (to enqueue), and the
     * WORKER needs `AiAssistService` (to execute). Folding them together would
     * be a circular dependency needing `forwardRef`, and the split is the
     * honest shape anyway — a transport that knows nothing about runs, and a
     * worker that knows exactly one verb.
     *
     * ⚠️ Neither is exported. Nothing outside this module should be queueing
     * agent work or publishing agent events; the one legal crossing
     * (`agent-approval`) reaches `AiAssistService`, which is where the rules
     * live.
     */
    AgentRunQueue,
    AgentRunWorker,
    AiAssistService,
    // 期二 G5 / OQ-5 — the clock half of run expiry. Not exported: nothing
    // should be triggering expiry on demand. The `resumeRun` path reaches the
    // same behaviour through `AiAssistService.expireRun`, which is where the
    // row changes live.
    AgentRunExpiryService,
    // 期二 G3 — the kill switch. Exported because `agent-approval` has to ask
    // it before an approval can assign anything (G1): the branch that can cause
    // a real side-effect is the one a switch marked "off" must actually stop.
    AgentKillSwitchService,
    // 期二 G7 — R13 monitoring. A pure read-model: it writes nothing and
    // decides nothing, which is why it is not exported (nothing else should be
    // acting on these numbers — a person should).
    AgentReviewStatsService,
  ],
  controllers: [
    AgentRunController,
    AgentKillSwitchController,
    AgentReviewStatsController,
  ],
  exports: [
    AgentToolRegistry,
    AgentRuntimeProvider,
    AiAssistService,
    AgentKillSwitchService,
  ],
})
export class AgentModule {}
