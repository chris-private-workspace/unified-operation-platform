import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, auditDiff } from '../audit/audit-fields';
import { AI_ASSIST_PRINCIPAL } from './agent-run-status';

/**
 * W47 F2 / Tier 2 `T2-a` — the agent registry.
 *
 * 🔴 WHAT THIS FILE IS AND IS NOT. It manages `AgentProfile`: a model + prompt
 * combination the agent can be run under. It does NOT manage what the agent may
 * DO — the tool allow-list stays a single list in code (`tool-registry.ts`,
 * ADR-0036 D1), and what a run may SEE stays the starter's OpCo scope. Tier 2
 * `OQ-1` and `OQ-2` settled both, and this file is where that settlement is
 * easiest to erode: every future "just let this profile also…" belongs in one of
 * those two places instead.
 *
 * 🔴 `prompt` is the one column here that hands behaviour to runtime
 * configuration (W47 `R1`). Three defences, and this file owns the first:
 * every write is audited with before/after (`OQ-C`).
 */

/** Longest prompt we will store. See `R1` — a cap is what keeps this column configuration rather than content. */
export const MAX_PROMPT_LENGTH = 8000;

export interface CreateProfileInput {
  name: string;
  model: string;
  prompt?: string | null;
  principalName?: string;
}

export interface UpdateProfileInput {
  name?: string;
  model?: string;
  prompt?: string | null;
  active?: boolean;
}

/**
 * Exported so `agent-profile.controller.spec.ts` can pin the wire shape against
 * `AgentProfileDto`. Widening this select without widening the DTO makes the
 * OpenAPI document describe a response the API does not actually send — the same
 * gap BUG-011 fell through, mirrored.
 */
export const PROFILE_SELECT = {
  id: true,
  principalId: true,
  name: true,
  model: true,
  prompt: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AgentProfileSelect;

/**
 * W48 `F5-8` — just enough to CHOOSE a profile, for people who may not manage
 * them.
 *
 * 🔴 A SEPARATE constant rather than a subset picked at the call site, and
 * `prompt` is absent by construction. `G5` says no prompt leaves through a new
 * endpoint, and the way both W46 and W47 leaked a field was by widening a
 * shared select and not noticing which readers inherited it. Two selects that
 * cannot drift into each other cost one constant.
 *
 * ⚠️ `model` IS here. It is not sensitive — it is the deployment name that
 * already appears on every run — and showing it is what makes "which agent am I
 * talking to" answerable on screen, which is the whole reason `OQ-A` refused a
 * default nobody can see.
 */
export const PROFILE_OPTION_SELECT = {
  id: true,
  name: true,
  model: true,
} satisfies Prisma.AgentProfileSelect;

@Injectable()
export class AgentProfileService {
  private readonly logger = new Logger(AgentProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = false) {
    return this.prisma.agentProfile.findMany({
      where: includeInactive ? {} : { active: true },
      select: { ...PROFILE_SELECT, principal: { select: { name: true } } },
      orderBy: [{ principalId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * The profiles somebody can start a conversation on — `F5-8`.
   *
   * 🔴 ACTIVE only, with no `includeInactive` escape hatch. `list()` offers one
   * because `/agent` is the only place a retired profile can be brought back;
   * here a retired profile is not a choice, and offering it would produce a
   * refusal (`resolveForRun`) at the first turn instead of at the pick.
   */
  async listOptions() {
    return this.prisma.agentProfile.findMany({
      where: { active: true },
      select: PROFILE_OPTION_SELECT,
      orderBy: [{ principalId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(input: CreateProfileInput, actor: AppUser) {
    this.assertPrompt(input.prompt);
    const principal = await this.requirePrincipal(
      input.principalName ?? AI_ASSIST_PRINCIPAL,
    );

    const created = await this.prisma.agentProfile
      .create({
        data: {
          principalId: principal.id,
          name: input.name,
          model: input.model,
          prompt: input.prompt ?? null,
        },
        select: PROFILE_SELECT,
      })
      .catch((error: unknown) => {
        // `@@unique([principalId, name])`. Narrowed rather than caught blind:
        // any other failure is not a naming problem and must not be reported as
        // one.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            `A profile called '${input.name}' already exists for this agent`,
          );
        }
        throw error;
      });

    await this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.AGENT_PROFILE_CREATE,
      targetType: 'AgentProfile',
      targetId: created.id,
      actorId: actor.id,
      after: {
        name: created.name,
        model: created.model,
        prompt: created.prompt,
        active: created.active,
      },
    });

    return created;
  }

  /**
   * 🔴 Audited with a DIFF, not the whole row.
   *
   * `auditDiff` drops the write entirely when nothing whitelisted changed, so a
   * no-op PATCH leaves no row — the same behaviour `user.update` has. Without
   * that, the one query `R1` depends on ("show me every time somebody changed a
   * prompt") fills up with edits that changed nothing.
   */
  async update(id: string, input: UpdateProfileInput, actor: AppUser) {
    this.assertPrompt(input.prompt);

    const before = await this.prisma.agentProfile.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!before) throw new NotFoundException('Agent profile not found');

    const after = await this.prisma.agentProfile
      .update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        select: PROFILE_SELECT,
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            `A profile called '${input.name}' already exists for this agent`,
          );
        }
        throw error;
      });

    const diff = auditDiff('AgentProfile', before, after);
    if (diff) {
      if (before.prompt !== after.prompt) {
        this.logger.warn(
          `Agent profile ${id} prompt changed by ${actor.id} (W47 R1)`,
        );
      }
      await this.audit.log(this.prisma, {
        action: AUDIT_ACTIONS.AGENT_PROFILE_UPDATE,
        targetType: 'AgentProfile',
        targetId: id,
        actorId: actor.id,
        ...diff,
      });
    }

    return after;
  }

  /**
   * Which profile a run should use — F3.
   *
   * 🔴 There is deliberately NO "default profile" concept, and that is a
   * departure from what plan `F3-2` sketched (logged in the plan changelog).
   *
   * A default would have to be either a column nobody sees on screen or a rule
   * like "the oldest active one". Both mean that adding a second profile
   * silently changes nothing until the day somebody wonders why runs are still
   * on the old model — a wrong answer that looks like a working system. So:
   *
   *   - exactly one active profile → use it (today's single-profile world keeps
   *     working, and the existing AI Assist card needs no change until there IS
   *     a choice to make)
   *   - more than one and none named → **refuse, and say how many there are**
   *   - none active → refuse, because a switched-off registry must not fall back
   *     to whatever is in the environment
   */
  async resolveForRun(profileId: string | undefined, principalId: string) {
    if (profileId) {
      const chosen = await this.prisma.agentProfile.findUnique({
        where: { id: profileId },
        select: PROFILE_SELECT,
      });
      if (!chosen || chosen.principalId !== principalId) {
        throw new BadRequestException(
          'That agent profile does not exist for this agent',
        );
      }
      if (!chosen.active) {
        // Not a silent fallback: an operator who picked a profile that has since
        // been switched off should be told, not quietly given a different one.
        throw new BadRequestException(
          `The profile '${chosen.name}' is switched off, so it cannot start a run`,
        );
      }
      return chosen;
    }

    const active = await this.prisma.agentProfile.findMany({
      where: { principalId, active: true },
      select: PROFILE_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    if (active.length === 1) return active[0];
    if (active.length === 0) {
      throw new BadRequestException(
        'This agent has no active profile, so there is no model to run it on',
      );
    }
    throw new BadRequestException(
      `This agent has ${active.length} active profiles — say which one to run on`,
    );
  }

  private async requirePrincipal(name: string) {
    const principal = await this.prisma.agentPrincipal.findUnique({
      where: { name },
      select: { id: true },
    });
    if (!principal) {
      throw new NotFoundException(`Agent '${name}' does not exist`);
    }
    return principal;
  }

  /**
   * ⚠️ Enforced here as well as in the DTO, and that is not belt-and-braces for
   * its own sake: `MAX_PROMPT_LENGTH` is what keeps this column configuration
   * rather than content, and the audit whitelist entry for `prompt` was argued
   * on exactly that basis (`audit-fields.ts`). A cap that only exists at the
   * HTTP edge stops being true the first time anything else writes here.
   */
  private assertPrompt(prompt: string | null | undefined): void {
    if (typeof prompt === 'string' && prompt.length > MAX_PROMPT_LENGTH) {
      throw new BadRequestException(
        `A prompt cannot be longer than ${MAX_PROMPT_LENGTH} characters`,
      );
    }
  }
}
