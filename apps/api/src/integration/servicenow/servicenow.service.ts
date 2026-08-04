import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorConfigService } from '../connector-config.service';
import { scrubPii } from '../scrub-pii';

// ── Types ──
// The Table API returns records as flat maps. Reference fields come back as
// { value, link } (raw) or as { value, display_value } when display values are
// requested. We keep the shape generic and let the domain layer map the fields
// it cares about — align these with what Phase 1 already reads/writes.
export type ServiceNowRecord = Record<string, any>;
export type ServiceNowUpdate = Record<string, string>;
// Create payload — allows numbers (e.g. sc_req_item quantity) alongside string
// values / reference sysIds. ServiceNow Table API accepts either (ADR-0008 D3).
export type ServiceNowCreate = Record<string, string | number>;

/**
 * Service Catalog variable values. Always strings — a reference variable takes a
 * sys_id, a choice variable takes the choice VALUE, and an e-mail variable takes
 * the address; ServiceNow rejects numbers here even for numeric-looking choices.
 */
export type CatalogVariables = Record<string, string>;

/**
 * What the Service Catalog returns when an order is placed.
 *
 * 🔴 REQ-level only, and that is not an omission on our side: `order_now` and
 * `submit_order` answer with the request number and NOTHING about the items
 * underneath. Anything needing RITM sys_ids has to look them up afterwards
 * (ServiceNowLookupService), because the catalog workflow — not the caller —
 * decides what items get created.
 */
export interface CatalogOrderResult {
  requestNumber: string;
}

/**
 * `order_now` answers with `request_number`; `submit_order` has been observed to
 * use `number`. Neither field is guaranteed by anything we control, so both are
 * read — and a missing answer throws here rather than returning '' that would
 * fail two steps later inside a lookup, where the cause would be invisible.
 */
/**
 * ≥2 `sys_user` rows share an address (ADR-0025 OQ-4).
 *
 * A distinct type because the two callers must react differently: the outbound
 * submit refuses outright, while the sweep has to skip THIS request and carry
 * on — treating it as "ServiceNow is down" would stall every other onboarding
 * behind one person's duplicated account.
 */
/** Reference fields come back as `{value, link}` or as a bare string. */
function refValue(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  const value = (raw as { value?: unknown }).value;
  return typeof value === 'string' ? value : '';
}

export class AmbiguousServiceNowUserError extends Error {
  constructor() {
    super('ServiceNow has more than one user with that e-mail address');
    this.name = 'AmbiguousServiceNowUserError';
  }
}

function readRequestNumber(result: ServiceNowRecord | undefined): string {
  const raw = result?.request_number ?? result?.number;
  if (typeof raw !== 'string' || !raw) {
    throw new Error('ServiceNow catalog order returned no request number');
  }
  return raw;
}

@Injectable()
export class ServiceNowService implements OnModuleInit {
  private readonly logger = new Logger(ServiceNowService.name);
  private baseUrl!: string;
  private authHeader!: string;
  private defaultTable!: string;
  /** undefined = not looked up yet; null = looked up and not found (CH-010). */
  private integrationUserSysId: string | null | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly connectorConfig: ConnectorConfigService,
  ) {}

  /**
   * Resolve config at boot (C2, ADR-0013). Non-secret instance URL / default
   * table come from the connector config (DB-then-env); the basic-auth user +
   * password stay in env only (H4, OQ-2 — one pair, kept together). A missing
   * instance URL still throws here, so a misconfigured connector fails the boot.
   */
  async onModuleInit(): Promise<void> {
    const instanceUrl = await this.connectorConfig.resolve(
      'servicenow',
      'serviceNowInstanceUrl',
    );
    if (!instanceUrl) {
      throw new Error('ServiceNow connector is not configured (instance URL)');
    }
    this.baseUrl = instanceUrl.replace(/\/$/, '');
    const user = this.config.getOrThrow<string>('SERVICENOW_USER');
    const pass = this.config.getOrThrow<string>('SERVICENOW_PASSWORD');
    this.authHeader =
      'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    // Confirm this matches the table Phase 1 already uses (e.g. sc_req_item).
    this.defaultTable =
      (await this.connectorConfig.resolve(
        'servicenow',
        'serviceNowDefaultTable',
      )) ?? 'sc_req_item';
  }

  /**
   * `logPath` exists for one reason: the error log below prints the path
   * verbatim, and CH-010 added a caller whose query string contains
   * SERVICENOW_USER — half of the basic-auth pair, which connectors.ts
   * classifies as a secret. Callers whose path carries something that must not
   * be logged pass a redacted label instead. Defaults to `path`, so every
   * existing caller is unaffected.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    logPath: string = path,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      /**
       * BUG-007 — the response body is a string ServiceNow chose, so it is
       * scrubbed before it reaches a log (same helper as BUG-004; a second
       * regex here would be a second thing to keep correct).
       *
       * Why this path in particular: the outbound create sends
       * `short_description: "M365/D365 license request — {targetUpn}"`, so a
       * failing create is a request whose payload contains a UPN. Whether
       * ServiceNow echoes it back is not something we get to find out safely.
       *
       * `method` / `path` / `status` stay verbatim — they are the whole reason
       * to log this, and all five callers were checked: the only `query()`
       * caller passes an empty query, so nothing user-identifying reaches a
       * path here (unlike BUG-004, where the UPN was IN the path).
       */
      this.logger.error(
        `ServiceNow ${method} ${logPath} -> ${res.status}: ${scrubPii(text)}`,
      );
      throw new Error(`ServiceNow request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  /** Fetch one record by sys_id. Returns null if not found. */
  async getRecord(
    sysId: string,
    table = this.defaultTable,
  ): Promise<ServiceNowRecord | null> {
    try {
      const data = await this.request<{ result: ServiceNowRecord }>(
        'GET',
        `/api/now/table/${table}/${sysId}`,
      );
      return data.result ?? null;
    } catch {
      return null;
    }
  }

  /** Fetch one record by its human number, e.g. RITM0012345. */
  async getRecordByNumber(
    number: string,
    table = this.defaultTable,
  ): Promise<ServiceNowRecord | null> {
    const data = await this.request<{ result: ServiceNowRecord[] }>(
      'GET',
      `/api/now/table/${table}?sysparm_query=number=${encodeURIComponent(
        number,
      )}&sysparm_limit=1`,
    );
    return data.result?.[0] ?? null;
  }

  /** Query records with a ServiceNow encoded query string. */
  async query(
    sysparmQuery: string,
    table = this.defaultTable,
    limit = 50,
  ): Promise<ServiceNowRecord[]> {
    const data = await this.request<{ result: ServiceNowRecord[] }>(
      'GET',
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        sysparmQuery,
      )}&sysparm_limit=${limit}`,
    );
    return data.result ?? [];
  }

  /**
   * Create a record (POST). Returns the created record including its sys_id and
   * number. Used by the outbound path to open sc_request (REQ) / sc_req_item
   * (RITM) tickets from the platform (ADR-0008 D3 / Phase 乙 outbound direct).
   */
  async createRecord(
    fields: ServiceNowCreate,
    table = this.defaultTable,
  ): Promise<ServiceNowRecord> {
    const data = await this.request<{ result: ServiceNowRecord }>(
      'POST',
      `/api/now/table/${table}`,
      fields,
    );
    return data.result;
  }

  // ── Service Catalog API (BUG-010 / ADR-0025 D2) ─────────────────────────
  //
  // 🔴 Why these exist at all: `createRecord` CANNOT open a request on this
  // instance. `POST /api/now/table/sc_request` returns 403 for the integration
  // account even with a single-field payload — table-level ACL, not field-level
  // (BUG-010 §2 #2), while a PATCH on sc_req_item from the same account
  // succeeds. Insert and update are separate ACLs.
  //
  // The catalog route is strictly better anyway, not merely the one that works:
  // ServiceNow runs the catalog workflow itself, so REQ / RITM / catalog task
  // come out in exactly the shape a human-raised request has — including the one
  // active task per RITM that ADR-0018 D3 depends on. Hand-built inserts never
  // produced that.

  /** Order one catalog item immediately (one REQ, one RITM). */
  async orderNow(
    itemSysId: string,
    variables: CatalogVariables,
    quantity = 1,
  ): Promise<CatalogOrderResult> {
    const data = await this.request<{ result: ServiceNowRecord }>(
      'POST',
      `/api/sn_sc/servicecatalog/items/${itemSysId}/order_now`,
      { sysparm_quantity: String(quantity), variables },
    );
    return { requestNumber: readRequestNumber(data.result) };
  }

  /**
   * How many items the integration account's cart already holds.
   *
   * 🔴 The cart belongs to the ACCOUNT, not to one submission, and
   * `submit_order` submits ALL of it. Anything another process left behind would
   * be ordered under our REQ and billed to whoever we named as requester.
   * Callers must check this before adding and must REFUSE rather than clear:
   * deleting someone else's pending order is not the platform's call to make.
   * (Same rule CH-014's ops script follows, for the same reason.)
   */
  async cartItemCount(): Promise<number> {
    const data = await this.request<{ result?: { items?: unknown[] } }>(
      'GET',
      '/api/sn_sc/servicecatalog/cart',
    );
    return data.result?.items?.length ?? 0;
  }

  /** Add one catalog item to the cart — used when a request has several lines. */
  async addToCart(
    itemSysId: string,
    variables: CatalogVariables,
    quantity = 1,
  ): Promise<void> {
    await this.request(
      'POST',
      `/api/sn_sc/servicecatalog/items/${itemSysId}/add_to_cart`,
      { sysparm_quantity: String(quantity), variables },
    );
  }

  /** Submit everything in the cart as ONE request. */
  async submitCartOrder(): Promise<CatalogOrderResult> {
    const data = await this.request<{ result: ServiceNowRecord }>(
      'POST',
      '/api/sn_sc/servicecatalog/cart/submit_order',
    );
    return { requestNumber: readRequestNumber(data.result) };
  }

  /**
   * sys_user sys_id by e-mail address.
   *
   * Two callers want exactly this (ADR-0025): the outbound submit needs somebody
   * real to put in the mandatory `requester_name` / `target_user` reference
   * variables, and gate ② needs to know whether the new joiner has reached
   * ServiceNow yet.
   *
   * 🔴 Fail-closed on ≥2 matches (OQ-4). `email` is not unique on `sys_user`,
   * and taking "the first one" would attach a real licence request to the wrong
   * person with nothing in the record to show it happened.
   *
   * H4: the address travels in the query string, so the logged path is redacted
   * the same way `getIntegrationUserSysId` redacts the service account name.
   */
  async findUserSysIdByEmail(email: string): Promise<string | null> {
    const data = await this.request<{ result: ServiceNowRecord[] }>(
      'GET',
      `/api/now/table/sys_user?sysparm_query=email=${encodeURIComponent(
        email,
      )}&sysparm_fields=sys_id&sysparm_limit=2`,
      undefined,
      '/api/now/table/sys_user?sysparm_query=email=<redacted>',
    );
    const rows = data.result ?? [];
    if (rows.length > 1) {
      throw new AmbiguousServiceNowUserError();
    }
    const sysId = rows[0]?.sys_id;
    return typeof sysId === 'string' && sysId ? sysId : null;
  }

  /**
   * Set one catalog variable on an existing RITM. Returns false if the RITM has
   * no such variable (nothing was written).
   *
   * ADR-0025 D3 — this exists for exactly one job: when gate ② opens, replace
   * the `target_user` placeholder (the requester) with the joiner who now has a
   * `sys_user` record. Until that happens the request names the wrong person as
   * its target, and only `target_users_email` is telling the truth.
   *
   * Costs 1 + 2N reads because variable values are reached through a join table
   * (`sc_item_option_mtom` → `sc_item_option` → `item_option_new`) and only the
   * definition carries the NAME. Acceptable: this runs once per onboarding, at
   * the moment a gate opens — not on any hot path.
   *
   * ⚠️ Whether the integration account may WRITE `sc_item_option` is not proven
   * (BUG-010 showed insert and update are separate ACLs on this instance). The
   * caller must treat failure as non-fatal — the gate is about what ServiceNow
   * knows, not about whether we managed to tidy the ticket.
   */
  async updateCatalogVariable(
    ritmSysId: string,
    variableName: string,
    value: string,
  ): Promise<boolean> {
    const links = await this.query(
      `request_item=${ritmSysId}`,
      'sc_item_option_mtom',
      60,
    );
    for (const link of links) {
      const optionId = refValue(link.sc_item_option);
      if (!optionId) continue;
      const option = await this.getRecord(optionId, 'sc_item_option');
      const definitionId = refValue(option?.item_option_new);
      if (!definitionId) continue;
      const definition = await this.getRecord(definitionId, 'item_option_new');
      if (definition?.name !== variableName) continue;
      await this.updateRecord(optionId, { value }, 'sc_item_option');
      return true;
    }
    return false;
  }

  /** Update fields on a record — used to write fulfilment status back. */
  async updateRecord(
    sysId: string,
    fields: ServiceNowUpdate,
    table = this.defaultTable,
  ): Promise<ServiceNowRecord> {
    const data = await this.request<{ result: ServiceNowRecord }>(
      'PATCH',
      `/api/now/table/${table}/${sysId}`,
      fields,
    );
    return data.result;
  }

  /** Append a work note (shows in the ticket activity stream). */
  async addWorkNote(
    sysId: string,
    note: string,
    table = this.defaultTable,
  ): Promise<void> {
    await this.updateRecord(sysId, { work_notes: note }, table);
  }

  /**
   * sys_id of the integration account itself (CH-010).
   *
   * Needed because Ricoh's instance runs a business rule — `Validate "Assigned
   * to" before close` — that rejects a task close with HTTP 403 when the task
   * has no assignee. Proven on 2026-07-29: the same task refused `{state:'3'}`
   * and accepted `{assigned_to, state:'3'}`.
   *
   * Resolved lazily and cached, NOT at boot: onModuleInit already fails the
   * whole application when ServiceNow is misconfigured, and adding a lookup
   * there would extend that to "ServiceNow must be reachable to start".
   *
   * `null` is cached too — a missing user is a configuration fact, not a
   * transient one, and re-querying it on every close would add a round trip to
   * a path that is already going to fail.
   */
  async getIntegrationUserSysId(): Promise<string | null> {
    if (this.integrationUserSysId !== undefined) {
      return this.integrationUserSysId;
    }
    const user = this.config.getOrThrow<string>('SERVICENOW_USER');
    const data = await this.request<{ result: ServiceNowRecord[] }>(
      'GET',
      `/api/now/table/sys_user?sysparm_query=user_name=${encodeURIComponent(
        user,
      )}&sysparm_fields=sys_id&sysparm_limit=1`,
      undefined,
      // H4 — the real path carries the service account name; see `logPath`.
      '/api/now/table/sys_user?sysparm_query=user_name=<redacted>',
    );
    // Via a local, not by returning the field: reading the property back would
    // widen to `string | null | undefined` again and fail the return type.
    const resolved: string | null = data.result?.[0]?.sys_id ?? null;
    this.integrationUserSysId = resolved;
    return resolved;
  }
}
