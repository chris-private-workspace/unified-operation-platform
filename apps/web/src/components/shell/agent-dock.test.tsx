import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentDock, AgentDockLauncher } from './agent-dock';
import { useUiStore } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import {
  useAgentConversation,
  useAgentProfileOptions,
  useRequest,
} from '@/hooks/queries';
import {
  useAddConversationTurn,
  useCreateConversation,
} from '@/hooks/mutations';
import { useAgentConversationEvents } from '@/hooks/agent-conversation-events';
import type { Role } from '@/lib/api-types';

/**
 * W49 `F2` — mounting the dock in the shell.
 *
 * 🔴 `R5` is the reason the source scan below exists. The role gate is easy to
 * get right once and lose later: the launcher is the obvious place to hide, and
 * hiding a button is indistinguishable from gating a feature until something
 * else opens the panel — which `F3` will, from a route. A reviewer would have to
 * remember. This file does not.
 *
 * ⚠️ What this file CANNOT prove: `G2` (the table underneath still responds).
 * jsdom applies no Tailwind, so nothing here has geometry — see `drawer.test.tsx`
 * for the same caveat. `G2` is verified live in `F2-2`.
 */

vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/queries', () => ({
  useRequest: vi.fn(),
  useAgentConversation: vi.fn(),
  useAgentProfileOptions: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({
  useCreateConversation: vi.fn(),
  useAddConversationTurn: vi.fn(),
}));
vi.mock('@/hooks/agent-conversation-events', () => ({
  useAgentConversationEvents: vi.fn(),
}));

const asRole = (role: Role | undefined) =>
  vi.mocked(useCurrentUser).mockReturnValue({ role } as never);

/** Only ever used to NAME the request on screen — never to decide anything. */
const asRequest = (serviceNowNumber: string | null) =>
  vi.mocked(useRequest).mockReturnValue({
    data: serviceNowNumber ? { serviceNowNumber } : undefined,
  } as never);

const query = (data: unknown, over: Record<string, unknown> = {}) =>
  ({ data, isLoading: false, isError: false, error: null, ...over }) as never;

const mutation = (over: Record<string, unknown> = {}) =>
  ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...over,
  }) as never;

const AGENT = { id: 'p-1', name: 'ai-assist (gpt-4o)', model: 'gpt-4o' };

/** Open a thread in the dock by making `create` report success with this id. */
const withOpenThread = (over: Record<string, unknown> = {}) => {
  const created = { id: 'conv-1' };
  vi.mocked(useCreateConversation).mockReturnValue(
    mutation({
      mutate: vi.fn((_vars, opts) => opts?.onSuccess?.(created)),
    }),
  );
  vi.mocked(useAgentConversation).mockReturnValue(
    query({
      id: 'conv-1',
      requestId: null,
      profileId: 'p-1',
      turns: [],
      runs: [],
      ...over,
    }),
  );
};

const renderLauncher = () =>
  render(
    <MemoryRouter>
      <AgentDockLauncher />
    </MemoryRouter>,
  );

const renderDock = (path = '/requests') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AgentDock />
    </MemoryRouter>,
  );

beforeEach(() => {
  useUiStore.setState({ dockOpen: false });
  asRequest(null);
  vi.mocked(useAgentProfileOptions).mockReturnValue(query([AGENT]));
  vi.mocked(useAgentConversation).mockReturnValue(query(undefined));
  vi.mocked(useCreateConversation).mockReturnValue(mutation());
  vi.mocked(useAddConversationTurn).mockReturnValue(mutation());
  vi.mocked(useAgentConversationEvents).mockReturnValue({
    disconnected: false,
    reconnect: vi.fn(),
  });
});

describe('agent dock role gate (W49 F2-3)', () => {
  it.each<Role>(['ADMIN', 'REGIONAL'])('offers the launcher to %s', (role) => {
    asRole(role);
    renderLauncher();

    expect(
      screen.getByRole('button', { name: 'Assistant' }),
    ).toBeInTheDocument();
  });

  /**
   * 🔴 `undefined` is in this list on purpose. It is the real state while GET
   * /me is still in flight, and `canUseAgent` treats it as no-access — a gate
   * that only handled known roles would flash the dock open on every cold load.
   */
  it.each<Role | undefined>(['OPCO_IT', undefined])(
    'offers nothing to %s',
    (role) => {
      asRole(role);
      const { container } = renderLauncher();

      expect(container).toBeEmptyDOMElement();
    },
  );

  /**
   * 🔴 The panel gates itself rather than relying on the launcher being hidden.
   * Asserted with the store ALREADY open, which is the state that matters: a
   * role change (or `F3` opening it from a route) must not leave a panel behind
   * for somebody who may not use the agent.
   */
  it('renders no panel for a role that cannot use the agent, even when open', () => {
    asRole('OPCO_IT');
    useUiStore.setState({ dockOpen: true });
    const { container } = renderDock();

    expect(container).toBeEmptyDOMElement();
  });
});

describe('agent dock open state (W49 F2-4)', () => {
  it('renders nothing until it is opened', () => {
    asRole('ADMIN');
    const { container } = renderDock();

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the panel when the store says open', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderDock();

    expect(
      screen.getByRole('complementary', { name: 'Assistant' }),
    ).toBeInTheDocument();
  });

  it('the launcher toggles the store both ways', () => {
    asRole('ADMIN');
    renderLauncher();
    const button = screen.getByRole('button', { name: 'Assistant' });

    fireEvent.click(button);
    expect(useUiStore.getState().dockOpen).toBe(true);

    fireEvent.click(button);
    expect(useUiStore.getState().dockOpen).toBe(false);
  });

  /**
   * ⚠️ This is what "the open state persists" means here: the state is in the
   * store, so unmounting and remounting the panel — which is what a route change
   * does to everything below the shell — finds it still open. It is deliberately
   * NOT localStorage; see the note in `store/ui.ts`.
   */
  it('survives a remount, because the state is not the component’s', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });

    const first = renderDock();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    first.unmount();

    renderDock();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('the launcher reports its state to assistive tech', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderLauncher();

    expect(screen.getByRole('button', { name: 'Assistant' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

/**
 * W49 `F3-1` — what the dock CARRIES.
 *
 * 🔴 Read the limit of these first. They prove the id travels; they prove
 * nothing about whether sending it is allowed. That second question is the whole
 * point of `D-CTX` and it is answered in `agent-conversation.scope.spec.ts`
 * against a real controller, because a frontend test asserting "we send
 * requestId" is exactly the tautology `plan §4 R2` warned about.
 */
describe('agent dock context (W49 F3-1)', () => {
  /**
   * ⚠️ Asserted on the HREF, not on the link text. `F4` renamed the label when
   * the button beside it took the old wording, and a test keyed on wording would
   * have gone red for a cosmetic reason while saying nothing about the id.
   */
  it('carries the request id from a detail route', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderDock('/requests/req_abc');

    expect(screen.getByRole('link', { name: /assistant/i })).toHaveAttribute(
      'href',
      '/assistant?requestId=req_abc',
    );
  });

  it('names the request when it can', () => {
    asRole('ADMIN');
    asRequest('REQ0044067');
    useUiStore.setState({ dockOpen: true });
    renderDock('/requests/req_abc');

    expect(screen.getByText('REQ0044067')).toBeInTheDocument();
  });

  /**
   * ⚠️ Falls back to the raw id rather than to nothing. A panel that showed no
   * subject while still sending one would be lying by omission — and the id is
   * exactly what it is about to hand over.
   */
  it('falls back to the id while the request is unknown', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderDock('/requests/req_abc');

    expect(screen.getByText('req_abc')).toBeInTheDocument();
  });

  it.each([
    ['/requests', 'the list'],
    ['/requests/new', 'the create form'],
    ['/drift', 'an unrelated screen'],
  ])('carries nothing from %s (%s)', (path) => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });
    renderDock(path);

    expect(screen.getByRole('link', { name: /assistant/i })).toHaveAttribute(
      'href',
      '/assistant',
    );
    expect(screen.queryByText('About')).toBeNull();
  });
});

// ── F4: the chat itself ───────────────────────────────────────────

describe('agent dock chat (W49 F4)', () => {
  /**
   * `F4-1` / `R4` — the dock renders the SAME query the full screen does. The
   * proof that matters is negative: no local copy of the conversation exists
   * here, so a turn cannot show up in one place and not the other.
   */
  it('renders the thread from the shared conversation query', () => {
    asRole('ADMIN');
    withOpenThread({
      turns: [
        { id: 't1', role: 'user', content: 'What SKUs are available?' },
        { id: 't2', role: 'assistant', content: 'Forty-nine entries.' },
      ],
    });
    useUiStore.setState({ dockOpen: true });
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(screen.getByText('What SKUs are available?')).toBeInTheDocument();
    expect(screen.getByText('Forty-nine entries.')).toBeInTheDocument();
  });

  it('opens the thread on the request the route is showing', () => {
    asRole('ADMIN');
    const mutate = vi.fn();
    vi.mocked(useCreateConversation).mockReturnValue(mutation({ mutate }));
    useUiStore.setState({ dockOpen: true });
    renderDock('/requests/req_abc');

    fireEvent.click(
      screen.getByRole('button', { name: /ask about this request/i }),
    );

    expect(mutate).toHaveBeenCalledWith(
      { requestId: 'req_abc', profileId: 'p-1' },
      expect.anything(),
    );
  });

  // ── F4-2 / ADR-0041 D8 — no approving from the dock ─────────────

  /**
   * 🔴 CH-035 `G3` — the dock had the same blind spot `/assistant` did.
   *
   * ⚠️ Not a case of "the dock got it right and the screen lagged", which was
   * the shape of all three CH-032 sentences. Neither surface said anything when
   * a run died, and the dock meets that state MORE often for the same reason
   * `F4-3` gives about the disconnected banner: it stays open all day, so it is
   * there when an api restart kills a run mid-question.
   */
  it('says when the latest run failed, and who can fix it', () => {
    asRole('ADMIN');
    withOpenThread({
      turns: [{ id: 't1', role: 'user', content: 'what can you help' }],
      runs: [
        {
          id: 'run-1',
          status: 'failed',
          startedAt: '2026-08-20T07:50:17Z',
          whoFixes: 'platform',
        },
      ],
    });
    useUiStore.setState({ dockOpen: true });
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(
      screen.getByText(
        'That question was not answered — the run stopped before it could reply.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This one is ours — raise it with the platform team.'),
    ).toBeInTheDocument();
  });

  /** The negative — otherwise the notice is furniture on every healthy thread. */
  it('stays quiet when the run completed', () => {
    asRole('ADMIN');
    withOpenThread({
      runs: [
        {
          id: 'run-1',
          status: 'completed',
          startedAt: '2026-08-20T07:50:17Z',
        },
      ],
    });
    useUiStore.setState({ dockOpen: true });
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(
      screen.queryByText(
        'That question was not answered — the run stopped before it could reply.',
      ),
    ).toBeNull();
  });

  /**
   * 🔴 The behavioural half: a parked proposal offers a LINK, never a decision.
   */
  it('sends a waiting proposal to the request instead of deciding it here', () => {
    asRole('ADMIN');
    withOpenThread({
      requestId: 'req-1',
      runs: [
        {
          id: 'run-1',
          status: 'awaiting_approval',
          startedAt: '2026-08-19T09:00:00Z',
        },
      ],
    });
    useUiStore.setState({ dockOpen: true });
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(screen.getByText('Open the request')).toHaveAttribute(
      'href',
      '/requests/req-1',
    );
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  /**
   * 🔴 The structural half, and it is the one that lasts — copied deliberately
   * from `assistant.test.tsx`, because W48 `F5-4` learned that the behavioural
   * assertion above only rules out a button spelled "Approve": one called
   * "Accept" would sail past it. This says the file cannot reach the approval
   * mutations at all, which is `ADR-0036 D2`'s argument about tools — absence
   * beats instruction.
   */
  it('cannot reach the approval mutations at all', () => {
    const source = readFileSync(DOCK, 'utf8');

    expect(source).not.toContain('useDecideProposal');
    expect(source).not.toContain('useApprove');
    expect(source).not.toContain('/proposals');
  });

  /**
   * 🔴 The third one, and it exists because the two above have a seam between
   * them — found by falsification, not by reasoning. Renaming the button to
   * "Accept proposal" leaves BOTH green: the behavioural test only looks for
   * /approve/i, and the source scan only rules out reaching the mutations. What
   * survives is a control that decides nothing but looks like it does, which on
   * a screen about approvals is its own kind of wrong.
   *
   * ⇒ An allow-list of every button the dock may show. A new control has to be
   * added here deliberately, which is the moment somebody asks what it does.
   */
  it('offers only the controls it is supposed to', () => {
    asRole('ADMIN');
    withOpenThread({
      requestId: 'req-1',
      runs: [
        {
          id: 'run-1',
          status: 'awaiting_approval',
          startedAt: '2026-08-19T09:00:00Z',
        },
      ],
    });
    useUiStore.setState({ dockOpen: true });
    renderDock();
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())
      .sort();

    expect(labels).toEqual(['Close', 'Send']);
  });

  /**
   * ⚠️ DS-3, asserted structurally because it cannot be seen in jsdom. The dock
   * is on EVERY screen, so a primary button here is a second primary everywhere
   * at once — `design-system.md §2`'s seventh constraint, which W49 `F2-5`
   * already caught being broken once by the author who wrote it.
   */
  it('has no primary action anywhere in it', () => {
    const source = readFileSync(DOCK, 'utf8');

    expect(source).not.toContain('variant="primary"');
    expect(source).not.toMatch(/className="[^"]*\btext-accent\b/);
  });

  // ── F4-3 / R35 — a dead connection has to say so ────────────────

  it('says nothing about the connection while it is healthy', () => {
    asRole('ADMIN');
    withOpenThread();
    useUiStore.setState({ dockOpen: true });
    renderDock();
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(screen.queryByText(/live updates stopped/i)).toBeNull();
  });

  /**
   * 🔴 The whole point of `F4-3`. `MAX_CONSECUTIVE_FAILURES` was always correct;
   * what was missing is that the screen could not tell you it had fired, and a
   * silent thread looks exactly like a thread nobody answered.
   */
  it('says so when live updates have given up, and offers a way back', () => {
    asRole('ADMIN');
    const reconnect = vi.fn();
    vi.mocked(useAgentConversationEvents).mockReturnValue({
      disconnected: true,
      reconnect,
    });
    withOpenThread();
    useUiStore.setState({ dockOpen: true });
    renderDock();
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(screen.getByText(/live updates stopped/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  // ── the sentence that used to cover two situations ──────────────

  /**
   * 🔴 From a live incident (DEV, 2026-08-19): every profile was switched off,
   * and `/assistant` said "No agent is switched on." — true that time. But the
   * same sentence is shown there when the REQUEST FAILS, where it is a lie
   * about the platform's state. The dock separates the two.
   */
  it('distinguishes "no agent" from "could not load agents"', () => {
    asRole('ADMIN');
    useUiStore.setState({ dockOpen: true });

    vi.mocked(useAgentProfileOptions).mockReturnValue(query([]));
    const empty = renderDock();
    expect(screen.getByText(/no agent is switched on/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).toBeNull();
    empty.unmount();

    vi.mocked(useAgentProfileOptions).mockReturnValue(
      query(undefined, { isError: true, error: new Error('boom') }),
    );
    renderDock();
    expect(
      screen.getByText(/could not load the agent list/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no agent is switched on/i)).toBeNull();
  });

  it('cannot start a conversation with no agent to run it on', () => {
    asRole('ADMIN');
    vi.mocked(useAgentProfileOptions).mockReturnValue(query([]));
    useUiStore.setState({ dockOpen: true });
    renderDock();

    expect(
      screen.getByRole('button', { name: /new conversation/i }),
    ).toBeDisabled();
  });
});

// ── R5: the gate cannot be lost in a later edit ──────────────────

const DOCK = join(__dirname, 'agent-dock.tsx');

/**
 * Split on the export boundary so each component's body is checked separately.
 * A whole-file `toContain('useDockVisible')` would pass while a newly added
 * third export skipped the gate entirely — which is exactly the edit this is
 * here to catch.
 */
function exportedComponents(): { name: string; body: string }[] {
  const source = readFileSync(DOCK, 'utf8');
  return source
    .split(/^export function /gm)
    .slice(1)
    .map((part) => ({ name: part.slice(0, part.indexOf('(')), body: part }));
}

describe('every dock entry point runs the same gate (W49 R5)', () => {
  /**
   * 🔴 The vacuity guard, and it is not ceremony — W47 shipped two assertions
   * aimed at a collaborator that no longer existed, so they could not go red.
   * If the file is renamed or the split regex stops matching, this returns []
   * and every assertion below would pass having checked nothing.
   */
  it('finds the exports it is about to check', () => {
    const parts = exportedComponents();

    expect(parts.map((p) => p.name)).toEqual([
      'AgentDockLauncher',
      'AgentDock',
    ]);
  });

  it('gates each one', () => {
    for (const { name, body } of exportedComponents()) {
      expect(body, `${name} does not call useDockVisible()`).toContain(
        'useDockVisible()',
      );
    }
  });

  /**
   * And that the shared helper asks the platform's predicate rather than
   * re-deriving one. A local `role === 'ADMIN'` here would be a second answer to
   * a question `roles.ts` already owns.
   */
  it('derives visibility from canUseAgent, not from a local role check', () => {
    const source = readFileSync(DOCK, 'utf8');

    expect(source).toContain('canUseAgent(role)');
    expect(source).not.toMatch(/role === '/);
  });
});
