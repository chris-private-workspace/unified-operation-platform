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
