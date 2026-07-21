import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  auditDiff,
  pickAuditFields,
  pickAuditMetadata,
  type AuditAction,
  type AuditTargetType,
} from './audit-fields';
import {
  AUDIT_PAGE_MAX,
  AuditPageDto,
  AuditQueryDto,
} from './dto/audit-query.dto';

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
  /**
   * Write methods take the caller's transaction handle (Decision 8.1); this
   * injected client exists ONLY for the read path (`find`), which has no
   * enclosing transaction to join.
   */
  constructor(private readonly prisma: PrismaService) {}

  /** Record an event. `before`/`after`/`metadata` are whitelisted here. */
  async log(tx: AuditTx, entry: AuditEntryInput): Promise<void> {
    await tx.auditLog.create(this.buildLogArgs(entry));
  }

  /**
   * Query the trail (W29 F3). Filters are ANDed; newest first. The page cap is
   * re-clamped here as defence in depth — the DTO already rejects limit > 100,
   * but an internal caller bypassing the pipe must not widen the window.
   */
  async find(query: AuditQueryDto): Promise<AuditPageDto> {
    const limit = Math.min(query.limit ?? 50, AUDIT_PAGE_MAX);
    const offset = query.offset ?? 0;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.targetType && { targetType: query.targetType }),
      ...(query.targetId && { targetId: query.targetId }),
      ...(query.action && { action: query.action }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        // display join only — email/displayName are P-B-sanctioned on this
        // ADMIN-only surface (ADR-0009 Decision 7).
        include: {
          actor: { select: { email: true, displayName: true } },
        },
      }),
    ]);

    return { total, limit, offset, entries: rows };
  }

  /**
   * The same whitelisted payload, built but NOT executed — for callers that use
   * the array form of `$transaction` (allocation import batches its upserts
   * that way). Rewriting those as an interactive transaction would change their
   * batching semantics for no gain; this keeps the audit row in the SAME
   * transaction while whitelisting still happens here, not at the call site.
   */
  buildLogArgs(entry: AuditEntryInput): Prisma.AuditLogCreateArgs {
    return {
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
    };
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
