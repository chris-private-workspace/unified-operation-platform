import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Assistant } from './assistant';
import { useAgentConversation, useAgentConversations } from '@/hooks/queries';
import {
  useAddConversationTurn,
  useArchiveConversation,
  useCreateConversation,
} from '@/hooks/mutations';
import { useAgentConversationEvents } from '@/hooks/agent-conversation-events';
import { ApiError } from '@/lib/api';
import type { AgentConversation } from '@/lib/api-types';

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

const renderScreen = () =>
  render(
    <MemoryRouter>
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
  vi.mocked(useCreateConversation).mockReturnValue(mutation());
  vi.mocked(useAddConversationTurn).mockReturnValue(mutation());
  vi.mocked(useArchiveConversation).mockReturnValue(mutation());
  vi.mocked(useAgentConversationEvents).mockReturnValue(undefined);
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
