import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Assistant } from './assistant';
import {
  useAgentConversation,
  useAgentConversations,
  useAgentProfileOptions,
} from '@/hooks/queries';
import {
  useAddConversationTurn,
  useArchiveConversation,
  useCreateConversation,
} from '@/hooks/mutations';
import { useAgentConversationEvents } from '@/hooks/agent-conversation-events';
import { ApiError } from '@/lib/api';
import type { AgentConversation, AgentProfileOption } from '@/lib/api-types';

/**
 * W48 F5 — the assistant screen.
 *
 * 🔴 Not tested for "it renders". Every claim below is one the obvious
 * implementation gets wrong, and each fails SILENTLY:
 *
 *   - a thread with no request context looks exactly like one with it, unless
 *     the screen says so — and then "the agent cannot see your requests" is
 *     indistinguishable from "the agent found nothing" (`D3`).
 *   - a proposal is the moment a chat feels like it should have an approve
 *     button. `D8` forbids one in writing, and prose does not fail a build.
 *   - "Thinking…" driven by ANY live run leaves a thread stuck forever on a run
 *     abandoned three questions ago.
 */

vi.mock('@/hooks/queries', () => ({
  useAgentConversations: vi.fn(),
  useAgentConversation: vi.fn(),
  useAgentProfileOptions: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({
  useCreateConversation: vi.fn(),
  useAddConversationTurn: vi.fn(),
  useArchiveConversation: vi.fn(),
}));
vi.mock('@/hooks/agent-conversation-events', () => ({
  useAgentConversationEvents: vi.fn(),
}));

const THREAD = (over: Partial<AgentConversation> = {}): AgentConversation => ({
  id: 'conv-1',
  startedById: 'u-1',
  requestId: null,
  profileId: null,
  archivedAt: null,
  createdAt: '2026-08-18T09:00:00Z',
  updatedAt: '2026-08-18T09:05:00Z',
  turns: [],
  runs: [],
  ...over,
});

const query = <T,>(data: T, over: Record<string, unknown> = {}) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  ...over,
});

const mutation = () =>
  ({ mutate: vi.fn(), isPending: false, isError: false, error: null }) as never;

const AGENTS: AgentProfileOption[] = [
  { id: 'p-1', name: 'ai-assist (gpt-4o)', model: 'gpt-4o' },
  { id: 'p-2', name: 'power-bi-only', model: 'gpt-4o' },
];
const NO_AGENTS: AgentProfileOption[] = [];

/** `F5-12` — one constant, so a rename cannot make one assertion vacuous. */
const PICKER = 'Agent for new conversations';

/**
 * 🔴 CH-032 `D2` — the three sentences this screen shares with the dock.
 *
 * Written out ONCE here, and held against BOTH source files by the scan at the
 * bottom of this file. They are hard-coded rather than imported from either
 * component on purpose: a shared constant would make every assertion below
 * agree with whatever the code currently says, which is the tautology `R1`
 * warns about — the test would go green through a rewording, which is exactly
 * the change it exists to catch.
 */
const AGENTS_FAILED_LINE =
  'Could not load the agent list. Try again in a moment.';
const NO_AGENTS_LINE =
  'No agent is switched on. An admin can turn one on under Agent.';
const DISCONNECTED_LINE =
  'Live updates stopped. Replies may not appear on their own.';

const renderScreen = (path = '/assistant') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Assistant />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(useAgentConversations).mockReturnValue(
    query([THREAD()]) as ReturnType<typeof useAgentConversations>,
  );
  vi.mocked(useAgentConversation).mockReturnValue(
    query(THREAD()) as ReturnType<typeof useAgentConversation>,
  );
  vi.mocked(useAgentProfileOptions).mockReturnValue(
    query(AGENTS) as ReturnType<typeof useAgentProfileOptions>,
  );
  vi.mocked(useCreateConversation).mockReturnValue(mutation());
  vi.mocked(useAddConversationTurn).mockReturnValue(mutation());
  vi.mocked(useArchiveConversation).mockReturnValue(mutation());
  /**
   * W49 `F4-3` gave this hook a return value, and CH-032 `B` made this screen
   * use it. Default to a healthy connection so every OTHER test in this file
   * describes a screen with no banner on it.
   *
   * ⚠️ This mock used to exist only to satisfy tsc — the screen threw the value
   * away, and every test here stayed green while it did. That is worth keeping
   * in view: a mocked return value nothing consumes is indistinguishable, from
   * inside the suite, from one that is wired up correctly.
   */
  vi.mocked(useAgentConversationEvents).mockReturnValue({
    disconnected: false,
    reconnect: vi.fn(),
  });
});

describe('Assistant (W48 F5)', () => {
  /**
   * 🔴 DS-3 — one primary action on the whole view.
   *
   * "Send" is it: this screen exists to talk, and somebody who has just opened
   * it is far more often continuing than starting over. Making "New
   * conversation" primary as well would make the screen ask which of two things
   * you came for.
   */
  it('offers exactly one primary action', () => {
    const { container } = renderScreen();

    // The primary variant is the Ricoh accent background — one per view.
    const primaries = container.querySelectorAll('button.bg-accent');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Send');
  });

  // ── D3, made visible ──────────────────────────────────────────

  it('says when a thread has no request context', () => {
    renderScreen();

    expect(screen.getAllByText('No request context').length).toBeGreaterThan(0);
  });

  it('says what the agent can still do without one', () => {
    renderScreen();

    // The empty state explains the CONSEQUENCE, not just the state: without
    // this, a person asking about a request gets a shrug and no reason.
    expect(screen.getByText(/cannot read your requests/i)).toBeInTheDocument();
  });

  it('marks a thread that does have a request', () => {
    vi.mocked(useAgentConversation).mockReturnValue(
      query(THREAD({ requestId: 'req-1' })) as ReturnType<
        typeof useAgentConversation
      >,
    );

    renderScreen();

    expect(screen.getAllByText('On a request').length).toBeGreaterThan(0);
  });

  // ── F5-4 / D8 — no approving from a chat ──────────────────────

  /**
   * 🔴 The behavioural half: a parked proposal offers a LINK, never a decision.
   */
  it('sends a waiting proposal to the request instead of deciding it here', () => {
    vi.mocked(useAgentConversation).mockReturnValue(
      query(
        THREAD({
          requestId: 'req-1',
          runs: [
            {
              id: 'run-1',
              status: 'awaiting_approval',
              startedAt: '2026-08-18T09:01:00Z',
            },
          ],
        }),
      ) as ReturnType<typeof useAgentConversation>,
    );

    renderScreen();

    expect(screen.getByText('Open the request')).toHaveAttribute(
      'href',
      '/requests/req-1',
    );
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  /**
   * 🔴 The structural half, and it is the one that lasts.
   *
   * The assertion above only rules out a button spelled "Approve" — a future
   * one called "Accept" would pass it. This says the screen cannot reach the
   * approval mutations at all, which is the same argument `ADR-0036 D2` makes
   * about tools: absence beats instruction.
   */
  it('cannot reach the approval mutations at all', () => {
    const source = readFileSync(join(__dirname, 'assistant.tsx'), 'utf8');

    expect(source).not.toContain('useDecideProposal');
    expect(source).not.toContain('useApprove');
    expect(source).not.toContain('/proposals');
  });

  // ── thinking is about the LATEST run ──────────────────────────

  it('shows Thinking… while the newest run is still going', () => {
    vi.mocked(useAgentConversation).mockReturnValue(
      query(
        THREAD({
          runs: [
            {
              id: 'run-1',
              status: 'completed',
              startedAt: '2026-08-18T09:01:00Z',
            },
            {
              id: 'run-2',
              status: 'running',
              startedAt: '2026-08-18T09:02:00Z',
            },
          ],
        }),
      ) as ReturnType<typeof useAgentConversation>,
    );

    renderScreen();

    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  /**
   * 🔴 The case an "is any run live" implementation gets wrong: an aborted run
   * from an earlier question would leave the thread saying "Thinking…" for as
   * long as it exists.
   */
  it('does not show Thinking… when only an older run is unfinished', () => {
    vi.mocked(useAgentConversation).mockReturnValue(
      query(
        THREAD({
          runs: [
            {
              id: 'run-1',
              status: 'running',
              startedAt: '2026-08-18T09:01:00Z',
            },
            {
              id: 'run-2',
              status: 'completed',
              startedAt: '2026-08-18T09:02:00Z',
            },
          ],
        }),
      ) as ReturnType<typeof useAgentConversation>,
    );

    renderScreen();

    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  /**
   * 🔴 Found in the `F5-3` render, not by any of the assertions above — every
   * one of them asks whether ONE thing is on screen, and this defect is two
   * things being on screen together.
   *
   * A run parked on a proposal is "live" (it can still move on) but nobody is
   * working: it is waiting for a person. The screen showed a spinner saying
   * "Thinking…" directly above "AI-Assist has proposed something", which tells
   * somebody to wait for an answer that will never arrive until they go and
   * decide it. Asserted as the PAIR, because either half alone stays green.
   */
  it('does not also say Thinking… while parked on a proposal', () => {
    vi.mocked(useAgentConversation).mockReturnValue(
      query(
        THREAD({
          requestId: 'req-1',
          runs: [
            {
              id: 'run-1',
              status: 'completed',
              startedAt: '2026-08-18T09:01:00Z',
            },
            {
              id: 'run-2',
              status: 'awaiting_approval',
              startedAt: '2026-08-18T09:02:00Z',
            },
          ],
        }),
      ) as ReturnType<typeof useAgentConversation>,
    );

    renderScreen();

    expect(screen.getByText('Open the request')).toBeInTheDocument();
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  // ── F5-8 — which agent, said out loud ─────────────────────────

  /**
   * 🔴 The one that matters, and it was found in LIVE use rather than here.
   *
   * There is no default profile by design (W47 `OQ-A`): with more than one
   * active and none named, the server refuses. Opening a thread without naming
   * one therefore produced a screen where every first turn 400'd, with nothing
   * on screen to click — the picker did not exist and `/agent/profiles` is
   * ADMIN-only, so a REGIONAL could not even find out what the choices were.
   */
  it('names an agent when opening a thread, instead of letting the server refuse', () => {
    const mutate = vi.fn();
    vi.mocked(useCreateConversation).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as never);

    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(mutate).toHaveBeenCalledWith(
      { requestId: null, profileId: 'p-1' },
      expect.anything(),
    );
  });

  /**
   * 🔴 W49 `F3-1` — the handover from the dock.
   *
   * ⚠️ This assertion exists at THIS layer for a specific reason. The mutation
   * is mocked here, which is the arrangement W48 `F5-8` learned the hard way is
   * blind to what actually reaches the wire — so this cannot be the only thing
   * holding the context up, and it is not: the id's real check is server-side in
   * `agent-conversation.scope.spec.ts`. What this one covers is narrower and
   * still worth having — that the query string is read at all, rather than
   * silently dropped on the way to the request body.
   */
  it('opens the thread on the request the dock handed over', () => {
    const mutate = vi.fn();
    vi.mocked(useCreateConversation).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as never);

    renderScreen('/assistant?requestId=req_from_dock');
    /**
     * ⚠️ Matches EITHER label on purpose. Written the obvious way — looking for
     * "Ask about this request" — this test went red in the falsification run by
     * failing to find the button, never reaching the assertion it is named
     * after. A dropped query string and a renamed button would then produce the
     * same red. The label has its own test below; this one is about the body.
     */
    fireEvent.click(
      screen.getByRole('button', {
        name: /ask about this request|new conversation/i,
      }),
    );

    expect(mutate).toHaveBeenCalledWith(
      { requestId: 'req_from_dock', profileId: 'p-1' },
      expect.anything(),
    );
  });

  /**
   * The label, separately — because the ACTION differs, not just the wording:
   * W48 `OQ-D`'s controlled experiment showed a thread with request context made
   * real tool calls where one without answered "with the available tools" and
   * made none.
   */
  it('says which of the two things the button will do', () => {
    renderScreen('/assistant?requestId=req_from_dock');
    expect(
      screen.getByRole('button', { name: /ask about this request/i }),
    ).toBeInTheDocument();

    renderScreen();
    expect(
      screen.getAllByRole('button', { name: /new conversation/i }).length,
    ).toBeGreaterThan(0);
  });

  /**
   * 🔴 `F5-12` — the label says which QUESTION this answers.
   *
   * The picker chooses what the next thread runs on; the badge in the thread
   * header says what the open one runs on. Live they sat one card apart showing
   * different names, which reads as a contradiction rather than as two separate
   * questions. Asserted on the full string, so shortening it back to "Agent"
   * fails here rather than quietly in a screen reader.
   */
  it('offers the picker only when there is a choice to make', () => {
    renderScreen();
    expect(screen.getByLabelText(PICKER)).toBeInTheDocument();
  });

  it('hides the picker when there is only one agent', () => {
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query([AGENTS[0]]) as ReturnType<typeof useAgentProfileOptions>,
    );

    renderScreen();

    // ⚠️ Against the SAME constant as the assertion above. A hard-coded string
    // here would keep passing after a label rename — green because the query
    // matches nothing, not because the picker is gone.
    expect(screen.queryByLabelText(PICKER)).toBeNull();
  });

  /**
   * ⚠️ A switched-off registry must not look like a working one. Without this,
   * the button opens threads that can never be spoken to.
   */
  it('will not open a thread when no agent is switched on', () => {
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query(NO_AGENTS) as ReturnType<typeof useAgentProfileOptions>,
    );

    renderScreen();

    expect(
      screen.getByRole('button', { name: /new conversation/i }),
    ).toBeDisabled();
    // ⚠️ CH-032 lengthened this sentence (`D2` copies the dock's wording, which
    // also names who can fix it). Asserted against the constant so the two
    // halves cannot drift apart again.
    expect(screen.getByText(NO_AGENTS_LINE)).toBeInTheDocument();
  });

  it('says which agent an open thread runs on', () => {
    // One agent, so the name below can only have come from the badge.
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query([AGENTS[1]]) as ReturnType<typeof useAgentProfileOptions>,
    );
    vi.mocked(useAgentConversation).mockReturnValue(
      query(THREAD({ profileId: 'p-2' })) as ReturnType<
        typeof useAgentConversation
      >,
    );

    renderScreen();

    expect(screen.getByText('power-bi-only')).toBeInTheDocument();
  });

  /**
   * 🔴 A thread pinned to a retired profile still runs. Showing nothing would
   * be `OQ-A`'s invisible default in another costume — the answer would come
   * from a model nobody on screen could name.
   */
  it('still says something when the agent has since been retired', () => {
    vi.mocked(useAgentConversation).mockReturnValue(
      query(THREAD({ profileId: 'gone' })) as ReturnType<
        typeof useAgentConversation
      >,
    );

    renderScreen();

    expect(screen.getByText('Retired agent')).toBeInTheDocument();
  });

  // ── a 403 explains itself ─────────────────────────────────────

  it('explains a 403 rather than looking like an empty inbox', () => {
    vi.mocked(useAgentConversations).mockReturnValue(
      query(undefined, {
        isError: true,
        error: new ApiError(403, 'Forbidden'),
      }) as ReturnType<typeof useAgentConversations>,
    );

    renderScreen();

    expect(screen.getByText('Access required')).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });
});

/**
 * CH-032 — the two places this screen said something that was not true, and the
 * one place it said nothing at all.
 *
 * 🔴 None of these were found by a test. `A` came out of a live DEV incident on
 * 2026-08-19 (every profile switched off, and the sentence on screen was true
 * but read as the only possible explanation); `B` is `R35`, fixed in the dock
 * in W49 and left here; `C` was noticed while writing `A` down.
 *
 * 📌 What they have in common is the shape, not the symptom: **the screen states
 * a fact about the platform that it derived from a query it did not check the
 * outcome of.** `profiles.data ?? []` collapses "failed" into "empty", and a
 * discarded hook return collapses "connection gone" into "nobody has answered".
 */
describe('Assistant honesty (CH-032)', () => {
  // ── A — one sentence used to cover two situations ─────────────

  /**
   * 🔴 The lie. `agents` comes from `profiles.data ?? []`, so before CH-032 a
   * FAILED request rendered the same words as an empty list: the screen claimed
   * to know the registry was empty when it had not been able to read it.
   *
   * ⚠️ Asserted as a PAIR. "Shows the error" alone stays green if both sentences
   * render together, and two contradictory sentences side by side is its own
   * defect — the same trap W48 `F5-3` hit with `Thinking…` above a proposal.
   */
  it('says it could not read the agent list, instead of that there are none', () => {
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query(undefined, {
        isError: true,
        error: new ApiError(500, 'Internal Server Error'),
      }) as ReturnType<typeof useAgentProfileOptions>,
    );

    renderScreen();

    expect(screen.getByText(AGENTS_FAILED_LINE)).toBeInTheDocument();
    expect(screen.queryByText(NO_AGENTS_LINE)).toBeNull();
  });

  /** The other half: an answered request that really is empty still says so. */
  it('still says there are none when the list came back empty', () => {
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query(NO_AGENTS) as ReturnType<typeof useAgentProfileOptions>,
    );

    renderScreen();

    expect(screen.getByText(NO_AGENTS_LINE)).toBeInTheDocument();
    expect(screen.queryByText(AGENTS_FAILED_LINE)).toBeNull();
  });

  /**
   * ⚠️ Neither sentence while the answer is still in flight. A screen that
   * announces "no agents" for the 200ms before the list arrives has invented a
   * third false state on the way to fixing two.
   */
  it('says neither while the list is still loading', () => {
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query(undefined, { isLoading: true }) as ReturnType<
        typeof useAgentProfileOptions
      >,
    );

    renderScreen();

    expect(screen.queryByText(AGENTS_FAILED_LINE)).toBeNull();
    expect(screen.queryByText(NO_AGENTS_LINE)).toBeNull();
  });

  // ── B — R35, the banner this screen was missing ───────────────

  /**
   * 🔴 `R35`. The bound in `useAgentConversationEvents` is correct and has been
   * since W48; what was missing here is that nothing on screen SAID it had
   * fired. A thread whose live connection has died looks exactly like a thread
   * nobody has answered — and the only cure was to switch threads and switch
   * back, which W48 `F7-5` found by accident and no user would guess.
   */
  it('says when live updates have stopped, and offers a way back', () => {
    const reconnect = vi.fn();
    vi.mocked(useAgentConversationEvents).mockReturnValue({
      disconnected: true,
      reconnect,
    });

    renderScreen();

    expect(screen.getByText(DISCONNECTED_LINE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ The negative, and it is the half that keeps the banner worth reading. A
   * status that is always on screen is furniture, and `RISK R35`'s own wording
   * warns that a banner which cries wolf is one nobody reads.
   */
  it('shows no banner while the connection is healthy', () => {
    renderScreen();

    expect(screen.queryByText(DISCONNECTED_LINE)).toBeNull();
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull();
  });

  /**
   * 🔴 DS-3, re-checked WITH the banner up. `Reconnect` is a link-styled
   * `button`, not a `Button` — "Send" is this view's single primary, and the
   * cure for a stalled connection must not out-shout the thing the person came
   * here to do. Counting accent backgrounds is how `F5-3` states this, so the
   * new element is held to the same count rather than to a promise in a comment.
   */
  it('does not add a second primary action when the banner is up', () => {
    vi.mocked(useAgentConversationEvents).mockReturnValue({
      disconnected: true,
      reconnect: vi.fn(),
    });

    const { container } = renderScreen();

    const primaries = container.querySelectorAll('button.bg-accent');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Send');
  });

  // ── C — the 403 that fell through ─────────────────────────────

  /**
   * 🔴 `D1`. `forbidden` checked the conversation list and the open thread but
   * not the profile list, so a REGIONAL who could read neither got "No agent is
   * switched on" — a sentence about the PLATFORM — when the true answer was
   * about their own permissions. Same root as `A`: three queries, two treated
   * as first-class and one treated as "empty if absent".
   */
  it('explains a 403 on the profile list instead of blaming the registry', () => {
    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query(undefined, {
        isError: true,
        error: new ApiError(403, 'Forbidden'),
      }) as ReturnType<typeof useAgentProfileOptions>,
    );

    renderScreen();

    expect(screen.getByText('Access required')).toBeInTheDocument();
    expect(screen.queryByText(NO_AGENTS_LINE)).toBeNull();
    expect(screen.queryByText(AGENTS_FAILED_LINE)).toBeNull();
  });

  // ── D2 — the two screens say the same words ───────────────────

  /**
   * 🔴 The point of `D2`, and the only assertion here that outlives a rewrite of
   * either component.
   *
   * The dock and this screen answer the same three questions, and W49 shipped
   * them with DIFFERENT wording for one of them without anything going red —
   * `/assistant` had "No agent is switched on." while the dock also named who
   * could turn one on. Prose in a comment asking the next person to keep them in
   * step is not a mechanism; this is.
   *
   * ⚠️ Whitespace is collapsed before comparing, so Prettier re-wrapping a long
   * JSX line cannot fail this for a reason that has nothing to do with wording.
   */
  it('uses the same words as the dock, in both files', () => {
    const normalize = (s: string) => s.replace(/\s+/g, ' ');
    const assistant = normalize(
      readFileSync(join(__dirname, 'assistant.tsx'), 'utf8'),
    );
    const dock = normalize(
      readFileSync(
        join(__dirname, '..', 'components', 'shell', 'agent-dock.tsx'),
        'utf8',
      ),
    );

    for (const line of [
      AGENTS_FAILED_LINE,
      NO_AGENTS_LINE,
      DISCONNECTED_LINE,
    ]) {
      // Named in the failure message: a bare `toContain` on a loop variable
      // reports "expected <the whole file> to contain …", which says nothing
      // about WHICH of the two files drifted.
      expect(assistant, `assistant.tsx is missing: ${line}`).toContain(line);
      expect(dock, `agent-dock.tsx is missing: ${line}`).toContain(line);
    }
  });
});
