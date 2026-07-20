import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AppUser, Opco } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  AdminUserDto,
  CreateUserDto,
  UpdateUserDto,
} from './dto/user-admin.dto';
import { ResetPasswordDto } from './dto/password.dto';
import { validatePassword } from './password-policy';

// Prisma row shape with the opcoScope relation we select for the console.
type UserWithScope = AppUser & {
  opcoScope: Pick<Opco, 'code' | 'displayName'> | null;
};
const SCOPE_INCLUDE = {
  opcoScope: { select: { code: true, displayName: true } },
} as const;

/**
 * Local user administration (ADR-0005 §6 / AUTH-4b). Admin-only (guarded at the
 * controller). Creates local-provider accounts (argon2 hash) and edits role /
 * OpCo scope / active for BOTH providers. H4: passwordHash is never serialised
 * (toAdminUser strips it) and passwords / hashes are never logged. Deactivation
 * (active=false) replaces deletion — AppUser is referenced by requests / events,
 * and we never hard-delete (D-c).
 */
@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** All users, active first — for the Users & roles table. */
  async list(): Promise<AdminUserDto[]> {
    const users = await this.prisma.appUser.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: SCOPE_INCLUDE,
    });
    return users.map(toAdminUser);
  }

  async create(actor: AppUser, dto: CreateUserDto): Promise<AdminUserDto> {
    const opcoScopeId = await this.normaliseScope(dto.role, dto.opcoScopeId);

    const clash = await this.prisma.appUser.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException('A user with this email already exists');

    // Strict policy applies to the admin-set initial password too (ADR-0006 §1).
    const violation = validatePassword(dto.initialPassword, {
      email: dto.email,
    });
    if (violation) throw new BadRequestException(violation);

    const passwordHash = await argon2.hash(dto.initialPassword);

    // ADR-0009 Decision 8.1: the audit row shares the operation's transaction —
    // a user that exists without a creation record is exactly what this phase
    // is here to prevent.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appUser.create({
        data: {
          email: dto.email,
          displayName: dto.displayName,
          role: dto.role,
          opcoScopeId,
          passwordHash,
          authProvider: 'local',
          // Force the user to replace the admin-set password on first login.
          mustChangePassword: true,
        },
        include: SCOPE_INCLUDE,
      });
      // The raw row goes in — AuditService whitelists it (passwordHash is on
      // this object and must never reach the audit table).
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.USER_CREATE,
        targetType: 'AppUser',
        targetId: created.id,
        actorId: actor.id,
        after: created,
      });
      return created;
    });
    // H4: log ids + role only — never email (PII) / password / hash.
    this.logger.log(
      `Local user created: id=${user.id} role=${user.role} by=${actor.id}`,
    );
    return toAdminUser(user);
  }

  async update(
    actor: AppUser,
    id: string,
    dto: UpdateUserDto,
  ): Promise<AdminUserDto> {
    const target = await this.prisma.appUser.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const nextRole = dto.role ?? target.role;
    const nextActive = dto.active ?? target.active;

    // D-e safety: never lock everyone out. Block removing the last active ADMIN
    // (by demotion or deactivation), and block deactivating your own account.
    const losingAdmin =
      target.role === Role.ADMIN &&
      target.active &&
      (nextRole !== Role.ADMIN || nextActive === false);
    if (losingAdmin) {
      const otherAdmins = await this.prisma.appUser.count({
        where: { role: Role.ADMIN, active: true, id: { not: id } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException(
          'Cannot demote or deactivate the last active admin',
        );
      }
    }
    if (id === actor.id && nextActive === false) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    // Recompute scope whenever role or scope is touched, so role↔scope stays
    // consistent (clears a stale scope on demotion, requires one on promotion).
    const rawScope =
      dto.opcoScopeId !== undefined ? dto.opcoScopeId : target.opcoScopeId;
    const opcoScopeId = await this.normaliseScope(nextRole, rawScope);

    /**
     * One audit row per update, labelled by the most consequential thing that
     * changed. A privilege change wins over a deactivation so that searching
     * `action = user.role_change` returns EVERY privilege change — including a
     * demote-and-deactivate done in one call. The full before/after diff is
     * stored either way, so nothing is lost by the labelling.
     */
    const privilegeChanged =
      nextRole !== target.role || opcoScopeId !== target.opcoScopeId;
    const deactivating = target.active && nextActive === false;
    const action = privilegeChanged
      ? AUDIT_ACTIONS.USER_ROLE_CHANGE
      : deactivating
        ? AUDIT_ACTIONS.USER_DEACTIVATE
        : AUDIT_ACTIONS.USER_UPDATE;

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appUser.update({
        where: { id },
        data: { role: nextRole, active: nextActive, opcoScopeId },
        include: SCOPE_INCLUDE,
      });
      // logChange writes only the fields that moved, and nothing at all on a
      // no-op PATCH — an audit row claiming a change that never happened is
      // its own kind of lie.
      await this.audit.logChange(tx, {
        action,
        targetType: 'AppUser',
        targetId: id,
        actorId: actor.id,
        before: target,
        after: updated,
      });
      return updated;
    });
    this.logger.log(
      `User updated: id=${user.id} role=${user.role} active=${user.active} by=${actor.id}`,
    );
    return toAdminUser(user);
  }

  /**
   * Admin resets a local account's password (AUTH-4c-A). Admin-typed (no
   * current-password check) + strict policy; sets mustChangePassword so the user
   * must replace the admin-set password on next login. Local accounts only.
   */
  async resetPassword(
    actor: AppUser,
    id: string,
    dto: ResetPasswordDto,
  ): Promise<void> {
    const target = await this.prisma.appUser.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.authProvider !== 'local') {
      throw new BadRequestException(
        'Only local accounts have a password to reset',
      );
    }

    const violation = validatePassword(dto.newPassword, {
      email: target.email,
    });
    if (violation) throw new BadRequestException(violation);

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
      });
      // Event only — no before/after. The only thing that changed is the hash
      // and its lifecycle flags; storing them would be either useless or a leak.
      // "who reset whose password, when" is the whole auditable fact here.
      await this.audit.log(tx, {
        action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
        targetType: 'AppUser',
        targetId: id,
        actorId: actor.id,
      });
    });
    // H4: log ids only — never the new password / hash.
    this.logger.log(`Password reset by admin: userId=${id} by=${actor.id}`);
  }

  /**
   * Enforce role↔scope consistency and verify the OpCo exists.
   * OPCO_IT → a scope is required; ADMIN / REGIONAL → forced null (they see all).
   */
  private async normaliseScope(
    role: Role,
    opcoScopeId?: string | null,
  ): Promise<string | null> {
    if (role !== Role.OPCO_IT) return null;
    if (!opcoScopeId) {
      throw new BadRequestException('OPCO_IT requires an OpCo scope');
    }
    const opco = await this.prisma.opco.findFirst({
      where: { id: opcoScopeId, active: true },
      select: { id: true },
    });
    if (!opco) throw new BadRequestException('OpCo scope not found');
    return opcoScopeId;
  }
}

/** Map a Prisma AppUser (+opcoScope) to the wire shape, dropping passwordHash (H4). */
function toAdminUser(user: UserWithScope): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    opcoScopeId: user.opcoScopeId,
    opcoScope: user.opcoScope,
    authProvider: user.authProvider,
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
  };
}
