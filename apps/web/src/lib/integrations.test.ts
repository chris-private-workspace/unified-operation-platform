import { describe, expect, it } from 'vitest';
import {
  connectorStateLabel,
  connectorStateTone,
  lastSuccessText,
} from './integrations';

const fmt = (iso: string | null) => (iso ? 'Jul 21, 03:00' : '—');

describe('connector state display (W30)', () => {
  it('maps every state to a token tone', () => {
    expect(connectorStateTone('required')).toBe('ok');
    expect(connectorStateTone('active')).toBe('info');
    // Not danger — an unselected optional connector is a choice, not a fault.
    expect(connectorStateTone('inactive')).toBe('warn');
  });

  it('labels inactive as "Not in use" rather than an error word', () => {
    expect(connectorStateLabel('required')).toBe('Required');
    expect(connectorStateLabel('active')).toBe('Active');
    expect(connectorStateLabel('inactive')).toBe('Not in use');
  });
});

describe('lastSuccessText', () => {
  // Wording guard: this is derived from domain data, not a health check.
  it('says "succeeded", never "checked"', () => {
    const text = lastSuccessText('2026-07-21T03:00:00.000Z', null, fmt);
    expect(text).toContain('Last succeeded');
    expect(text.toLowerCase()).not.toContain('check');
  });

  /**
   * Q1 (Chris, 2026-07-21): n8n inbound cannot be derived, so the row states
   * why instead of rendering a blank someone would read as "never worked".
   */
  it('shows the stated reason when a timestamp can never be derived', () => {
    const text = lastSuccessText(
      null,
      'Cannot be distinguished from other requests in existing data',
      fmt,
    );
    expect(text).toMatch(/cannot be distinguished/i);
  });

  it('distinguishes "no activity yet" from "cannot be derived"', () => {
    expect(lastSuccessText(null, null, fmt)).toBe('No recorded activity yet');
  });

  // A real timestamp wins over a note if both somehow arrive.
  it('prefers the timestamp when both are present', () => {
    expect(
      lastSuccessText('2026-07-21T03:00:00.000Z', 'some note', fmt),
    ).toContain('Last succeeded');
  });
});
