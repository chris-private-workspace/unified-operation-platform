import type { BadgeTone } from './tones';

// Pure helpers for the delivery-failure queue (W31 F4 / ADR-0011). Mirrors the
// backend's OUTBOUND_FAILURE_KINDS — hand-written like the rest of api-types
// (OD2-A: no generated client).

export const FAILURE_KINDS = [
  'request.submit',
  'request.mirror',
  'servicenow.worknote',
] as const;

export const FAILURE_STATUSES = ['open', 'resolved', 'abandoned'] as const;

interface KindMeta {
  label: string;
  /** What state the world is in — the operator's first question. */
  detail: string;
  tone: BadgeTone;
}

const KIND_META: Record<string, KindMeta> = {
  'request.submit': {
    label: 'Ticket not created',
    detail:
      'Nothing was written anywhere. The request never reached ServiceNow.',
    tone: 'warn',
  },
  /**
   * The only kind where ServiceNow and the platform actually disagree, so it
   * reads more severely than the two clean ones: a real ticket is sitting in
   * ServiceNow that this platform has no record of.
   */
  'request.mirror': {
    label: 'Ticket created, not recorded',
    detail:
      'The ServiceNow ticket exists but the platform has no record of it. Until repaired, the two disagree.',
    tone: 'danger',
  },
  'servicenow.worknote': {
    label: 'Work note not sent',
    detail:
      'The licence was assigned successfully — only the note back to ServiceNow failed.',
    tone: 'neutral',
  },
};

export function failureKindMeta(kind: string): KindMeta {
  return (
    KIND_META[kind] ?? {
      label: kind,
      detail: 'Unrecognised failure kind — inspect before repairing.',
      tone: 'neutral',
    }
  );
}

interface RepairAction {
  label: string;
  hint: string;
}

/**
 * 🔴 The UI half of ADR-0011 Decision 3.
 *
 * There is deliberately NO generic "Retry" here. The three kinds do different
 * things, and one of them must not read as if it contacts ServiceNow: repairing
 * a `request.mirror` failure writes local rows only, because the ticket already
 * exists. A button labelled "Resubmit" would invite exactly the duplicate the
 * whole decision exists to prevent — the backend refuses it either way (G2),
 * but the operator should never form the wrong expectation. Guarded by test.
 */
const REPAIR: Record<string, RepairAction> = {
  'request.submit': {
    label: 'Submit to ServiceNow',
    hint: 'Creates the ticket that was never created, then records it locally.',
  },
  'request.mirror': {
    label: 'Record locally',
    hint: 'Writes the platform’s record using the existing ticket reference, without contacting ServiceNow.',
  },
  'servicenow.worknote': {
    label: 'Send note again',
    hint: 'Re-sends the work note. Harmless if it arrived after all — a duplicate note is not a problem.',
  },
};

export function repairAction(kind: string): RepairAction {
  return (
    REPAIR[kind] ?? {
      label: 'Repair',
      hint: 'Unrecognised failure kind — the backend decides what is safe.',
    }
  );
}

export function failureStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'resolved':
      return 'ok';
    case 'open':
      return 'warn';
    // A decision, not a fault — same reasoning as W30's "Not in use".
    case 'abandoned':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function failureStatusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Needs repair';
    case 'resolved':
      return 'Repaired';
    case 'abandoned':
      return 'Abandoned';
    default:
      return status;
  }
}

/** "3 attempts" reads better than a bare number next to a date. */
export function attemptText(count: number): string {
  return count === 1 ? '1 attempt' : `${count} attempts`;
}
