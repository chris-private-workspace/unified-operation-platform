import type { BadgeTone } from '@/components/ui/badge';
import type { ConnectorState } from './api-types';

// Pure helpers for the Integrations panel (W30 / ADR-0010 item 4).

/**
 * `state` describes deployment shape, so none of these are alarming — a failed
 * probe is reported separately and never changes the badge (plan §9 Q3).
 * `inactive` is warn rather than danger: an unselected optional connector is a
 * configuration choice, not a fault.
 */
export function connectorStateTone(state: ConnectorState): BadgeTone {
  switch (state) {
    case 'required':
      return 'ok';
    case 'active':
      return 'info';
    case 'inactive':
      return 'warn';
    default:
      return 'neutral';
  }
}

/**
 * Wording matters here: "Required" must not read as "healthy". It says the
 * platform cannot boot without this config — nothing about whether the vendor
 * is reachable right now.
 */
export function connectorStateLabel(state: ConnectorState): string {
  switch (state) {
    case 'required':
      return 'Required';
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Not in use';
    default:
      return 'Unknown';
  }
}

/**
 * The "last worked" line. Deliberately NOT called a health check: the timestamp
 * is derived from domain data (ADR-0010 D4), so it says when the connector last
 * demonstrably did something — not when it was last tested. When it cannot be
 * derived at all we show the reason instead of a blank, so nobody reads an
 * empty cell as "never worked".
 */
export function lastSuccessText(
  lastSuccessAt: string | null,
  lastSuccessNote: string | null,
  format: (iso: string | null) => string,
): string {
  if (lastSuccessAt) return `Last succeeded ${format(lastSuccessAt)}`;
  if (lastSuccessNote) return lastSuccessNote;
  return 'No recorded activity yet';
}
