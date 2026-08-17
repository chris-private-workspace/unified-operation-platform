/**
 * W46 F11-1b — operator-facing names for `AgentStep.key`.
 *
 * 🔴 In its own file, and that is not tidiness. `AgentStep.key` is a `string`,
 * so the card's `STEP_LABEL[key] ?? key` fallback accepts anything — including a
 * snake_case tool name added to the platform's registry by someone who never
 * opened the card. The map beside it in the card, `MESSAGE_LABEL`, IS
 * type-guarded (`Record<AgentMessage['role'], string>`) and the two are spelled
 * identically; the whole difference lives in the upstream type.
 *
 * So the rule "a raw key never reaches the screen" needs an enforcer, and it is
 * `ai-assist-step-labels.test.ts` — which reads the API's tool registry and
 * fails when this map falls behind it. Exporting from the card file itself
 * would have worked, but it breaks fast refresh (react-refresh only handles
 * files that export components), and the lint rule is right: a shared constant
 * belongs somewhere shareable.
 */
export const STEP_LABEL: Record<string, string> = {
  start: 'Run started',
  proposal: 'Proposal raised for review',
  abort: 'Run stopped',
  run: 'Run',
  // 期二 G5 — worded so the row says WHY it ended without anyone acting. "Run
  // expired" alone would read as a system fault; the detail line carries the
  // threshold, and this carries the fact that the clock, not a person, ended it.
  expired: 'Expired without a decision',
  get_request: 'Read the request',
  list_pending_requests: 'Listed open requests',
  search_catalog: 'Searched the catalogue',
  get_ledger: 'Checked the OpCo ledger',
  propose_line_items: 'Proposed line items',
  propose_assign: 'Proposed assigning the licence',
};
