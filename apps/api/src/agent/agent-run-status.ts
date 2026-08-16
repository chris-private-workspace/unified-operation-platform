/**
 * Two facts about agent runs that more than one file in this module needs.
 *
 * 🔴 Pulled out of `ai-assist.service.ts` by 期二 G3 for a mechanical reason, not
 * a stylistic one: the kill switch has to answer "is anything still in flight",
 * and `AiAssistService` has to ask the kill switch "am I allowed to run". Left
 * where they were, those two needs form an import cycle — and a cycle between a
 * service and its own gate is the kind that works until the day module
 * initialisation order changes.
 */

/** `AgentPrincipal.name` for this capability (ADR-0036 D7 — a principal, not a Role). */
export const AI_ASSIST_PRINCIPAL = 'ai-assist';

/**
 * Statuses a run can still leave under its own power.
 *
 * plan OQ-3: one request may have at most one run in this set. 🔴 Enforced in
 * the service, not by a DB constraint — "not finished" is a SET of values, and
 * a partial unique index over a set is not something Prisma can express. A
 * constraint that cannot be written is worse than a guard that can, because the
 * schema would look like it were carrying the rule.
 *
 * 期二 G3 reads the same set for a second question: a run in one of these
 * statuses is agent-originated work that has not finished, which is exactly
 * what "the switch is off but the system has not settled" means.
 */
export const NON_TERMINAL_RUN_STATUSES = [
  'running',
  'awaiting_approval',
  'approved',
] as const;
