import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_TARGET_TYPE_OPTIONS,
  auditActionTone,
  auditQueryString,
} from './audit';

describe('auditQueryString (W29 F4)', () => {
  it('returns an empty string when no filters are set', () => {
    expect(auditQueryString({})).toBe('');
  });

  it('serialises the set filters and skips empty ones', () => {
    expect(
      auditQueryString({ action: 'user.role_change', targetType: '' }),
    ).toBe('?action=user.role_change');
  });

  it('carries pagination through', () => {
    const qs = auditQueryString({ limit: 50, offset: 100 });
    expect(qs).toContain('limit=50');
    expect(qs).toContain('offset=100');
  });

  it('URL-encodes values', () => {
    expect(auditQueryString({ from: '2026-07-01T00:00:00Z' })).toBe(
      '?from=2026-07-01T00%3A00%3A00Z',
    );
  });
});

describe('auditActionTone (DS-8 semantic map)', () => {
  it('tints security-relevant events', () => {
    expect(auditActionTone('user.role_change')).toBe('warn');
    expect(auditActionTone('auth.login_failed')).toBe('warn');
    expect(auditActionTone('auth.locked')).toBe('danger');
    expect(auditActionTone('drift.resolve')).toBe('ok');
  });

  it('keeps routine changes neutral and unknown actions safe', () => {
    expect(auditActionTone('user.update')).toBe('neutral');
    expect(auditActionTone('some.future_action')).toBe('neutral');
  });
});

describe('filter option constants', () => {
  // Guards against the frontend mirror drifting from the backend AUDIT_ACTIONS
  // in count — a renamed action still needs a human eye, but a forgotten one
  // shows up here.
  it('offers all 13 recorded actions and 5 target types', () => {
    expect(AUDIT_ACTION_OPTIONS).toHaveLength(13);
    expect(AUDIT_TARGET_TYPE_OPTIONS).toHaveLength(5);
  });
});
