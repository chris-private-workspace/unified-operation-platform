import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LineItemStage, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../integration/graph/graph.service';
import {
  AmbiguousServiceNowUserError,
  ServiceNowService,
} from '../integration/servicenow/servicenow.service';
import { scrubPii } from '../integration/scrub-pii';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { SYNC_GATE_MESSAGE } from './sync-gate-messages';
import { openServiceNowUserGate, openSyncGate } from './open-sync-gate';

/** What one round did. Returned so tests (and the log line) can assert it. */
export interface SweepResult {
  scanned: number;
  /** Gate ① — Graph could find the user, so assignment is now possible. */
  opened: number;
  /** Gate ② — ServiceNow now has the user (ADR-0025 D4). */
  snOpened: number;
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
    // ADR-0025 D4 — the sweep now asks TWO vendors the same question about the
    // same person. See `sweep()` for why each gets its own failure handling.
    private readonly snow: ServiceNowService,
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
    const empty: SweepResult = { scanned: 0, opened: 0, snOpened: 0 };
    if (!this.enabled) return empty;

    const candidates = await this.findCandidates();
    // D7: no candidates ⇒ not a single vendor call. The sweep's traffic is
    // proportional to real onboarding volume, which is what makes it a
    // domain-driven job rather than the liveness polling ADR-0010 D5 forbids.
    if (candidates.length === 0) return empty;

    let scanned = 0;
    let opened = 0;
    let snOpened = 0;
    /**
     * 🔴 ADR-0025 D4 — ONE FLAG PER VENDOR, not one for the round.
     *
     * Both gates ask about the same person, but a Graph outage says nothing
     * about ServiceNow and the reverse is equally true. A shared abort flag
     * would let one vendor throttling us stall every onboarding that was only
     * ever waiting on the other — and it would do it silently, because the
     * round still returns and still looks like it worked.
     */
    let graphDown = false;
    let snowDown = false;

    for (const request of candidates) {
      if (graphDown && snowDown) break;
      let looked = false;

      // ── gate ① — Azure / Graph ──
      if (!request.azureSyncedAt && !graphDown) {
        try {
          const found = (await this.graph.findUser(request.targetUpn)) !== null;
          looked = true;
          if (found) {
            await this.openGate(request);
            opened++;
          }
        } catch (err) {
          // D6: stop asking THIS vendor for the rest of the round. If Graph is
          // throttling or refusing us the remaining lookups fail too, and
          // hammering it makes the throttle worse.
          // BUG-004: the failing call IS a findUser, so this is the likeliest
          // place in the codebase for a UPN to come back from a vendor.
          graphDown = true;
          this.logger.warn(
            `Sync sweep: Graph lookups abandoned for this round after ${scanned}: ${scrubPii(
              (err as Error)?.message,
            )}`,
          );
        }
      }

      // ── gate ② — ServiceNow (ADR-0025 D4) ──
      if (!request.serviceNowUserSyncedAt && !snowDown) {
        try {
          const sysId = await this.snow.findUserSysIdByEmail(request.targetUpn);
          looked = true;
          if (sysId) {
            await this.openServiceNowGate(request.id, sysId);
            snOpened++;
          }
        } catch (err) {
          if (err instanceof AmbiguousServiceNowUserError) {
            /**
             * 🔴 This request's problem, not ServiceNow's — so it must NOT
             * abort the vendor. Two people share an address in the directory;
             * every other onboarding is unaffected and stalling them behind it
             * would be the wrong trade. This one gate stays shut until somebody
             * fixes the directory, which is exactly what OQ-4 asked for.
             * H4: no address in the message.
             */
            this.logger.warn(
              'Sync sweep: ServiceNow holds duplicate users for a request — gate ② stays shut',
            );
          } else {
            snowDown = true;
            this.logger.warn(
              `Sync sweep: ServiceNow lookups abandoned for this round after ${scanned}: ${scrubPii(
                (err as Error)?.message,
              )}`,
            );
          }
        }
      }

      if (looked) scanned++;
    }

    if (opened > 0 || snOpened > 0) {
      await this.recordRound(scanned, opened, snOpened);
      // H4: counts and nothing else — never the UPNs that were opened.
      this.logger.log(
        `Sync sweep: scanned ${scanned}, azure ${opened}, servicenow ${snOpened}`,
      );
    }
    return { scanned, opened, snOpened };
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
        // ADR-0025 D4 — either gate still shut. A request past BOTH has nothing
        // left for the sweep to verify; one that is past only one still does.
        OR: [{ azureSyncedAt: null }, { serviceNowUserSyncedAt: null }],
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
      select: {
        id: true,
        targetUpn: true,
        accountCreatedAt: true,
        // Which gates are still shut — the loop asks a vendor only about the
        // gate that needs it, so a request half-way through costs one call.
        azureSyncedAt: true,
        serviceNowUserSyncedAt: true,
      },
    });
  }

  /**
   * Exactly `markSynced`'s writes, minus the human.
   *
   * CH-015 moved the write itself into the shared `openSyncGate` so the
   * on-demand check cannot drift from it. What stays here is the sweep's own
   * choice of timeline message — the only thing the two callers differ on.
   */
  private openGate(request: { id: string; accountCreatedAt: Date | null }) {
    return openSyncGate(this.prisma, request, SYNC_GATE_MESSAGE.VERIFIED);
  }

  /**
   * Gate ② — record that ServiceNow knows the target, then say so on the ticket.
   *
   * ADR-0026 D1/D2 — this used to PATCH the RITM's `target_user` variable so the
   * item stopped naming the requester. It cannot: writing `sc_item_option` is
   * refused outright on this instance (`403 ACL Exception Update Failed due to
   * security constraints`, proven against RITM0047366 in W43 G7). That code was
   * removed rather than left as best-effort — a 0% path that is KNOWN to be 0%
   * reads to the next person as "the ticket repairs itself", which it never did.
   *
   * A work note carries the same information down a path CH-010 already proved
   * writable (`sc_req_item`), and it is an append: the worst case on a ticket we
   * turn out not to own is one irrelevant note, not somebody else's target being
   * overwritten. That asymmetry is why ADR-0026 OQ-2 writes to every RITM the
   * request owns rather than only the platform-created one.
   *
   * 🔴 Still NON-FATAL, but for a different reason than before: the path is now
   * one that works, so a failure here means a real outage rather than a
   * permission wall being papered over. Either way the gate records what
   * ServiceNow KNOWS, and tidying the ticket must never re-shut it.
   */
  private async openServiceNowGate(requestId: string, userSysId: string) {
    await openServiceNowUserGate(
      this.prisma,
      requestId,
      userSysId,
      SYNC_GATE_MESSAGE.SN_VERIFIED,
    );

    const lines = await this.prisma.requestLineItem.findMany({
      where: { requestId, serviceNowSysId: { not: null } },
      select: { serviceNowSysId: true },
    });
    // H4: the sys_id is ServiceNow's own identifier, not an address. The UPN is
    // deliberately absent — `target_users_email` already carries it on the item.
    const note =
      `Target user verified in ServiceNow (sys_user ${userSysId}). ` +
      'Note that the `target_user` variable on this item is the REQUESTER, not ' +
      'the target — the target is the address in `target_users_email`.';
    for (const line of lines) {
      try {
        await this.snow.addWorkNote(line.serviceNowSysId as string, note);
      } catch (err) {
        this.logger.warn(
          `Sync sweep: gate ② opened for ${requestId} but the work note failed: ${scrubPii(
            (err as Error)?.message,
          )}`,
        );
      }
    }
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
  private recordRound(scanned: number, opened: number, snOpened: number) {
    return this.audit.log(this.prisma, {
      action: AUDIT_ACTIONS.SYNC_SWEEP,
      targetType: 'SyncSweep',
      targetId: 'bulk',
      actorId: null, // nobody pressed anything
      actorType: 'system',
      // 🔴 `snOpened` only survives because it was added to the SyncSweep
      // allow-list in audit-fields (ADR-0009 D4) — an unlisted key is dropped
      // silently, and the round would under-report gate ② forever.
      after: { scanned, opened, snOpened },
      metadata: { source: 'sync-sweep' },
    });
  }
}

/** Env values arrive as strings; a junk value must fall back, not become NaN. */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
