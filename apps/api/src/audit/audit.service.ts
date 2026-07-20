import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  auditDiff,
  pickAuditFields,
  pickAuditMetadata,
  type AuditAction,
  type AuditTargetType,
} from './audit-fields';

/**
 * The Prisma client handle available inside an interactive `$transaction`.
 * Audit writes take one because ADR-0009 Decision 8.1 requires the audit row
 * and the operation it describes to succeed or fail together: "done but
 * unrecorded" is the outcome this whole phase exists to prevent.
 */
export type AuditTx = Prisma.TransactionClient;

export interface AuditEntryInput {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  /** null for system / cron / m2m callers. */
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'm2m';
  /** Raw entities — this service whitelists them, callers must not pre-filter. */
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

/**
 * Writes the platform audit trail (ADR-0009).
 *
 * Callers pass RAW entities. Whitelisting happens here, once, so no call site
 * can accidentally opt out of the H4 boundary by hand-building a payload.
 */
@Injectable()
export class AuditService {
  /** Record an event. `before`/`after`/`metadata` are whitelisted here. */
  async log(tx: AuditTx, entry: AuditEntryInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        actorId: entry.actorId ?? null,
        actorType: entry.actorType ?? 'user',
        before: toJson(pickAuditFields(entry.targetType, entry.before)),
        after: toJson(pickAuditFields(entry.targetType, entry.after)),
        metadata: toJson(pickAuditMetadata(entry.metadata)),
      },
    });
  }

  /**
   * Record an UPDATE, storing only the fields that actually changed.
   * Returns false (and writes nothing) on a no-op — a PATCH that changes
   * nothing should not leave an audit row suggesting it did.
   */
  async logChange(
    tx: AuditTx,
    entry: AuditEntryInput & { before: unknown; after: unknown },
  ): Promise<boolean> {
    const diff = auditDiff(entry.targetType, entry.before, entry.after);
    if (!diff) return false;

    await tx.auditLog.create({
      data: {
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        actorId: entry.actorId ?? null,
        actorType: entry.actorType ?? 'user',
        before: toJson(diff.before),
        after: toJson(diff.after),
        metadata: toJson(pickAuditMetadata(entry.metadata)),
      },
    });
    return true;
  }
}

/** undefined → leave the column NULL rather than storing an empty object. */
function toJson(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
