import type { AgentRunStatus } from '@/lib/api-types';
import type { BadgeTone } from '@/lib/tones';

// W47 — pure helpers for the agent registry screen. They live here rather than
// in the page for the reason `lib/audit.ts` and `lib/user-admin.ts` do: a
// status→tone map inside a component cannot be tested on its own, and the second
// surface that needs it copies rather than imports.

/**
 * Longest prompt the server will store (`MAX_PROMPT_LENGTH`).
 *
 * ⚠️ Duplicated from the API on purpose — the alternative is the dialog letting
 * somebody type 12,000 characters and lose them to a 400. The server's copy is
 * the authority; this one only decides what the form offers.
 */
export const PROMPT_MAX_LENGTH = 8000;

export const RUN_STATUS_OPTIONS: AgentRunStatus[] = [
  'running',
  'awaiting_approval',
  'approved',
  'rejected',
  'completed',
  'failed',
  'aborted',
  'expired',
];

/**
 * Run status → Badge tone (DS-8).
 *
 * 🔴 `awaiting_approval` is `warn`, not `info`: it is the one status that means
 * a PERSON has to do something, and the whole point of `R13` is that runs nobody
 * reviewed stay visible. `expired` is `danger` rather than `neutral` for the
 * same reason — it means nobody got to it in time, which is a worse outcome than
 * somebody stopping the run on purpose (`aborted`, neutral).
 */
export function runStatusTone(status: AgentRunStatus): BadgeTone {
  switch (status) {
    case 'completed':
      return 'ok';
    case 'awaiting_approval':
      return 'warn';
    case 'running':
    case 'approved':
      return 'info';
    case 'failed':
    case 'expired':
      return 'danger';
    case 'rejected':
    case 'aborted':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Sentence-case label for a status (DS-10: no UPPERCASE outside structural labels). */
export function runStatusLabel(status: AgentRunStatus): string {
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export interface AgentRunFilters {
  status?: string;
  profileId?: string;
  limit?: number;
  cursor?: string;
}

/** Query string for GET /agent/runs — only the parts that were actually set. */
export function agentRunsQueryString(filters: AgentRunFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.profileId) params.set('profileId', filters.profileId);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export interface ProfileForm {
  name: string;
  model: string;
  prompt: string;
}

/**
 * What is wrong with the form, or null when it is submittable.
 *
 * Same shape as `validateCreateUser`: the return value drives the submit
 * button's `disabled`, so an invalid form cannot be sent rather than being sent
 * and refused. The server validates independently — this only decides what the
 * dialog offers.
 */
export function validateProfileForm(form: ProfileForm): string | null {
  if (!form.name.trim()) return 'A name is required.';
  if (form.name.trim().length > 80)
    return 'A name can be at most 80 characters.';
  if (!form.model.trim()) return 'A model is required.';
  if (form.model.trim().length > 120)
    return 'A model can be at most 120 characters.';
  if (form.prompt.length > PROMPT_MAX_LENGTH)
    return `A prompt can be at most ${PROMPT_MAX_LENGTH} characters.`;
  return null;
}
