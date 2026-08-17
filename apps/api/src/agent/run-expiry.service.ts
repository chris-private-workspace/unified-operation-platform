import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { scrubPii } from '../integration/scrub-pii';
import { AiAssistService } from './ai-assist.service';

/**
 * W46 期二 G5 / plan OQ-5 — the clock half of run expiry.
 *
 * 🔴 Why a run left parked is a PROBLEM and not just untidy, in one line:
 * OQ-3 allows one non-terminal run per request, and `awaiting_approval` is
 * non-terminal — so a proposal nobody presses locks that request out of ever
 * getting another run, with no path back. Expiry is the platform's way of
 * unsticking itself.
 *
 * 🟢 Shape copied from `SyncSweepService` deliberately (§13: prefer the
 * existing pattern). Same `@Cron` + env-tuned knobs + "never throws" contract,
 * and for the same reason BUG-002 gave: an exception escaping a scheduled job
 * is an unhandled rejection, which kills the Nest process.
 *
 * 🔴 It decides WHEN, never HOW. The row changes are `AiAssistService.expireRun`,
 * which `resumeRun` also calls for the structural case (R16) — one implementation,
 * two triggers, the `openSyncGate` precedent from CH-015. It also has to be that
 * way: `agent.boundary.spec.ts` asserts `AgentStep` has exactly one writer, so a
 * sweep writing its own step would be caught by that spec — correctly.
 */

/**
 * plan OQ-5 ① — **7 days** (Chris 2026-08-16).
 *
 * Not an SLA: a recovery valve. Too short kills a proposal that was still valid
 * after a weekend plus a public holiday; too long is the same as having none.
 * `AgentProposal.decidedAt` makes the real distribution measurable (G7), so
 * tightening this later is evidence-driven rather than another guess.
 */
const DEFAULT_EXPIRY_DAYS = 7;

/** What one round did — returned so a test and the log line agree. */
export interface ExpirySweepResult {
  scanned: number;
  expired: number;
}

@Injectable()
export class AgentRunExpiryService {
  private readonly logger = new Logger(AgentRunExpiryService.name);
  private readonly enabled: boolean;
  private readonly expiryDays: number;
  private readonly batch: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAssist: AiAssistService,
    config: ConfigService,
  ) {
    // `get` + defaults rather than getOrThrow — tuning knobs, not
    // deployment-critical config. Default ON (`!== 'false'`), so forgetting the
    // variable leaves expiry running and only an explicit "false" stops it.
    // Same reasoning as SyncSweepService.
    this.enabled = config.get<string>('AGENT_RUN_EXPIRY_ENABLED') !== 'false';
    this.expiryDays = toPositiveInt(
      config.get<string>('AGENT_RUN_EXPIRY_DAYS'),
      DEFAULT_EXPIRY_DAYS,
    );
    this.batch = toPositiveInt(
      config.get<string>('AGENT_RUN_EXPIRY_BATCH'),
      50,
    );
  }

  /**
   * Hourly, not every ten minutes like the sync sweep — the threshold is days,
   * so a finer interval would only add queries. The two jobs answer questions
   * with very different clocks and copying the interval along with the shape
   * would have been cargo-culting it.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    // BUG-002 — the boundary with the scheduler. `sweep()` is already
    // defensive; this is the belt to that pair of braces.
    try {
      await this.sweep();
    } catch (err) {
      this.logger.error(
        `Agent run expiry sweep failed unexpectedly: ${scrubPii(
          (err as Error)?.message,
        )}`,
      );
    }
  }

  /** One round. Never throws. */
  async sweep(): Promise<ExpirySweepResult> {
    if (!this.enabled) return { scanned: 0, expired: 0 };

    const cutoff = new Date(Date.now() - this.expiryDays * 24 * 60 * 60 * 1000);

    const stale = await this.prisma.agentRun.findMany({
      where: {
        /**
         * 🔴 Only `awaiting_approval`.
         *
         * `running` is deliberately NOT swept. A run in that state has an
         * in-flight model call somewhere, and expiring it from a different
         * process would mark it over while it is still working — the platform
         * telling itself a thing finished when it did not. Runs that die
         * mid-flight are a real gap, but they need a heartbeat to detect, not
         * a threshold, and inventing one here would put a wrong answer where an
         * honest absence should be. Left as a known gap rather than papered
         * over.
         */
        status: 'awaiting_approval',
        startedAt: { lt: cutoff },
      },
      orderBy: { startedAt: 'asc' },
      take: this.batch,
      // 🔴 No `runState`: this row's saved state carries the model's unscrubbed
      // message history (F8's `getRun` learned that the expensive way). Nothing
      // in this file needs it.
      select: { id: true, startedAt: true },
    });

    if (stale.length === 0) return { scanned: 0, expired: 0 };

    let expired = 0;
    for (const run of stale) {
      try {
        await this.aiAssist.expireRun(
          run.id,
          `No decision was made within ${this.expiryDays} days`,
        );
        expired++;
      } catch (err) {
        /**
         * One run's failure must not abandon the round. Unlike the sync sweep's
         * vendor-down flags there is no shared dependency to back off from —
         * these are independent local writes, so a failure says nothing about
         * the next row.
         */
        this.logger.warn(
          `Agent run expiry: ${run.id} could not be expired: ${scrubPii(
            (err as Error)?.message,
          )}`,
        );
      }
    }

    if (expired > 0) {
      // H4: counts only. Never the run ids in bulk, never a UPN.
      this.logger.log(
        `Agent run expiry: expired ${expired} of ${stale.length} run(s) parked over ${this.expiryDays} days`,
      );
    }
    return { scanned: stale.length, expired };
  }
}

/** Env values arrive as strings; a junk value must fall back, not become NaN. */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
