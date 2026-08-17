import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from './agent';
import { useAgentProfiles, useAgentRuns } from '@/hooks/queries';
import {
  useCreateAgentProfile,
  useUpdateAgentProfile,
} from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import type { AgentProfile, AgentRunPage } from '@/lib/api-types';

/**
 * W47 F5 — the agent registry screen.
 *
 * 🔴 Not tested for "it renders". Each claim below is one the obvious
 * implementation gets wrong, and every one of them fails silently:
 *
 *   - a run started before the registry has no profile. Hiding those rows, or
 *     rendering a blank cell, both read as "there were no such runs" (`OQ-D`).
 *   - a profile carrying a custom prompt looks identical to one that does not,
 *     unless the table says so — and this screen cannot yet EDIT prompts, so a
 *     silent one would be invisible everywhere.
 *   - changing a filter while on page 3 keeps a cursor that points into a
 *     result set that no longer exists.
 *   - a 403 has to explain itself rather than look like an empty registry.
 */

vi.mock('@/hooks/queries', () => ({
  useAgentProfiles: vi.fn(),
  useAgentRuns: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({
  useCreateAgentProfile: vi.fn(),
  useUpdateAgentProfile: vi.fn(),
}));

const PROFILE = (over: Partial<AgentProfile> = {}): AgentProfile => ({
  id: 'prof-1',
  principalId: 'prin-1',
  name: 'gpt-5.6-luna',
  model: 'gpt-5.6-luna',
  prompt: null,
  active: true,
  createdAt: '2026-08-17T00:00:00Z',
  updatedAt: '2026-08-17T00:00:00Z',
  ...over,
});

const PAGE = (over: Partial<AgentRunPage> = {}): AgentRunPage => ({
  items: [
    {
      id: 'run-1',
      requestId: 'req-1',
      status: 'completed',
      startedById: 'u-1',
      startedAt: '2026-08-17T09:00:00Z',
      endedAt: '2026-08-17T09:01:00Z',
      profileId: 'prof-1',
      profile: { id: 'prof-1', name: 'gpt-5.6-luna', model: 'gpt-5.6-luna' },
    },
  ],
  nextCursor: null,
  ...over,
});

const query = <T,>(data: T, over: Record<string, unknown> = {}) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  ...over,
});

beforeEach(() => {
  vi.mocked(useAgentProfiles).mockReturnValue(
    query([PROFILE()]) as ReturnType<typeof useAgentProfiles>,
  );
  vi.mocked(useAgentRuns).mockReturnValue(
    query(PAGE()) as ReturnType<typeof useAgentRuns>,
  );
  vi.mocked(useCreateAgentProfile).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateAgentProfile>);
  vi.mocked(useUpdateAgentProfile).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateAgentProfile>);
});

describe('Agent registry (W47 F5)', () => {
  /**
   * 🔴 DS-3 — one primary action on the whole view.
   *
   * The run table is a record of what happened; the two things anybody can DO
   * to a run (decide its proposal, stop it) live on the request, where the
   * context to decide is. A second primary here would make the screen ask which
   * of two unrelated things you came for.
   */
  it('offers exactly one primary action', () => {
    render(<Agent />);

    const primaries = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('bg-accent'));

    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('New profile');
  });

  // ── OQ-D — runs that predate the registry ───────────────────

  /**
   * 🔴 The claim `OQ-D` settled. A run with no profile is a real historical
   * fact, and both obvious alternatives destroy it: filtering those rows out
   * makes "how many runs came before W47" unanswerable, and an empty cell reads
   * as data that failed to load.
   */
  it('labels a run that predates the registry instead of hiding it', () => {
    vi.mocked(useAgentRuns).mockReturnValue(
      query(
        PAGE({
          items: [
            {
              id: 'run-old',
              requestId: 'req-old',
              status: 'completed',
              startedById: 'u-1',
              startedAt: '2026-08-01T09:00:00Z',
              profileId: null,
              profile: null,
            },
          ],
        }),
      ) as ReturnType<typeof useAgentRuns>,
    );

    render(<Agent />);

    expect(screen.getByText('Before W47')).toBeInTheDocument();
    // And it is a ROW, not a footnote — the run is still listed.
    expect(screen.getByText('req-old')).toBeInTheDocument();
  });

  // ── the prompt column ───────────────────────────────────────

  /**
   * 🔴 This screen cannot edit prompts yet (no multi-line primitive exists —
   * H6). That makes SHOWING whether one is set the whole safeguard: a profile
   * quietly carrying custom instructions, on the one screen that manages
   * profiles, would be invisible everywhere in the product.
   */
  it('says which profiles carry a custom prompt', () => {
    vi.mocked(useAgentProfiles).mockReturnValue(
      query([
        PROFILE(),
        PROFILE({ id: 'prof-2', name: 'strict', prompt: 'Only Power BI.' }),
      ]) as ReturnType<typeof useAgentProfiles>,
    );

    render(<Agent />);

    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Built-in')).toBeInTheDocument();
  });

  it('shows a retired profile rather than dropping it from the list', () => {
    vi.mocked(useAgentProfiles).mockReturnValue(
      query([
        PROFILE({ id: 'prof-old', name: 'retired one', active: false }),
      ]) as ReturnType<typeof useAgentProfiles>,
    );

    render(<Agent />);

    // A retired profile that vanished from the only screen that manages
    // profiles could never be brought back.
    expect(screen.getByText('Retired')).toBeInTheDocument();

    /*
      📌 It appears TWICE, and the second one matters as much as the first: the
      run filter is built from the same list, so a retired profile stays
      selectable there. Filtering historical runs by the profile they ran on is
      the main reason to look one up — and that is exactly the profile most
      likely to have been retired since.
    */
    expect(screen.getAllByText('retired one')).toHaveLength(2);
    expect(
      screen.getByRole('option', { name: 'retired one' }),
    ).toBeInTheDocument();
  });

  // ── paging vs filters ───────────────────────────────────────

  /**
   * 🔴 The bug this prevents needs three steps to reach and looks like corrupt
   * data when it happens: page forward, change a filter, and the cursor now
   * points into a result list that no longer exists — so the table shows an
   * arbitrary slice of the new filter's rows, starting nowhere in particular.
   */
  it('returns to the first page when a filter changes', () => {
    vi.mocked(useAgentRuns).mockReturnValue(
      query(PAGE({ nextCursor: 'run-1' })) as ReturnType<typeof useAgentRuns>,
    );

    render(<Agent />);
    fireEvent.click(screen.getByRole('button', { name: /Older/ }));
    expect(vi.mocked(useAgentRuns).mock.calls.at(-1)?.[0]).toMatchObject({
      cursor: 'run-1',
    });

    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'failed' },
    });

    const last = vi.mocked(useAgentRuns).mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ status: 'failed' });
    expect(last).not.toHaveProperty('cursor');
  });

  it('does not offer an older page when the server says there is none', () => {
    render(<Agent />);

    expect(screen.getByRole('button', { name: /Older/ })).toBeDisabled();
  });

  // ── the 403 ─────────────────────────────────────────────────

  /**
   * ⚠️ Without this, a REGIONAL who typed the URL would see an empty registry
   * and reasonably conclude the platform has no agent profiles at all.
   */
  it('explains a 403 rather than rendering an empty registry', () => {
    vi.mocked(useAgentProfiles).mockReturnValue(
      query(undefined, {
        isError: true,
        error: new ApiError(403, 'Forbidden'),
      }) as ReturnType<typeof useAgentProfiles>,
    );

    render(<Agent />);

    expect(screen.getByText('Access required')).toBeInTheDocument();
    expect(screen.queryByText('New profile')).not.toBeInTheDocument();
  });

  // ── the dialog ──────────────────────────────────────────────

  it('opens the editor on the profile that was clicked', () => {
    vi.mocked(useAgentProfiles).mockReturnValue(
      query([
        PROFILE(),
        PROFILE({ id: 'prof-2', name: 'strict', model: 'gpt-other' }),
      ]) as ReturnType<typeof useAgentProfiles>,
    );

    render(<Agent />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit strict' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('strict')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('gpt-other')).toBeInTheDocument();
  });

  /**
   * 🔴 There is no delete, and the editor must not imply one. Retiring is the
   * only way to take a profile out of use, because historical runs point at it
   * to record what they ran on.
   */
  it('offers retiring rather than deleting', () => {
    render(<Agent />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit / }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Profile status')).toBeInTheDocument();
    expect(within(dialog).queryByText(/delete/i)).not.toBeInTheDocument();
  });

  it('refuses to submit a profile with no model', () => {
    render(<Agent />);
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: 'Create profile' }),
    ).toBeDisabled();
  });
});
