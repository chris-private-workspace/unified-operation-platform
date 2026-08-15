import type { AgentToolContext } from './agent-tool';

/**
 * Seam ⑤ of ADR-0017 — the agent EXECUTION boundary (W46 F3 / ADR-0036).
 *
 * The platform decides what an agent may do (the tool registry), what it may
 * see (OpCo scope), and what happens when it proposes something (a human).
 * This provider only drives the loop. That is ADR-0017 D0, applied a fifth
 * time, and it is why nothing here can refuse on policy grounds: a runtime that
 * could say "no" would be making a decision, and the two implementations would
 * then differ in behaviour rather than only in vendor.
 *
 * Two implementations:
 *   OpenAiAgentsProvider     (default, F3)  — @openai/agents
 *   ClaudeToolRunnerProvider (期二 G4)      — @anthropic-ai/sdk tool_runner
 *
 * 🔴 Both consume the SAME AgentToolRegistry (D1). An adapter converts shapes
 * and nothing else — no business logic, no second allow-list, no per-runtime
 * tweak. If an adapter ever needs to decide something, the decision belongs in
 * the registry instead.
 */

export const AGENT_RUNTIMES = ['openai-agents', 'claude-tool-runner'] as const;
export type AgentRuntimeName = (typeof AGENT_RUNTIMES)[number];

/**
 * A write tool the runtime stopped in front of.
 *
 * `ref` is the runtime's own identifier for this pause, and it exists so the
 * platform's approval record can be matched back to the exact tool call when
 * the run resumes (D3 step 4). It travels to `AgentProposal.interruptionRef`.
 *
 * ⚠️ `args` is whatever the model produced. It has NOT been validated — the
 * tool re-validates on execution — so nothing downstream may treat it as a
 * fact about the catalogue. It is here so a human can read what they are being
 * asked to approve.
 */
export interface PendingApproval {
  ref: string;
  toolName: string;
  args: unknown;
}

export interface ApprovalDecision {
  ref: string;
  approved: boolean;
  /** Sent back to the model on a rejection so it can react rather than retry. */
  reason?: string;
}

/** What stays constant across a run and its later resumption. */
export interface AgentSetup {
  instructions: string;
  ctx: AgentToolContext;
}

/**
 * The normalised result of one stretch of execution — ADR-0017 D2 calls this
 * vocabulary the core design work of a seam, and it is, because the two
 * runtimes express "I stopped to ask" in shapes that do not resemble each
 * other.
 */
export interface AgentTurn {
  /**
   * `awaiting_approval` is not a failure and not a partial success — it is the
   * design working. Collapsing it into `completed` (with the approvals as a
   * side note) is how a run that never finished ends up recorded as one that
   * did.
   */
  status: 'completed' | 'awaiting_approval';
  /**
   * Serialised runtime state, for `AgentRun.runState`.
   *
   * 🔴 NOT audit truth (D4) — AgentStep and AgentProposal are. It is an opaque
   * vendor structure, which is exactly R16: an SDK upgrade can make an old
   * `awaiting_approval` run un-resumable, and that must fail loudly rather than
   * quietly report success.
   */
  state: string;
  pendingApprovals: PendingApproval[];
  /**
   * ⚠️ Raw, un-normalised runtime items — the transcript source.
   *
   * Deliberately NOT normalised here: turning these into `AgentMessage` rows is
   * F5's job, because that is where `scrubPii` has to be applied (D6) and where
   * the authority-level distinction gets written down. Passing them through
   * un-normalised is honest about the fact that F3 has not interpreted them;
   * inventing a shape now would mean two interpretations to keep in step.
   */
  providerItems: unknown[];
  finalOutput?: string;
}

/**
 * Abstract class rather than an interface + string token, for the same reason
 * as `LicenseOperationsProvider`: Nest can use the class itself as the DI
 * token, so wiring stays type-safe with no magic string to keep in sync.
 */
export abstract class AgentRuntimeProvider {
  abstract readonly runtime: AgentRuntimeName;

  /** Begin a run. Stops early — and reports `awaiting_approval` — on a write tool. */
  abstract start(setup: AgentSetup, input: string): Promise<AgentTurn>;

  /**
   * Continue a run a human has decided on.
   *
   * 🔴 `decisions` carries what a PERSON decided, read back out of the
   * platform's own tables. The runtime's internal approval state is never the
   * source: it has no actor, no timestamp, no audit trail, and never appears on
   * an admin screen — and "who approved what" is the only reason Tier 1 exists.
   */
  abstract resume(
    setup: AgentSetup,
    state: string,
    decisions: ApprovalDecision[],
  ): Promise<AgentTurn>;
}
