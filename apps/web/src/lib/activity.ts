import {
  Building2,
  CheckCheck,
  KeyRound,
  Lock,
  LogIn,
  Package,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCog,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from './tones';
import { auditActionTone } from './audit';
import type { AuditEntry } from './api-types';

// Pure helpers for the Overview activity feed (CH-005). The feed renders the
// prototype's activity layout but is fed by AuditLog, so the wording stays in
// audit voice — see the wording guard in activity.test.ts for why.

/**
 * Human label per action. Deliberately noun-ish and passive ("Role changed",
 * not "Alice changed Bob's role"): the row already names the actor, and an
 * active-voice sentence invites the operational phrasing this feed must not
 * claim. Every AUDIT_ACTION_OPTIONS entry appears here; unknown actions (a
 * backend running ahead of this build) fall back to the raw action string
 * rather than being guessed at or dropped.
 */
const ACTION_LABEL: Record<string, string> = {
  'user.create': 'User created',
  'user.update': 'User updated',
  'user.role_change': 'Role changed',
  'user.deactivate': 'User deactivated',
  'user.password_reset': 'Password reset',
  'user.password_change': 'Password changed',
  'auth.login_success': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.locked': 'Account locked',
  'opco.create': 'OpCo created',
  'opco.update': 'OpCo updated',
  'catalog.update': 'Catalog entry updated',
  'allocation.import': 'Allocation imported',
  'drift.resolve': 'Drift alert resolved',
};

const ACTION_ICON: Record<string, LucideIcon> = {
  'user.create': UserPlus,
  'user.update': UserCog,
  'user.role_change': ShieldCheck,
  'user.deactivate': UserMinus,
  'user.password_reset': KeyRound,
  'user.password_change': KeyRound,
  'auth.login_success': LogIn,
  'auth.login_failed': ShieldAlert,
  'auth.locked': Lock,
  'opco.create': Building2,
  'opco.update': Building2,
  'catalog.update': Package,
  'allocation.import': Upload,
  'drift.resolve': CheckCheck,
};

/** Unknown action → the same neutral glyph the /audit page uses for the trail. */
const FALLBACK_ICON = ScrollText;

/**
 * Tone delegates to the /audit page's mapping rather than re-deriving it: two
 * mappings would let the same event read as routine in one view and alarming in
 * the other.
 */
export function activityTone(action: string): BadgeTone {
  return auditActionTone(action);
}

export function activityIcon(action: string): LucideIcon {
  return ACTION_ICON[action] ?? FALLBACK_ICON;
}

/**
 * One feed row: what happened (+ who), and which record it touched.
 * `ref` is rendered muted next to the text, mirroring the prototype's layout.
 */
export function activitySummary(entry: AuditEntry): {
  text: string;
  ref: string;
} {
  const label = ACTION_LABEL[entry.action] ?? entry.action;
  return {
    text: `${label} — ${actorLabel(entry)}`,
    ref: `${entry.targetType} · ${shortTarget(entry.targetId)}`,
  };
}

/**
 * A failed sign-in for an address with no account has actorId null while
 * actorType keeps its 'user' default (auth.service.ts:294) — printing the bare
 * word "user" there would read like someone's name.
 */
function actorLabel(entry: AuditEntry): string {
  if (entry.actor) return entry.actor.displayName;
  return entry.actorType === 'user' ? 'Unknown user' : entry.actorType;
}

/**
 * cuids are too long to scan in a feed row, but targetId is not always an id:
 * auth.service.ts writes the literal 'unknown' when the attempted address has
 * no account, keeping PII out of the indexed column. Tail-slicing that would
 * render "nknown", so only id-length values are shortened.
 */
function shortTarget(targetId: string): string {
  return targetId.length > 12 ? targetId.slice(-6) : targetId;
}
