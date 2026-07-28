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
  'n8n-license': { key: 'n8n-license', label: 'n8n (license operations)' },
  'n8n-ticket': { key: 'n8n-ticket', label: 'n8n (ticket updates)' },
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
  /**
   * Probeable, but ONLY workflow 2002 in mode 1 (GET subscribedSkus — read-only).
   * This is the first n8n connector with anything safe to call (ADR-0010 D5).
   *
   * 🔴 Do NOT extend the probe to 2003 or 2005:
   *   2003 ASSIGNS A REAL LICENCE to a real person. "Just testing" is not a
   *        reason to consume a seat.
   *   2005 is read-only but needs a real UPN to say anything, and sending a
   *        colleague's UPN on a health check is exactly the PII habit H4 exists
   *        to prevent — it tells us nothing 2002 has not already told us.
   */
  'n8n-license': null,
  /**
   * NOT probeable. Workflow 2004 does exactly one thing: PATCH a real RITM's
   * state. There is no read-only mode to borrow — its own sticky note says
   * "RITM ONLY. 3 fields: state, work_notes, close_notes" and calls that
   * deliberate. A health check that closes somebody's ticket is not a health
   * check. Do not add a probe here.
   */
  'n8n-ticket':
    'Workflow 2004 only changes a real ticket’s state, so it is never called as a test',
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
  // W39 / ADR-0017 seam ② — the switch itself lives here (D1: one switch per
  // seam). Default stays 'graph', so deploying this changes nothing until an
  // admin flips it.
  'n8n-license': {
    editable: [
      {
        column: 'licenseOpsProvider',
        label: 'Provider',
        envKey: 'LICENSE_OPS_PROVIDER',
        kind: 'enum',
        enumValues: ['graph', 'n8n'],
      },
      {
        column: 'n8nLicenseBaseUrl',
        label: 'Webhook base URL',
        envKey: 'N8N_LICENSE_BASE_URL',
        kind: 'url',
      },
    ],
    // The one credential that lets a caller assign licences through n8n.
    secrets: [{ envKey: 'N8N_LICENSE_WEBHOOK_KEY', label: 'Webhook key' }],
  },
  // W40 / ADR-0017 seam ④ — the third and last switch (D1: one per seam).
  // Default stays 'direct', so deploying this changes nothing until an admin
  // flips it.
  'n8n-ticket': {
    editable: [
      {
        column: 'ticketUpdateProvider',
        label: 'Provider',
        envKey: 'TICKET_UPDATE_PROVIDER',
        kind: 'enum',
        enumValues: ['direct', 'n8n'],
      },
      {
        column: 'n8nTicketWebhookUrl',
        label: 'Webhook URL',
        envKey: 'N8N_TICKET_WEBHOOK_URL',
        kind: 'url',
      },
    ],
    // The credential that lets a caller close a customer's ticket.
    secrets: [{ envKey: 'N8N_TICKET_WEBHOOK_KEY', label: 'Webhook key' }],
  },
};

/**
 * Webhook paths on the n8n side (W39). Read from the workflow JSON rather than
 * from ADR prose — the ADR paraphrase and the workflows disagreed in four
 * places (W39 plan §2), so the JSON is the source of truth for anything the
 * platform sends or parses.
 *
 * Kept beside the connector spec, not inside the provider, so the base URL and
 * the paths that complete it stay visible in one place.
 */
/**
 * 2004 (W40) — the only ticket workflow. One path, two modes:
 *   mode 1 → state '2' (Work in Progress) + work_notes
 *   mode 0 → state '3' (Closed Complete)  + close_notes
 * Read from the workflow's own `Validate & Build Patch` node.
 */
export const N8N_TICKET_PATH = 'wf4-sn-update';

export const N8N_LICENSE_PATHS = {
  /** 2002 — mode 1: tenant SKU seats. mode 2 (users by SKU) is not used. */
  licenseCheck: 'wf2-license-check',
  /** 2003 — assign one licence to one user. */
  assign: 'wf3-assign-license',
  /** 2005 — does this user exist in Entra yet. */
  syncCheck: 'wf5-sync-check',
} as const;
