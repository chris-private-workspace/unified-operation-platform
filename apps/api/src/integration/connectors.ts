/**
 * W30 / ADR-0010 D3 — the connector inventory and what `state` means.
 *
 * `state` describes DEPLOYMENT SHAPE, not health. It is computed from config
 * and never changes because a probe failed (Q3, Chris 2026-07-21): if a failed
 * probe flipped state to "error", that error would vanish on the next restart
 * when state is recomputed — looking like it fixed itself while nothing was
 * fixed. Probe outcomes live in a separate field.
 */
export type ConnectorState =
  /** Config is getOrThrow'd during bootstrap — if it were missing the app would not be running. */
  | 'required'
  /** Optional and currently selected. */
  | 'active'
  /** Optional and not selected. */
  | 'inactive';

export const CONNECTORS = {
  graph: { key: 'graph', label: 'Microsoft Graph' },
  servicenow: { key: 'servicenow', label: 'ServiceNow' },
  'n8n-outbound': { key: 'n8n-outbound', label: 'n8n (outbound)' },
  'n8n-inbound': { key: 'n8n-inbound', label: 'n8n (inbound intake)' },
} as const;

export type ConnectorKey = keyof typeof CONNECTORS;

export const CONNECTOR_KEYS = Object.keys(CONNECTORS) as ConnectorKey[];

/**
 * Which connectors a Test connection probe can actually reach, and why the
 * others cannot (ADR-0010 D5). Kept as data so the controller cannot quietly
 * grow a probe for something that must never be probed.
 */
export const PROBEABLE: Record<ConnectorKey, string | null> = {
  graph: null, // GET /subscribedSkus — read-only
  servicenow: null, // GET table + sysparm_limit=1 — read-only
  /**
   * NOT probeable. The n8n outbound webhook OPENS A REAL TICKET (ADR-0008 乙/丙).
   * "Just testing" is not a reason to create one, so this reports configuration
   * only. Do not add a probe here.
   */
  'n8n-outbound':
    'The outbound webhook creates a real ticket, so it is never called as a test',
  /** Inbound is pushed to us; there is nothing to call. */
  'n8n-inbound': 'Inbound is pushed by n8n — the platform has nothing to call',
};

// ── W34 / ADR-0013 — connector CONFIG spec (Model C) ───────────
// Which fields of each connector are NON-SECRET (editable in the UI, stored on
// ConnectorConfig, resolved DB-then-env) vs SECRET (env-only, never stored or
// returned — only their configured/unset status is reported). Single source of
// truth: the resolver, the admin controller and validation all derive from here,
// so a field cannot silently change category in one place only.

/** A non-secret field: editable in the UI, persisted, DB-then-env resolved. */
export interface EditableField {
  /** ConnectorConfig column name AND the API/PATCH field key. */
  column: string;
  label: string;
  /** Env var used as the fallback when the column is null (ConfigService). */
  envKey: string;
  kind: 'text' | 'url' | 'guid' | 'enum';
  /** Allowed values when kind === 'enum'. */
  enumValues?: readonly string[];
}

/** A secret field: env-only. We report configured/unset, NEVER the value (D2/D5, H4). */
export interface SecretField {
  /** Env var name — shown as a label so operators know which key backs it. */
  envKey: string;
  label: string;
}

export interface ConnectorConfigSpec {
  editable: EditableField[];
  secrets: SecretField[];
}

export const CONNECTOR_CONFIG: Record<ConnectorKey, ConnectorConfigSpec> = {
  graph: {
    editable: [
      {
        column: 'graphTenantId',
        label: 'Tenant ID',
        envKey: 'GRAPH_TENANT_ID',
        kind: 'guid',
      },
      {
        column: 'graphClientId',
        label: 'Client ID',
        envKey: 'GRAPH_CLIENT_ID',
        kind: 'guid',
      },
    ],
    secrets: [{ envKey: 'GRAPH_CLIENT_SECRET', label: 'Client secret' }],
  },
  servicenow: {
    editable: [
      {
        column: 'serviceNowInstanceUrl',
        label: 'Instance URL',
        envKey: 'SERVICENOW_INSTANCE_URL',
        kind: 'url',
      },
      {
        column: 'serviceNowDefaultTable',
        label: 'Default table',
        envKey: 'SERVICENOW_DEFAULT_TABLE',
        kind: 'text',
      },
    ],
    // OQ-2: user + password are one basic-auth pair — kept together, env-only.
    secrets: [
      { envKey: 'SERVICENOW_USER', label: 'Integration user' },
      { envKey: 'SERVICENOW_PASSWORD', label: 'Password' },
    ],
  },
  'n8n-outbound': {
    editable: [
      {
        column: 'requestSubmissionProvider',
        label: 'Provider',
        envKey: 'REQUEST_SUBMISSION_PROVIDER',
        kind: 'enum',
        enumValues: ['direct', 'n8n'],
      },
      {
        column: 'n8nOutboundWebhookUrl',
        label: 'Webhook URL',
        envKey: 'N8N_OUTBOUND_WEBHOOK_URL',
        kind: 'url',
      },
    ],
    secrets: [{ envKey: 'N8N_OUTBOUND_WEBHOOK_KEY', label: 'Webhook key' }],
  },
  'n8n-inbound': {
    // Inbound has no non-secret settings — the shared key is its only config.
    editable: [],
    secrets: [{ envKey: 'INTAKE_API_KEY', label: 'Intake API key' }],
  },
};
