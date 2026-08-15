import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { FulfilmentModule } from '../fulfilment/fulfilment.module';
import { AgentApprovalService } from './agent-approval.service';
import { AgentApprovalController } from './agent-approval.controller';

/**
 * W46 F6 — where a human decision on an agent proposal is carried out.
 *
 * 🔴 A separate module on purpose (Chris 2026-08-15, H1). Approval touches the
 * domain (create the line items) and the agent (resume the run), and ADR-0036
 * D0 forbids `agent` from importing any domain service. Two other placements
 * were considered and rejected:
 *
 *   inside `agent`      — would need a domain service, which is exactly the
 *                         import D0 rules out. D0 is ADR-0017's fifth
 *                         application and the ADR says it is not softened.
 *   inside `fulfilment` — the direction of the dependency would be legal, but
 *                         licence fulfilment would become responsible for
 *                         knowing when an agent run resumes. It is already the
 *                         largest module in the codebase.
 *
 * ⇒ this module imports BOTH, and the arrow still never points from `agent` to
 * the domain. It also holds no gate of its own: every check that mattered
 * before an approval existed still runs inside `RequestService.addLineItem`.
 */
@Module({
  imports: [AgentModule, FulfilmentModule],
  providers: [AgentApprovalService],
  controllers: [AgentApprovalController],
  exports: [AgentApprovalService],
})
export class AgentApprovalModule {}
