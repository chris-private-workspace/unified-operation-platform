import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { SeamRuntimeRegistry } from '../integration/seam-runtime.registry';
import { AgentToolRegistry } from './tool-registry';
import { AgentRuntimeProvider } from './agent-runtime.provider';
import { OpenAiAgentsProvider } from './openai-agents.provider';
import { agentRuntimeProviderFactory } from './agent-runtime.factory';
import { AiAssistService } from './ai-assist.service';
import { AgentKillSwitchService } from './kill-switch.service';
import { AgentRunController } from './agent-run.controller';
import { AgentKillSwitchController } from './kill-switch.controller';

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
    // ADR-0036 seam ⑤ — the concrete runtime is instantiable, but consumers
    // inject the abstract class only, so nothing downstream can tell which one
    // it got (D0). The second implementation lands in 期二 G4.
    OpenAiAgentsProvider,
    {
      provide: AgentRuntimeProvider,
      useFactory: agentRuntimeProviderFactory,
      inject: [
        OpenAiAgentsProvider,
        ConnectorConfigService,
        SeamRuntimeRegistry,
      ],
    },
    AiAssistService,
    // 期二 G3 — the kill switch. Exported because `agent-approval` has to ask
    // it before an approval can assign anything (G1): the branch that can cause
    // a real side-effect is the one a switch marked "off" must actually stop.
    AgentKillSwitchService,
  ],
  controllers: [AgentRunController, AgentKillSwitchController],
  exports: [
    AgentToolRegistry,
    AgentRuntimeProvider,
    AiAssistService,
    AgentKillSwitchService,
  ],
})
export class AgentModule {}
