import { Module } from '@nestjs/common';
import { AgentToolRegistry } from './tool-registry';

/**
 * W46 / ADR-0036 — the agent module.
 *
 * 🔴 It imports no domain module, and that is the enforced half of D0: an agent
 * cannot reach AssignService, RequestService or the ledger writers, so it
 * cannot cause a side-effect that skips a gate. Everything real still runs the
 * platform's existing path, triggered by a person approving a proposal.
 *
 * PrismaService arrives via the @Global PrismaModule. Reading the database is
 * not the thing D0 forbids — deciding is.
 */
@Module({
  providers: [AgentToolRegistry],
  exports: [AgentToolRegistry],
})
export class AgentModule {}
