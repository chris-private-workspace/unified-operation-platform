import {
  ArrowRight,
  FileText,
  RefreshCw,
  Scale,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from './tones';
import type { ActivityEvent, EventType } from './api-types';
import { STAGE_LABEL } from './requests';

// Pure helpers for the Overview activity feed (CH-006). The feed shows what
// happened to REQUESTS — assignments, stage moves, sync — which is what the
// prototype's activity stream always depicted. The audit trail (configuration
// and account changes) lives on /audit and is not mixed in here: with a 6-row
// tail, sign-in events alone would crowd out every operational row.

/**
 * Event type → semantic tone (design-system.md DS-8).
 *
 * Exported and imported by the request-detail timeline rather than duplicated
 * there: two mappings would let the same event read as routine on one screen
 * and notable on the other.
 */
export const EVENT_TONE: Record<EventType, BadgeTone> = {
  STAGE_CHANGE: 'info',
  ASSIGN: 'ok',
  SYNC: 'info',
  RECONCILE: 'warn',
  NOTE: 'neutral',
};

const EVENT_ICON: Record<EventType, LucideIcon> = {
  STAGE_CHANGE: ArrowRight,
  ASSIGN: UserCheck,
  SYNC: RefreshCw,
  RECONCILE: Scale,
  NOTE: FileText,
};

/**
 * Last-resort wording, used only when an event carries neither a message nor a
 * stage pair. RECONCILE is listed for completeness — no write site produces it
 * today, so it is mapped rather than advertised.
 */
const EVENT_LABEL: Record<EventType, string> = {
  STAGE_CHANGE: 'Stage changed',
  ASSIGN: 'Licence assigned',
  SYNC: 'Directory sync confirmed',
  RECONCILE: 'Reconciled',
  NOTE: 'Note added',
};

export function eventTone(type: EventType): BadgeTone {
  return EVENT_TONE[type];
}

export function eventIcon(type: EventType): LucideIcon {
  return EVENT_ICON[type] ?? FileText;
}

/**
 * One feed row: what happened (+ who), and which request it belongs to.
 * `ref` is rendered muted and mono next to the text, mirroring the prototype.
 */
export function eventSummary(event: ActivityEvent): {
  text: string;
  ref: string;
} {
  const what = describe(event);
  return {
    // SYNC / NOTE are written by the platform itself, with no actor. Appending
    // a placeholder there would read like someone's name.
    text: event.actorName ? `${what} — ${event.actorName}` : what,
    ref: event.requestRef,
  };
}

/**
 * Prefer the event's own message — it is the most specific thing available
 * ("Assigned SPE_E3"). STAGE_CHANGE writes no message (stage.service.ts), so
 * its text is built from the stage pair using the labels the Requests screens
 * already use.
 */
function describe(event: ActivityEvent): string {
  if (event.message) return event.message;
  if (event.fromStage && event.toStage) {
    return `${cap(STAGE_LABEL[event.fromStage])} → ${STAGE_LABEL[event.toStage]}`;
  }
  return EVENT_LABEL[event.type];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
