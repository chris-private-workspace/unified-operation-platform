import { describe, expect, it } from 'vitest';
import { EVENT_TONE, eventIcon, eventSummary, eventTone } from './activity';
import { STAGE_LABEL } from './requests';
import type { ActivityEvent, EventType } from './api-types';

const ALL_TYPES: EventType[] = [
  'STAGE_CHANGE',
  'ASSIGN',
  'SYNC',
  'RECONCILE',
  'NOTE',
];

const event = (over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: 'ev1',
  type: 'ASSIGN',
  fromStage: 'READY',
  toStage: 'ASSIGNED',
  message: 'Assigned SPE_E3',
  createdAt: '2026-07-21T03:00:00.000Z',
  actorName: 'Alex Tan',
  requestId: 'req-abc123def456',
  requestRef: 'REQ0012345',
  ...over,
});

describe('eventSummary — text', () => {
  it('prefers the event message and names the actor', () => {
    expect(eventSummary(event()).text).toBe('Assigned SPE_E3 — Alex Tan');
  });

  /**
   * stage.service.ts writes STAGE_CHANGE with fromStage/toStage but NO message,
   * so this branch is the normal path for stage moves, not an edge case.
   */
  it('builds stage-move text from the stage pair when there is no message', () => {
    const { text } = eventSummary(
      event({
        type: 'STAGE_CHANGE',
        message: null,
        fromStage: 'QUOTING',
        toStage: 'READY',
      }),
    );
    expect(text).toBe('Quoting → ready — Alex Tan');
  });

  /**
   * Delegation guard (same idea as CH-005 delegating tone to the audit page):
   * stage wording comes from the Requests screens' labels, so a stage cannot be
   * called one thing in the feed and another on /requests.
   */
  it('uses the same stage labels as the Requests screens', () => {
    const { text } = eventSummary(
      event({
        type: 'STAGE_CHANGE',
        message: null,
        fromStage: 'AWAITING_VENDOR',
        toStage: 'READY',
      }),
    );
    // Case-insensitive on the leading stage: the row is a sentence, so its
    // first word is capitalised (DS-10). The vocabulary is what must match.
    expect(text.toLowerCase()).toContain(STAGE_LABEL.AWAITING_VENDOR);
    expect(text.toLowerCase()).toContain(STAGE_LABEL.READY);
  });

  /**
   * SYNC / NOTE are written by the platform with actorId null. Appending a
   * placeholder ("— system", "— Unknown user") would invent an author for an
   * event nobody performed; the row simply carries no attribution.
   */
  it('omits attribution entirely for platform-written events', () => {
    const { text } = eventSummary(
      event({
        type: 'SYNC',
        actorName: null,
        message: 'Phase 1 sync confirmed (azureSyncedAt set)',
      }),
    );
    expect(text).toBe('Phase 1 sync confirmed (azureSyncedAt set)');
    expect(text).not.toContain('—');
  });

  /**
   * Robustness across the whole enum: an event with neither message nor stages
   * must still read as a sentence. A missing branch would surface "undefined"
   * or "null" to the operator.
   */
  it('never renders a null-ish placeholder for any event type', () => {
    for (const type of ALL_TYPES) {
      const { text } = eventSummary(
        event({ type, message: null, fromStage: null, toStage: null }),
      );
      expect(text).toBeTruthy();
      expect(text.toLowerCase()).not.toContain('undefined');
      expect(text.toLowerCase()).not.toContain('null');
    }
  });
});

describe('eventSummary — ref', () => {
  it('shows the ServiceNow number when the request has one', () => {
    expect(eventSummary(event()).ref).toBe('REQ0012345');
  });

  // Platform-created requests have no SN number until submission succeeds; the
  // backend already substitutes an id tail, so the feed just renders it.
  it('renders whatever handle the backend resolved', () => {
    expect(eventSummary(event({ requestRef: 'def456' })).ref).toBe('def456');
  });
});

describe('eventTone / eventIcon', () => {
  /**
   * EVENT_TONE is the single source shared with the request-detail timeline
   * (CH-006 B7) — two mappings would let the same event read as routine on one
   * screen and notable on the other.
   */
  it('maps every event type to a tone', () => {
    for (const type of ALL_TYPES) {
      expect(EVENT_TONE[type]).toBeDefined();
      expect(eventTone(type)).toBe(EVENT_TONE[type]);
    }
  });

  it('gives every event type its own icon', () => {
    const icons = ALL_TYPES.map((type) => eventIcon(type));
    expect(new Set(icons).size).toBe(ALL_TYPES.length);
  });
});
