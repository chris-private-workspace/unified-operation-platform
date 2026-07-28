import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventType, LineItemStage, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import { scrubPii } from '../integration/scrub-pii';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';

/** What one round did. Returned so tests (and the log line) can assert it. */
export interface SweepResult {
  scanned: number;
  opened: number;
}

/**
 * W37 / ADR-0015 — the scheduled sync sweep.
 *
 * Before this, `azureSyncedAt` was set by whoever CLAIMED the account had
 * synced (n8n on push, or an operator pressing confirm) and the first actual
 * verification happened at assign time — as a 400. The operator's workflow was
 * therefore: guess, try to assign, fail, guess again, with no basis for
 * choosing how long to wait. This service moves the verification off the human
 * and onto a clock.
 *
 * 🔴 It does NOT replace the assign gate. `assign.service.ts` still calls
 * findUser and still fails closed; the sweep just asks the same question
 * earlier, so that by the time someone presses Assign the answer is usually
 * already known. Deleting this service degrades responsiveness, never safety.
 */
@Injectable()
export class SyncSweepService {
  private readonly logger = new Logger(SyncSweepService.name);
  private readonly enabled: boolean;
  private readonly batch: number;
  private readonly maxAgeDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    // `get` + defaults, not getOrThrow: these are tuning knobs with sane
    // defaults, not deployment-critical config (same pattern as
    // jwt-auth.guard's AUTH_DEV_BYPASS). A missing value must not fail the boot.
    //
    // Default ON, so `!== 'false'` rather than `=== 'true'`: forgetting to set
    // it should leave the sweep running, and only an explicit "false" stops it.
    this.enabled = config.get<string>('SYNC_SWEEP_ENABLED') !== 'false';
    this.batch = toPositiveInt(config.get<string>('SYNC_SWEEP_BATCH'), 50);
    this.maxAgeDays = toPositiveInt(
      config.get<string>('SYNC_SWEEP_MAX_AGE_DAYS'),
      30,
    );
  }

  /**
   * OQ1 = A (Chris, 2026-07-27): the interval is fixed rather than read from
   * `SYNC_SWEEP_CRON` as ADR-0015 D5 listed. `@Cron`'s argument is evaluated at
   * class-definition time — before DI exists — so a ConfigService-driven
   * expression is not possible without pulling in `cron` directly (an
   * undeclared transitive dep ⇒ H2). Of D5's four knobs only ENABLED has a real
   * operational driver: when Graph misbehaves you turn the sweep OFF, you do
   * not retune it. See the plan changelog.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron(): Promise<void> {
    // D6 / R1: this is the boundary with the scheduler. An exception escaping
    // here is an unhandled rejection, which kills the Nest process (BUG-002).
    // sweep() is already defensive; this is the belt to that pair of braces.
    try {
      await this.sweep();
    } catch (err) {
      // BUG-004: scrubbed — whatever escaped may well be a Graph error, and
      // this sweep exists precisely to look users up by UPN.
      this.logger.error(
        `Sync sweep failed unexpectedly: ${scrubPii((err as Error)?.message)}`,
      );
    }
  }

  /**
   * One round. Never throws — a scheduled job that can throw is a process that
   * can die (D6).
   */
  async sweep(): Promise<SweepResult> {
    if (!this.enabled) return { scanned: 0, opened: 0 };

    const candidates = await this.findCandidates();
    // D7: no candidates ⇒ not a single Graph call. The sweep's vendor traffic is
    // proportional to real onboarding volume, which is what makes it a
    // domain-driven job rather than the liveness polling ADR-0010 D5 forbids.
    if (candidates.length === 0) return { scanned: 0, opened: 0 };

    let scanned = 0;
    let opened = 0;

    for (const request of candidates) {
      let found: boolean;
      try {
        found = (await this.graph.findUser(request.targetUpn)) !== null;
      } catch (err) {
        // D6: abort the ROUND, do not carry on to the next request. If Graph is
        // throttling or refusing us, the remaining lookups would fail too and
        // hammering it makes the throttle worse. Next round tries again.
        // BUG-004: the failing call IS a findUser, so this message is the most
        // likely place in the whole codebase for a UPN to arrive from Graph.
        this.logger.warn(
          `Sync sweep aborted after ${scanned} of ${
            candidates.length
          } lookup(s): ${scrubPii((err as Error)?.message)}`,
        );
        break;
      }
      scanned++;
      if (!found) continue; // not synced yet — nothing to write, try next round

      await this.openGate(request);
      opened++;
    }

    if (opened > 0) {
      await this.recordRound(scanned, opened);
      // H4: counts and nothing else — never the UPNs that were opened.
      this.logger.log(`Sync sweep: scanned ${scanned}, opened ${opened}`);
    }
    return { scanned, opened };
  }

  /**
   * D2's four conditions. Each one exists to keep the sweep off requests that
   * cannot benefit from it — the point is that an idle platform costs Graph
   * nothing, so a loose filter here would undo D7.
   */
  private findCandidates() {
    const cutoff = new Date(Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000);
    return this.prisma.request.findMany({
      where: {
        azureSyncedAt: null, // already through the gate → nothing to verify
        status: { in: [RequestStatus.OPEN, RequestStatus.IN_PROGRESS] },
        // A request whose lines are all assigned or cancelled has nothing left
        // waiting on the gate, even if the timestamp was never set.
        lineItems: {
          some: {
            stage: {
              notIn: [LineItemStage.ASSIGNED, LineItemStage.CANCELLED],
            },
          },
        },
        // Zombie guard (D5): a request whose UPN is a typo, or whose account was
        // deleted, never syncs. Without a cutoff the sweep would carry it
        // forever and the batch would slowly fill with requests that can never
        // succeed, starving the new ones (they are ordered oldest-first).
        createdAt: { gt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: this.batch,
      select: { id: true, targetUpn: true, accountCreatedAt: true },
    });
  }

  /**
   * Exactly `markSynced`'s writes, minus the human. Kept atomic so a request
   * can never end up past the gate with no timeline entry explaining why.
   */
  private openGate(request: { id: string; accountCreatedAt: Date | null }) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: request.id },
        data: {
          azureSyncedAt: now,
          // `??` not `=`: if the account creation time is already known, the
          // sweep must not overwrite it with "whenever the cron happened to
          // notice" — that would destroy the one figure that shows how long
          // Entra Connect actually took.
          accountCreatedAt: request.accountCreatedAt ?? now,
        },
      });
      await tx.requestEvent.create({
        data: {
          requestId: request.id,
          type: EventType.SYNC,
          message: SYNC_GATE_MESSAGE.VERIFIED,
        },
      });
    });
  }

  /**
   * One row per round that changed something (D4), following the
   * allocation.import precedent: batch totals in `after`, `targetId: 'bulk'`.
   *
   * Deliberately OUTSIDE the per-request transactions, unlike ADR-0009 D8.1's
   * default. A round summary spans N independent transactions, so there is no
   * single one it belongs to, and picking the last would be arbitrary. The
   * "done but unrecorded" failure D8.1 guards against cannot happen here: every
   * opened gate already carries its own RequestEvent, written atomically with
   * the update. What could be lost is the round total — a reporting figure, not
   * the record of the act.
   */
  private recordRound(scanned: number, opened: number) {
    return this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.SYNC_SWEEP,
      targetType: 'SyncSweep',
      targetId: 'bulk',
      actorId: null, // nobody pressed anything
      actorType: 'system',
      after: { scanned, opened },
      metadata: { source: 'sync-sweep' },
    });
  }
}

/** Env values arrive as strings; a junk value must fall back, not become NaN. */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
