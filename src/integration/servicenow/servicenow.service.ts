import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ── Types ──
// The Table API returns records as flat maps. Reference fields come back as
// { value, link } (raw) or as { value, display_value } when display values are
// requested. We keep the shape generic and let the domain layer map the fields
// it cares about — align these with what Phase 1 already reads/writes.
export type ServiceNowRecord = Record<string, any>;
export type ServiceNowUpdate = Record<string, string>;

@Injectable()
export class ServiceNowService {
  private readonly logger = new Logger(ServiceNowService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly defaultTable: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .getOrThrow<string>('SERVICENOW_INSTANCE_URL')
      .replace(/\/$/, '');
    const user = this.config.getOrThrow<string>('SERVICENOW_USER');
    const pass = this.config.getOrThrow<string>('SERVICENOW_PASSWORD');
    this.authHeader =
      'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    // Confirm this matches the table Phase 1 already uses (e.g. sc_req_item).
    this.defaultTable =
      this.config.get<string>('SERVICENOW_DEFAULT_TABLE') ?? 'sc_req_item';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
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
      this.logger.error(
        `ServiceNow ${method} ${path} -> ${res.status}: ${text}`,
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
}
