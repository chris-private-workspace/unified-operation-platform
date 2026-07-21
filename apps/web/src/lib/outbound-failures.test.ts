import { describe, expect, it } from 'vitest';
import {
  FAILURE_KINDS,
  failureKindMeta,
  failureStatusTone,
  repairAction,
} from './outbound-failures';

describe('repair action wording — the UI half of ADR-0011 D3', () => {
  /**
   * 🔴 The hard line. A `request.mirror` failure means a REAL ServiceNow ticket
   * already exists; its repair writes local rows ONLY. If this button ever says
   * "Resubmit" / "Send again", an operator will reasonably believe pressing it
   * re-contacts ServiceNow — and the one thing that must never happen here is a
   * second ticket. The backend refuses regardless (G2), but the label must not
   * invite the misunderstanding in the first place.
   */
  it('never describes a mirror repair as sending or submitting anything', () => {
    const { label, hint } = repairAction('request.mirror');
    const text = `${label} ${hint}`.toLowerCase();

    expect(text).not.toContain('submit');
    expect(text).not.toContain('resend');
    expect(text).not.toContain('send again');
    expect(text).not.toContain('retry the ticket');
  });

  it('says explicitly that a mirror repair does not touch ServiceNow', () => {
    const { hint } = repairAction('request.mirror');
    expect(hint).toMatch(/without contacting ServiceNow|does not contact/i);
  });

  /** The other two DO reach outward — their wording should say so. */
  it('describes a submit repair as actually creating the ticket', () => {
    const { label } = repairAction('request.submit');
    expect(label.toLowerCase()).toContain('submit');
  });

  it('describes a work-note repair as sending the note', () => {
    const { label } = repairAction('servicenow.worknote');
    expect(label.toLowerCase()).toMatch(/send|note/);
  });

  it('gives every kind its own action — no shared generic "Retry"', () => {
    const labels = FAILURE_KINDS.map((k) => repairAction(k).label);
    expect(new Set(labels).size).toBe(FAILURE_KINDS.length);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toBe('retry');
    }
  });
});

describe('failureKindMeta', () => {
  it('labels each kind by what actually went wrong', () => {
    expect(failureKindMeta('request.submit').label).toMatch(/not created/i);
    expect(failureKindMeta('request.mirror').label).toMatch(/not recorded/i);
    expect(failureKindMeta('servicenow.worknote').label).toMatch(/note/i);
  });

  /**
   * The mirror kind is the only one where ServiceNow and the platform actually
   * disagree — it should not read the same as a clean, nothing-happened failure.
   */
  it('tints the divergent kind more severely than the clean ones', () => {
    expect(failureKindMeta('request.mirror').tone).toBe('danger');
    expect(failureKindMeta('request.submit').tone).toBe('warn');
    expect(failureKindMeta('servicenow.worknote').tone).toBe('neutral');
  });

  it('falls back rather than crashing on an unknown kind', () => {
    const meta = failureKindMeta('something.new');
    expect(meta.label).toBe('something.new');
    expect(meta.tone).toBe('neutral');
  });
});

describe('failureStatusTone', () => {
  it('does not tint a resolved row as a problem', () => {
    expect(failureStatusTone('resolved')).toBe('ok');
    expect(failureStatusTone('open')).toBe('warn');
    // Abandoned is a decision, not a fault — same reasoning as W30's
    // "Not in use" for an unselected connector.
    expect(failureStatusTone('abandoned')).toBe('neutral');
  });
});
