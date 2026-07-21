import { describe, expect, it } from 'vitest';
import { AUDIT_ACTION_OPTIONS, auditActionTone } from './audit';
import { activityIcon, activitySummary, activityTone } from './activity';
import type { AuditEntry } from './api-types';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  createdAt: '2026-07-21T03:00:00.000Z',
  action: 'user.role_change',
  targetType: 'AppUser',
  targetId: 'clx9k2m4a0000qwer1234abcd',
  actorId: 'u-admin',
  actor: { email: 'admin@uop.local', displayName: 'Alice Wong' },
  actorType: 'user',
  before: null,
  after: null,
  metadata: null,
  ...over,
});

describe('activitySummary — wording (CH-005 D2)', () => {
  /**
   * The hard line of this change. The feed LOOKS like the prototype's activity
   * stream, but it is fed by AuditLog — configuration and account changes, not
   * the licence-operations flow the prototype mocked up ("Alex Tan assigned
   * Office 365 F3 to may.chan@…", which lives in RequestEvent and has no read
   * surface). If someone later rewrites these labels in operational voice the
   * feed starts claiming things it cannot know. This test fails first.
   */
  it('never phrases an audit event in operational voice', () => {
    for (const action of AUDIT_ACTION_OPTIONS) {
      const { text } = activitySummary(entry({ action }));
      expect(text.toLowerCase()).not.toContain('assigned');
      expect(text.toLowerCase()).not.toContain('provisioned');
      // " to " is how the prototype narrates a seat landing on a person.
      expect(text.toLowerCase()).not.toContain(' to ');
    }
  });

  it('gives every backend action its own label — none falls through to raw', () => {
    for (const action of AUDIT_ACTION_OPTIONS) {
      const { text } = activitySummary(entry({ action }));
      // A fallthrough would surface the dotted action verbatim.
      expect(text).not.toContain(action);
    }
  });

  it('names the actor', () => {
    expect(activitySummary(entry()).text).toBe('Role changed — Alice Wong');
  });

  it('attributes a platform-enforced event to the system, not a person', () => {
    const { text } = activitySummary(
      entry({
        action: 'auth.locked',
        actor: null,
        actorId: null,
        actorType: 'system',
      }),
    );
    expect(text).toBe('Account locked — system');
  });

  /**
   * A failed sign-in for an address with no account: auth.service.ts records
   * actorId null but leaves actorType at its 'user' default. Printing the bare
   * word "user" reads like a username, so it degrades to an explicit unknown.
   */
  it('does not print the literal word "user" as an actor name', () => {
    const { text } = activitySummary(
      entry({
        action: 'auth.login_failed',
        actor: null,
        actorId: null,
        actorType: 'user',
      }),
    );
    expect(text).toBe('Sign-in failed — Unknown user');
  });
});

describe('activitySummary — target ref', () => {
  it('shortens a cuid so the row stays scannable', () => {
    expect(activitySummary(entry()).ref).toBe('AppUser · 34abcd');
  });

  /**
   * auth.service.ts:294 writes the literal string 'unknown' when the attempted
   * address has no account — deliberately, so PII stays out of the indexed
   * targetId. Blind tail-slicing would render that as "nknown".
   */
  it('leaves a non-id target marker intact', () => {
    const { ref } = activitySummary(
      entry({ action: 'auth.login_failed', targetId: 'unknown' }),
    );
    expect(ref).toBe('AppUser · unknown');
  });
});

describe('activitySummary — unknown action (backend ahead of frontend)', () => {
  it('falls back to the raw action instead of crashing or guessing', () => {
    const { text } = activitySummary(
      entry({ action: 'request.something_new' }),
    );
    expect(text).toBe('request.something_new — Alice Wong');
  });
});

describe('activityTone / activityIcon', () => {
  /**
   * Tone is NOT re-derived here — it delegates to the /audit page's mapping so
   * the same event cannot read as routine in one view and alarming in another.
   */
  it('delegates tone to the audit page mapping', () => {
    for (const action of AUDIT_ACTION_OPTIONS) {
      expect(activityTone(action)).toBe(auditActionTone(action));
    }
  });

  /**
   * Asserted against the fallback rather than by identity: a missing entry in
   * ACTION_ICON is silent at runtime (every action still renders SOMETHING), so
   * the only observable failure is that it renders the generic glyph.
   */
  it('gives every known action its own icon, not the generic fallback', () => {
    const fallback = activityIcon('totally.unknown.action');
    expect(fallback).toBeDefined();
    for (const action of AUDIT_ACTION_OPTIONS) {
      expect(activityIcon(action)).not.toBe(fallback);
    }
  });
});
