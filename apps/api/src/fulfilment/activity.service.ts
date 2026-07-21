import { Injectable } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopeWhere } from '../auth/opco-scope';
import { ActivityEventDto } from './dto/activity-query.dto';

/**
 * Operational activity feed (CH-006) — the newest RequestEvents ACROSS requests.
 *
 * RequestEvent already had a read path, but only nested inside a single request
 * (GET /fulfilment/requests/:id). This is the cross-request timeline, which the
 * composite index [requestId, createdAt] cannot serve; CH-006 adds a plain
 * [createdAt] index for exactly this query.
 *
 * Read-only: nothing here writes, so no critical path (assign / ledger / stage)
 * changes behaviour.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async recent(actor: AppUser, limit: number): Promise<ActivityEventDto[]> {
    const rows = await this.prisma.requestEvent.findMany({
      where: this.where(actor),
      orderBy: { createdAt: 'desc' },
      take: limit,
      // `select`, not `include`: the response whitelist is enforced by the query
      // itself, so a future column on Request cannot start riding along (H4).
      select: {
        id: true,
        type: true,
        fromStage: true,
        toStage: true,
        message: true,
        createdAt: true,
        requestId: true,
        actor: { select: { displayName: true } },
        request: { select: { serviceNowNumber: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      fromStage: row.fromStage,
      toStage: row.toStage,
      message: row.message,
      createdAt: row.createdAt,
      actorName: row.actor?.displayName ?? null,
      requestId: row.requestId,
      // Requests created on the platform have no SN number until submission
      // succeeds, and an id tail still lets an operator match the row to a page.
      requestRef: row.request.serviceNowNumber ?? row.requestId.slice(-6),
    }));
  }

  /**
   * AUTH-3a scope, nested one level: the OpCo lives on Request, not on the event.
   *
   * The unscoped case returns `{}` rather than `{ request: {} }` — an empty
   * relation filter still forces a join, which would throw away the whole point
   * of the [createdAt] index for the ADMIN / REGIONAL path. RequestEvent
   * deliberately carries no opcoId of its own (same trade-off as ADR-0011 D1).
   */
  private where(actor: AppUser) {
    const scope = scopeWhere(actor);
    return scope.opcoId ? { request: { opcoId: scope.opcoId } } : {};
  }
}
