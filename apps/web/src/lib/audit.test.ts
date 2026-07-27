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
    // W36 / ADR-0016 — a deliberate budget breach must not render as routine.
    expect(auditActionTone('assign.budget_override')).toBe('warn');
  });

  it('keeps routine changes neutral and unknown actions safe', () => {
    expect(auditActionTone('user.update')).toBe('neutral');
    expect(auditActionTone('some.future_action')).toBe('neutral');
  });
});

describe('filter option constants', () => {
  /**
   * ⚠️ A count against a hard-coded number cannot detect the backend gaining an
   * action — which is exactly what happened: this list is KNOWN to be behind by
   * `outbound.retry` / `outbound.abandon` / `connector.config_update` and the
   * `OutboundFailure` / `ConnectorConfig` target types (W31 + W34 never added
   * their filter options). Left as-is deliberately — closing that gap is not
   * W36's change to make (reported to owner, tracked in BACKLOG). So read this
   * as "the list is this long", NOT "the list is complete".
   */
  it('is the expected length (mirror-drift smoke test only, NOT completeness)', () => {
    expect(AUDIT_ACTION_OPTIONS).toHaveLength(15);
    expect(AUDIT_TARGET_TYPE_OPTIONS).toHaveLength(6);
  });

  // W36 / ADR-0016 R4: the override's whole monitoring story is "an admin can
  // filter for these", so the option existing is part of the feature.
  it('makes budget overrides filterable', () => {
    expect(AUDIT_ACTION_OPTIONS).toContain('assign.budget_override');
    expect(AUDIT_TARGET_TYPE_OPTIONS).toContain('RequestLineItem');
  });

  // Both credential events must be filterable — an auditor asking "what
  // happened to this account's password" needs the admin reset AND the
  // self-service change.
  it('covers both credential events', () => {
    expect(AUDIT_ACTION_OPTIONS).toContain('user.password_reset');
    expect(AUDIT_ACTION_OPTIONS).toContain('user.password_change');
  });
});
