import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  failureErrorText,
  OUTBOUND_FAILURE_STATUS,
  pickFailureExternalRef,
  pickFailurePayload,
  type OutboundFailureKind,
  type OutboundFailureStatus,
} from './outbound-failure-fields';

export interface RecordFailureInput {
  kind: OutboundFailureKind;
  /** RAW inputs — this service whitelists them, callers must not pre-filter. */
  payload: unknown;
  /** RAW side-effects that already happened (mirror: the SN sysIds). */
  externalRef?: unknown;
  /** The original error. Only its message text is persisted (D5). */
  error: unknown;
  requestId?: string | null;
}

/**
 * The outbound failure queue (ADR-0011).
 *
 * Two design rules are enforced HERE rather than left to call sites:
 *
 * 1. **No transaction handle.** Unlike AuditService.log(tx, …), `record()` takes
 *    no `tx` — deliberately (Decision 6). `request.mirror`'s failure IS a failed
 *    local write; joining that transaction would roll the record away at exactly
 *    the moment it is needed. Not accepting a handle makes the mistake
 *    unrepresentable instead of merely discouraged.
 *
 * 2. **Recording never becomes the failure.** `record()` swallows its own
 *    errors. It runs inside a catch block that is already handling a real
 *    problem; throwing from here would replace a meaningful "ServiceNow is
 *    unavailable" with a confusing database error. If even this write fails, the
 *    log is the floor — the honest ceiling of the whole approach (Decision 6).
 */
@Injectable()
export class OutboundFailureService {
  private readonly logger = new Logger(OutboundFailureService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Record a failure. Whitelisting happens here, once. Never throws. */
  async record(input: RecordFailureInput): Promise<void> {
    const message = failureErrorText(input.error);
    try {
      await this.prisma.outboundFailure.create({
        data: {
          kind: input.kind,
          status: OUTBOUND_FAILURE_STATUS.OPEN,
          payload: pickFailurePayload(
            input.kind,
            input.payload,
          ) as Prisma.InputJsonValue,
          externalRef: pickFailureExternalRef(input.kind, input.externalRef) as
            | Prisma.InputJsonValue
            | undefined,
          lastError: message,
          requestId: input.requestId ?? null,
        },
      });
    } catch (err) {
      // H4: the failure payload may carry a UPN — log the kind and the
      // recording error only, never the payload itself.
      this.logger.error(
        `Could not record ${input.kind} failure (original error: ${message}): ${
          (err as Error)?.message
        }`,
      );
    }
  }

  /** Newest first. Filters are ANDed. */
  async list(filters: {
    status?: OutboundFailureStatus;
    kind?: OutboundFailureKind;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.OutboundFailureWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.kind && { kind: filters.kind }),
    };

    const [total, entries] = await Promise.all([
      this.prisma.outboundFailure.count({ where }),
      this.prisma.outboundFailure.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
    ]);
    return { total, limit: filters.limit, offset: filters.offset, entries };
  }

  findById(id: string) {
    return this.prisma.outboundFailure.findUnique({ where: { id } });
  }

  /** A repair succeeded. */
  markResolved(id: string, actorId: string) {
    return this.prisma.outboundFailure.update({
      where: { id },
      data: {
        status: OUTBOUND_FAILURE_STATUS.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: actorId,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  /**
   * A repair was attempted and failed again (I2). The row stays `open` and the
   * attempt count climbs — "tried 6 times and still failing" is exactly the fact
   * ADR-0010 D8 wanted visible, so it must not be flattened into a retry that
   * looks like it worked.
   */
  markAttemptFailed(id: string, error: unknown) {
    return this.prisma.outboundFailure.update({
      where: { id },
      data: {
        lastError: failureErrorText(error),
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  /**
   * An operator judged that no repair is needed. Reversible (I3): the judgement
   * can be wrong, and both directions are audited anyway (Decision 8).
   */
  markAbandoned(id: string, actorId: string) {
    return this.prisma.outboundFailure.update({
      where: { id },
      data: {
        status: OUTBOUND_FAILURE_STATUS.ABANDONED,
        resolvedAt: new Date(),
        resolvedById: actorId,
      },
    });
  }

  /** Undo an abandon — back into the queue (I3). */
  reopen(id: string) {
    return this.prisma.outboundFailure.update({
      where: { id },
      data: {
        status: OUTBOUND_FAILURE_STATUS.OPEN,
        resolvedAt: null,
        resolvedById: null,
      },
    });
  }
}
