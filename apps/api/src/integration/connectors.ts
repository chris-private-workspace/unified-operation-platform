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
