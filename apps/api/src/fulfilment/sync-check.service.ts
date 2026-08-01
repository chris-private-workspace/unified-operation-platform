import { Injectable, Logger } from '@nestjs/common';
import { type AppUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { graphUnavailable } from '../integration/graph/graph-unavailable';
import { RequestService } from './request.service';
import { openSyncGate } from './open-sync-gate';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';
import { SYNC_CHECK_STATUS, SyncCheckResultDto } from './dto/sync-check.dto';

/**
 * CH-015 — the on-demand half of the Phase 1 sync gate.
 *
 * Before this, the only path that actually ASKED Graph whether the account had
 * synced was the ten-minute cron (ADR-0015). An operator staring at a stalled
 * onboarding had exactly two options: wait for a sweep they cannot see, or press
 * "Mark synced" — which writes the gate open without asking anyone. The sweep's
 * 30-day cutoff made that worse: past the cutoff, the assertion was the ONLY
 * remaining path through a gate that ADR-0015 D1 had just upgraded to mean
 * "the platform has seen this UPN in Graph".
 *
 * This service is that same question, asked on demand. It does not weaken the
 * gate — the write it performs is byte-for-byte the sweep's (openSyncGate), and
 * assign.service still re-verifies before it spends a seat.
 *
 * 🔴 It injects GraphService DIRECTLY and must never be moved onto
 * LicenseOperationsProvider. ADR-0017 D0: verifying the gate through n8n would
 * mean n8n telling the platform "it synced" — which is precisely the claim
 * ADR-0015 exists to stop trusting. Guarded by a boundary test.
 */
@Injectable()
export class SyncCheckService {
  private readonly logger = new Logger(SyncCheckService.name);

  /**
   * Per-request cooldown, in memory on purpose (spec §2.2 / R1).
   *
   * Storing this in Postgres would mean a schema change — an H1 trigger — to
   * hold a value whose entire job is to absorb a double-click. It does not
   * survive a restart and does not span instances; neither matters, because the
   * thing standing between a wrong click and a wrongly assigned seat is the
   * assign gate, not this map.
   */
  private readonly lastCheckedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
    private readonly requests: RequestService,
  ) {}

  /**
   * Ask Graph whether this request's target account exists yet.
   * Opens the gate on a hit; writes NOTHING on a miss, a throttle, or a failure.
   */
  async check(requestId: string, actor: AppUser): Promise<SyncCheckResultDto> {
    // Does the 404 and the AUTH-3a cross-OpCo 403 for us, and returns the same
    // shape GET :id does — so the caller can swap its cached copy wholesale.
    const request = await this.requests.getRequestDetail(requestId, actor);

    // Already through the gate. Not an error and not worth a vendor call: the
    // answer cannot change back, and re-writing azureSyncedAt would move a
    // timestamp that is now operational history.
    if (request.azureSyncedAt) {
      return { status: SYNC_CHECK_STATUS.FOUND, retryAfterSeconds: 0, request };
    }

    const remaining = this.cooldownRemaining(requestId);
    if (remaining > 0) {
      return {
        status: SYNC_CHECK_STATUS.THROTTLED,
        retryAfterSeconds: remaining,
        request,
      };
    }

    // Stamped BEFORE the call, not after: a throttled (429) or failing Graph is
    // the case where hammering it does the most damage, and a call that threw
    // still cost the vendor a round-trip. Cooling down on failure is the point,
    // not an oversight.
    this.lastCheckedAt.set(requestId, Date.now());

    let found: boolean;
    try {
      found = (await this.graph.findUser(request.targetUpn)) !== null;
    } catch (err) {
      // BUG-002: a raw Graph error carries status -1 and kills the process.
      // BUG-004: the shared helper is also the thing that scrubs the UPN, and
      // this call is a findUser — the likeliest place in the codebase for one
      // to come back inside an error message.
      throw graphUnavailable(
        this.logger,
        'check whether the account has synced',
        err,
      );
    }

    if (!found) {
      return {
        status: SYNC_CHECK_STATUS.NOT_FOUND,
        retryAfterSeconds: COOLDOWN_SECONDS,
        request,
      };
    }

    await openSyncGate(
      this.prisma,
      request,
      SYNC_GATE_MESSAGE.VERIFIED_ON_DEMAND,
    );
    return {
      status: SYNC_CHECK_STATUS.FOUND,
      retryAfterSeconds: 0,
      // Re-read rather than patch the local copy: the gate write also touches
      // accountCreatedAt and adds a timeline event, and the caller renders both.
      request: await this.requests.getRequestDetail(requestId, actor),
    };
  }

  /** Whole seconds left on this request's cooldown; 0 when it may be checked. */
  private cooldownRemaining(requestId: string): number {
    const now = Date.now();
    this.prune(now);
    const last = this.lastCheckedAt.get(requestId);
    if (last === undefined) return 0;
    const elapsedMs = now - last;
    if (elapsedMs >= COOLDOWN_MS) return 0;
    return Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
  }

  /**
   * Drop expired entries so the map cannot grow for the process's lifetime.
   * A full scan is fine: the map only ever holds requests checked in the last
   * 30 seconds, which is bounded by how fast people can click.
   */
  private prune(now: number): void {
    for (const [id, at] of this.lastCheckedAt) {
      if (now - at >= COOLDOWN_MS) this.lastCheckedAt.delete(id);
    }
  }
}

/**
 * 30s. Entra Connect delta sync runs on the order of minutes, so two checks
 * inside half a minute cannot return different answers — the second one is a
 * double-click, not information.
 */
const COOLDOWN_SECONDS = 30;
const COOLDOWN_MS = COOLDOWN_SECONDS * 1000;
