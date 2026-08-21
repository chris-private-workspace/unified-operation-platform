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
 *
 * 🔴 A run parked on a proposal is live but NOT working — it is waiting for a
 * PERSON. Found in the `F5-3` render (2026-08-18): the screen showed "Thinking…"
 * directly above "AI-Assist has proposed something", because one run satisfies
 * this and `runAwaitingDecision` at the same time. A spinner tells somebody to
 * wait for an answer that will never arrive until they go and decide — the
 * mirror of `R16`, where a stall reads as progress.
 */
export function isThinking(runs: AgentConversationRun[] | undefined): boolean {
  if (!runs || runs.length === 0) return false;
  const latest = runs[runs.length - 1];
  if (latest.status === 'awaiting_approval') return false;
  return isLiveRun(latest.status);
}

/**
 * CH-035 — the statuses that END a run without an answer.
 *
 * 🔴 Both of these write a `whoFixes` on the step that ended them (`failRun` →
 * `platform`, `expireRun` → `operator`), which is what makes them the same
 * shape and why `DEV-1` widened this beyond the `failed` the spec asked for.
 *
 * 🔴 `aborted` is deliberately NOT here. Somebody pressed Stop — the thread has
 * no answer because a person decided it should not have one, and there is
 * nothing for anybody to fix. It writes no failed step at all, so there would be
 * nothing to say beyond what the person already knows they did.
 *
 * ⚠️ Written as the explicit BAD set rather than "terminal and not completed",
 * the opposite of `LIVE_STATUSES` above — and the asymmetry is on purpose. That
 * one had to fail safe for statuses nobody has invented yet; this one must not
 * claim a failure it cannot describe, so a new status stays silent here until
 * somebody decides what it means.
 */
const FAILED_STATUSES: AgentRunStatus[] = ['failed', 'expired'];

/**
 * The run that ended badly and left the thread with nothing, if that is what
 * happened to the last thing the person asked.
 *
 * 🔴 The LATEST run only — the rule `isThinking` established, for the same
 * reason: a thread accumulates one run per turn, and a failure three questions
 * ago has already been answered by the two successful turns after it. Asking
 * "did any run fail" would put a permanent error on a working thread.
 *
 * 🔴 Returns the RUN, not a boolean, because the caller needs `whoFixes` off it.
 * A boolean would push the second lookup back into the component, which is
 * where this file's header says rules must not live.
 */
export function latestRunFailure(
  runs: AgentConversationRun[] | undefined,
): AgentConversationRun | null {
  if (!runs || runs.length === 0) return null;
  const latest = runs[runs.length - 1];
  return FAILED_STATUSES.includes(latest.status) ? latest : null;
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
