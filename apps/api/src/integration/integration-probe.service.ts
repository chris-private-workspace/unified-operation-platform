import { Injectable, Logger } from '@nestjs/common';
import { GraphService } from './graph/graph.service';
import { ServiceNowService } from './servicenow/servicenow.service';
import { PROBEABLE, type ConnectorKey } from './connectors';

/** Minimum gap between probes of the SAME connector (W30 plan §9 Q2). */
export const PROBE_THROTTLE_MS = 10_000;

export interface ProbeResult {
  ok: boolean;
  /** Safe for display — never the vendor's own message (see below). */
  message: string;
  at: Date;
}

/**
 * Test connection probes (W30 / ADR-0010 D5).
 *
 * Three rules this file exists to enforce:
 *
 *  1. **Read-only.** Graph uses the existing getSubscribedSkus; ServiceNow uses
 *     the existing query() with a limit of 1. `createRecord` is never called.
 *  2. **The n8n outbound webhook is never called.** Firing it opens a REAL
 *     ticket (ADR-0008 乙/丙), so "testing" it would create work for somebody.
 *     It reports configuration only — see PROBEABLE in connectors.ts.
 *  3. **The vendor's error text never reaches the caller.** It can carry the
 *     instance URL or hints about the service account (H4). The raw error is
 *     logged server-side; the caller gets a fixed message.
 *
 * Probe results are in-process and disappear on restart. That is deliberate:
 * ADR-0010 D4 chose not to persist health, so nothing here pretends to be a
 * history — the UI must present it as "this session only".
 */
@Injectable()
export class IntegrationProbeService {
  private readonly logger = new Logger(IntegrationProbeService.name);
  private readonly lastProbe = new Map<ConnectorKey, ProbeResult>();
  private readonly lastRunAt = new Map<ConnectorKey, number>();

  constructor(
    private readonly graph: GraphService,
    private readonly snow: ServiceNowService,
  ) {}

  /** Latest in-process probe result, if this connector was tested since boot. */
  get(key: ConnectorKey): ProbeResult | null {
    return this.lastProbe.get(key) ?? null;
  }

  /** ms until this connector may be probed again; 0 when it is allowed now. */
  cooldownRemainingMs(key: ConnectorKey, now: number): number {
    const last = this.lastRunAt.get(key);
    if (last === undefined) return 0;
    return Math.max(0, PROBE_THROTTLE_MS - (now - last));
  }

  /**
   * Run the probe for one connector. Only ever called from the user-triggered
   * endpoint — deliberately not scheduled, so the platform never generates
   * background traffic against a vendor (ADR-0010 D5 obligation).
   */
  async run(key: ConnectorKey, now: number): Promise<ProbeResult> {
    this.lastRunAt.set(key, now);
    const result = await this.execute(key);
    this.lastProbe.set(key, result);
    return result;
  }

  private async execute(key: ConnectorKey): Promise<ProbeResult> {
    const notProbeable = PROBEABLE[key];
    if (notProbeable) {
      return { ok: true, message: notProbeable, at: new Date() };
    }
    try {
      if (key === 'graph') {
        const skus = await this.graph.getSubscribedSkus();
        return {
          ok: true,
          message: `Reachable — ${skus.length} subscribed SKUs visible`,
          at: new Date(),
        };
      }
      // Empty query + limit 1: the cheapest read that proves auth + reachability.
      const rows = await this.snow.query('', undefined, 1);
      return {
        ok: true,
        message: `Reachable — table query returned ${rows.length} row(s)`,
        at: new Date(),
      };
    } catch (err) {
      // H4 / D5: log the detail, return a fixed message. The vendor's own text
      // can contain the instance URL or service-account hints.
      this.logger.error(
        `Test connection failed for ${key}: ${(err as Error)?.message}`,
      );
      return {
        ok: false,
        message: 'Connection failed — see server logs for details',
        at: new Date(),
      };
    }
  }
}
