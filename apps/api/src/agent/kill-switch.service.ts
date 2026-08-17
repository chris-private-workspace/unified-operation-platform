import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  AI_ASSIST_PRINCIPAL,
  NON_TERMINAL_RUN_STATUSES,
} from './agent-run-status';

/**
 * 期二 G3 / plan B5 — the kill switch, and the two different questions it has to
 * keep apart.
 *
 * 🔴 THE POINT OF THIS FILE. "The switch is off" and "the agent has stopped"
 * are not the same fact, and an operator who flips the switch in an incident
 * will read the first as the second unless the platform says otherwise. That is
 * `SeamRuntimeRegistry`'s shape restated for a different pair: there, saved
 * config versus what the process actually booted; here, the switch versus what
 * is still in flight.
 *
 * Concretely: turning the agent off refuses new runs, refuses resumes and
 * refuses approvals — but it does not delete the runs already parked at
 * `awaiting_approval`, each of which may be holding a proposal that would
 * assign a real licence (期二 G1). Those runs are inert while the switch is off
 * and live again the moment it goes back on. So the status below reports the
 * residue, and `settled` is false until there is none.
 *
 * 🔴 The switch is `AgentPrincipal.active` — the actor's own flag, already in
 * plan §4 and already honoured by `startRun`. It is deliberately NOT a second
 * `ConnectorConfig` column: two places that can turn the agent off is two
 * answers to "is it on", and this project has spent enough sessions on that
 * exact shape (BUG-005, BUG-011).
 */

export interface AgentKillSwitchStatus {
  principal: string;
  /** 配置:the switch itself. `AgentPrincipal.active`. */
  enabled: boolean;
  /** 真相:agent-originated work that has not finished. */
  liveRuns: number;
  pendingProposals: number;
  /**
   * 🔴 Off AND nothing left in flight.
   *
   * Reported separately from `enabled` because it is the question an operator
   * actually has after flipping the switch, and the answer is not always yes.
   */
  settled: boolean;
  /** Null until the principal has been created by its first run. */
  updatedAt: Date | null;
}

@Injectable()
export class AgentKillSwitchService {
  private readonly logger = new Logger(AgentKillSwitchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Both halves, in one read.
   *
   * ⚠️ A principal row that does not exist yet reports `enabled: true`, and
   * that is the honest answer rather than a convenient one: the row is created
   * by the first run (`startRun` upserts it), so "no row" means "never used",
   * not "switched off". Reporting `false` there would tell an operator the
   * agent is stopped when in fact the next person to press the button starts it.
   */
  async status(): Promise<AgentKillSwitchStatus> {
    const [principal, liveRuns, pendingProposals] = await Promise.all([
      this.prisma.agentPrincipal.findUnique({
        where: { name: AI_ASSIST_PRINCIPAL },
        select: { active: true, createdAt: true },
      }),
      this.prisma.agentRun.count({
        where: { status: { in: [...NON_TERMINAL_RUN_STATUSES] } },
      }),
      this.prisma.agentProposal.count({ where: { status: 'pending' } }),
    ]);

    const enabled = principal?.active ?? true;
    return {
      principal: AI_ASSIST_PRINCIPAL,
      enabled,
      liveRuns,
      pendingProposals,
      settled: !enabled && liveRuns === 0 && pendingProposals === 0,
      updatedAt: principal?.createdAt ?? null,
    };
  }

  /**
   * Flip it.
   *
   * The principal row is created if it does not exist, so an admin can switch
   * the agent off BEFORE anyone has ever run it — which is the one moment a
   * kill switch that only worked after first use would be least helpful.
   *
   * 🔴 Audited, and the audit runs AFTER the write rather than inside a
   * transaction with it, following `outbound-retry.service.ts:398-401`: a
   * switch that really was flipped must not be un-flipped by an audit hiccup.
   * The opposite ordering is right at run START, where nothing irreversible
   * precedes it (`ai-assist.service.ts`) — the difference is which failure you
   * would rather have.
   */
  async set(
    enabled: boolean,
    actor: AppUser,
    reason?: string,
  ): Promise<AgentKillSwitchStatus> {
    const before = await this.prisma.agentPrincipal.findUnique({
      where: { name: AI_ASSIST_PRINCIPAL },
      select: { id: true, active: true },
    });

    const principal = await this.prisma.agentPrincipal.upsert({
      where: { name: AI_ASSIST_PRINCIPAL },
      update: { active: enabled },
      create: {
        name: AI_ASSIST_PRINCIPAL,
        // ⚠️ Only reached when no run has ever been started, so there is no
        // booted provider to read the truth off. Recorded as unknown rather
        // than guessed: `startRun` overwrites it with the runtime that is
        // actually running (BUG-011), and a plausible-looking guess here would
        // survive until then looking like a fact.
        runtime: 'unknown',
        active: enabled,
      },
      select: { id: true, active: true, createdAt: true },
    });

    this.logger.warn(
      `AI-Assist agent ${enabled ? 'ENABLED' : 'DISABLED'} by ${actor.id}`,
    );

    await this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.AGENT_KILL_SWITCH_SET,
      targetType: 'AgentPrincipal',
      targetId: principal.id,
      actorId: actor.id,
      // `active` is a boolean — the audited change itself, and the opposite of
      // the free-text transcript D5 keeps out of this table. `before` is null
      // on the very first flip because there was nothing to change.
      before: before ? { active: before.active } : undefined,
      after: { active: principal.active },
      ...(reason ? { metadata: { reason } } : {}),
    });

    return this.status();
  }

  /**
   * The gate itself.
   *
   * 🔴 Called from three places, and the list of three is the whole design:
   * starting a run, resuming one, and APPROVING a proposal. The third is the
   * one that is easy to leave out and the only one that can assign a licence
   * (期二 G1) — a kill switch that stopped new runs while an approval could
   * still push a real assignment through would be off in the reassuring sense
   * and on in the sense that matters.
   *
   * 🔴 And note where it is NOT called: rejecting a proposal. Killing the agent
   * has to stop it CAUSING things, not stop people cleaning up after it —
   * blocking rejection would strand every pending proposal until the switch
   * went back on, which is the opposite of what an operator flipped it for.
   */
  async assertEnabled(): Promise<void> {
    const principal = await this.prisma.agentPrincipal.findUnique({
      where: { name: AI_ASSIST_PRINCIPAL },
      select: { active: true },
    });
    if (principal && !principal.active) {
      throw new ConflictException(
        'The AI-Assist agent is switched off. An admin can turn it back on under Settings, and nothing agent-originated will run until they do.',
      );
    }
  }
}
