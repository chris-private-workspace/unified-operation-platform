import type { AgentConversationRun, AgentRunStatus } from '@/lib/api-types';

// W48 F5 — pure helpers for the assistant screen. They live here rather than in
// the page for the reason `lib/agent-registry.ts` gives: a rule inside a
// component cannot be tested on its own, and the second surface that needs it
// (the `T2-d` dock) copies rather than imports.

/**
 * Longest single turn the server will store (`MAX_TURN_LENGTH`).
 *
 * ⚠️ Duplicated from the API on purpose — the alternative is the box letting
 * somebody type 6000 characters and lose them to a 400. The server's copy is
 * the authority; this one only decides what the form offers. Same arrangement
 * as `PROMPT_MAX_LENGTH`.
 */
export const TURN_MAX_LENGTH = 4000;

/**
 * The statuses a run can still move on from.
 *
 * ⚠️ Written as the LIVE set rather than the terminal set, copying the choice
 * `agent-run-events.ts` made and for the same reason: a status added later is
 * far more likely to be terminal than live, so the unknown case should read as
 * "finished" rather than leaving a thread saying "Thinking…" forever.
 */
const LIVE_STATUSES: AgentRunStatus[] = [
  'running',
  'awaiting_approval',
  'approved',
];

export function isLiveRun(status: AgentRunStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/**
 * Is the agent still working on the last thing it was asked?
 *
 * 🔴 The LATEST run only. A thread accumulates runs — one per turn — and asking
 * "is any run live" would leave a thread stuck on "Thinking…" because of a run
 * that was abandoned three questions ago.
 */
export function isThinking(runs: AgentConversationRun[] | undefined): boolean {
  if (!runs || runs.length === 0) return false;
  const latest = runs[runs.length - 1];
  return isLiveRun(latest.status);
}

/**
 * The run a person has to go and decide, if there is one.
 *
 * 🔴 `F5-4` / ADR-0041 D8 — this returns a run to LINK TO, never something to
 * approve here. A chat cannot carry an approve button: the whole reason Tier 1
 * is safe is that a person decides with the request in front of them, and a
 * "quick approve" in a chat is exactly the softening D8 was written to forbid.
 *
 * ⚠️ It can only ever be non-null on a thread WITH a request context: the tools
 * that produce a proposal do not exist for a thread without one (D3), so there
 * is no case where this points somewhere the person cannot go.
 */
export function runAwaitingDecision(
  runs: AgentConversationRun[] | undefined,
): AgentConversationRun | null {
  return runs?.find((run) => run.status === 'awaiting_approval') ?? null;
}
