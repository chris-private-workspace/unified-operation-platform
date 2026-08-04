import { EventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CH-015 — the single write that opens the Phase 1 sync gate on evidence.
 *
 * Lifted out of SyncSweepService when the on-demand check (CH-015) landed. It is
 * shared rather than duplicated for one reason: ADR-0015 D1 made `azureSyncedAt`
 * mean "the platform has seen this UPN in Graph", and two copies of that write
 * would be two places for the meaning to drift. The caller only chooses the
 * timeline message — never the shape of the write.
 *
 * 🔴 The caller must have already confirmed the user exists in Graph. This
 * function is the recording of that fact, not the checking of it.
 */
/**
 * ADR-0025 D4 — the gate ② counterpart: record that ServiceNow now knows the
 * target user, and keep the sys_id that proves it.
 *
 * Deliberately in the same file as `openSyncGate`. The two gates are easy to
 * confuse precisely because they look alike, and having both writes side by side
 * makes the difference visible when either is edited: gate ① records what GRAPH
 * saw and opens assignment; gate ② records what SERVICENOW has and is what makes
 * the licence request operable.
 *
 * 🔴 The caller must have already found the user. This records the fact.
 */
export function openServiceNowUserGate(
  prisma: PrismaService,
  requestId: string,
  userSysId: string,
  message: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: requestId },
      data: {
        serviceNowUserSyncedAt: new Date(),
        serviceNowUserSysId: userSysId,
      },
    });
    await tx.requestEvent.create({
      data: { requestId, type: EventType.SYNC, message },
    });
  });
}

export function openSyncGate(
  prisma: PrismaService,
  request: { id: string; accountCreatedAt: Date | null },
  message: string,
) {
  const now = new Date();
  // Kept atomic so a request can never end up past the gate with no timeline
  // entry explaining why.
  return prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: request.id },
      data: {
        azureSyncedAt: now,
        // `??` not `=`: if the account creation time is already known, this must
        // not overwrite it with "whenever we happened to notice" — that would
        // destroy the one figure showing how long Entra Connect actually took.
        accountCreatedAt: request.accountCreatedAt ?? now,
      },
    });
    await tx.requestEvent.create({
      data: { requestId: request.id, type: EventType.SYNC, message },
    });
  });
}
