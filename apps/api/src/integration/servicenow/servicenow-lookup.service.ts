import { Injectable } from '@nestjs/common';
import { ServiceNowRecord, ServiceNowService } from './servicenow.service';

/**
 * CH-013 / ADR-0021 D6 — one reverse-lookup, two callers.
 *
 * An operator holds a REQ number and nothing else. The intake adapter never
 * needed this: n8n already carries `ritmSysId` (ADR-0017 D4), so no code path
 * ever had to ask ServiceNow which items hang off a request. Both new callers
 * do — the import endpoint and the ops script — which is exactly why this lives
 * in one place instead of two.
 *
 * Read-only by construction: every method below is GET. Nothing here writes,
 * and nothing here decides HTTP semantics — `lookupByNumber` returns null for
 * "no such request" and lets the caller choose between 404 and a CLI message.
 */

const REQ_TABLE = 'sc_request';
const RITM_TABLE = 'sc_req_item';
const TASK_TABLE = 'sc_task';

/** Reference fields come back as `{value, link}` or as a bare string. */
function ref(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const value = (raw as { value?: unknown }).value;
  return typeof value === 'string' ? value : '';
}

function text(raw: unknown): string {
  return typeof raw === 'string' ? raw : ref(raw);
}

export interface LookedUpRitm {
  number: string;
  sysId: string;
  title: string;
  activeTaskCount: number;
  /**
   * ADR-0018 D3 — the platform closes the ONE active catalog task under a RITM
   * and fails closed on 0 or 2+. A RITM that does not satisfy that here will not
   * satisfy it after the assign either, so the answer belongs in the preview
   * rather than in a failure three steps later.
   */
  importable: boolean;
  /** Operator-facing reason when `importable` is false; null when it is true. */
  blockedReason: string | null;
  /**
   * 🔴 RAW ServiceNow records — server-side only. A catalog task carries fields
   * this platform has no business publishing (assignment, journal references,
   * whatever else the instance defines). The HTTP layer must map to a DTO and
   * pick fields explicitly; never serialise this array to a client.
   */
  activeTasks: ServiceNowRecord[];
}

export interface LookedUpRequest {
  number: string;
  sysId: string;
  shortDescription: string;
  openedAt: string;
  items: LookedUpRitm[];
}

@Injectable()
export class ServiceNowLookupService {
  constructor(private readonly snow: ServiceNowService) {}

  /**
   * REQ number → the request and every item under it, each with its active
   * catalog task count.
   *
   * Returns null when the request is not found. Callers should say so in a way
   * that mentions row-level ACL: the Table API gives the same empty answer for
   * "does not exist" and "exists but you cannot see it", and on this instance
   * the second one is a real, observed case.
   */
  async lookupByNumber(reqNumber: string): Promise<LookedUpRequest | null> {
    const req = await this.snow.getRecordByNumber(reqNumber, REQ_TABLE);
    if (!req) return null;
    return this.describe(req);
  }

  /**
   * The most recent requests visible to the integration account.
   *
   * Exists for the ops script's `--list` mode, and deliberately returns the same
   * shape as `lookupByNumber` so that mode does not grow its own copy of the
   * item/task walk. "Which request can I test with" is the only question it is
   * ever asked, and the task counts are what answer it.
   */
  async listRecent(limit = 15): Promise<LookedUpRequest[]> {
    const rows = await this.snow.query(
      'ORDERBYDESCsys_created_on',
      REQ_TABLE,
      limit,
    );
    const out: LookedUpRequest[] = [];
    for (const row of rows) {
      out.push(await this.describe(row));
    }
    return out;
  }

  private async describe(req: ServiceNowRecord): Promise<LookedUpRequest> {
    const sysId = String(req.sys_id);
    const items = await this.snow.query(`request=${sysId}`, RITM_TABLE, 50);

    // Sequential, not Promise.all: a request with N items already costs 1 + N
    // GETs against a shared corporate instance, and `listRecent` multiplies that
    // by the page size. Latency here is nobody's bottleneck — this runs behind a
    // button press, not in a request path.
    const described: LookedUpRitm[] = [];
    for (const item of items) {
      const tasks = await this.snow.query(
        `request_item=${String(item.sys_id)}^active=true`,
        TASK_TABLE,
        20,
      );
      described.push(this.describeItem(item, tasks));
    }

    return {
      number: text(req.number),
      sysId,
      shortDescription: text(req.short_description),
      openedAt: text(req.opened_at) || text(req.sys_created_on),
      items: described,
    };
  }

  private describeItem(
    item: ServiceNowRecord,
    activeTasks: ServiceNowRecord[],
  ): LookedUpRitm {
    const count = activeTasks.length;
    return {
      number: text(item.number),
      sysId: String(item.sys_id),
      title: text(item.short_description),
      activeTaskCount: count,
      importable: count === 1,
      blockedReason:
        count === 1
          ? null
          : count === 0
            ? 'No active catalog task — the platform would have nothing to close on fulfilment'
            : `${count} active catalog tasks — the platform cannot tell which one is its own`,
      activeTasks,
    };
  }
}
