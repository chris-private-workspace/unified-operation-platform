import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPanel } from './agent-panel';
import { useAgentKillSwitch, useAgentReviewStats } from '@/hooks/queries';
import { useSetAgentKillSwitch } from '@/hooks/mutations';
import type { AgentKillSwitchStatus, AgentReviewStats } from '@/lib/api-types';

/**
 * 期二 G3 + G7 — the agent's operational screen.
 *
 * 🔴 Neither half is tested for "it renders". Each carries one claim that the
 * obvious implementation gets wrong:
 *
 *   G3 — "switched off" and "stopped" are different states, and the screen has
 *        to say so. Switching back ON is the direction that releases whatever
 *        was parked, so that is where the warning belongs.
 *   G7 — one figure is evidence and the other is not. A panel that presented a
 *        slow median as diligence would be inventing the reassuring reading,
 *        which is the failure R13 is about.
 */

vi.mock('@/hooks/queries', () => ({
  useAgentKillSwitch: vi.fn(),
  useAgentReviewStats: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({ useSetAgentKillSwitch: vi.fn() }));

const setMutate = vi.fn();

const SWITCH = (
  over: Partial<AgentKillSwitchStatus> = {},
): AgentKillSwitchStatus => ({
  principal: 'ai-assist',
  enabled: true,
  liveRuns: 0,
  pendingProposals: 0,
  settled: false,
  updatedAt: '2026-08-16T00:00:00Z',
  ...over,
});

const STATS = (over: Partial<AgentReviewStats> = {}): AgentReviewStats => ({
  windowDays: 30,
  since: '2026-07-17T00:00:00Z',
  decided: 4,
  approved: 3,
  rejected: 1,
  approvalRate: 0.75,
  medianSecondsToDecide: 900,
  fastDecisions: 3,
  fastReviewSeconds: 30,
  pending: 2,
  byReviewer: [
    {
      approverId: 'u-fast',
      displayName: 'Fast Reviewer',
      decided: 3,
      approved: 3,
      rejected: 0,
      approvalRate: 1,
      medianSecondsToDecide: 4,
      fastDecisions: 3,
    },
    {
      approverId: 'u-careful',
      displayName: 'Careful Reviewer',
      decided: 1,
      approved: 0,
      rejected: 1,
      approvalRate: 0,
      medianSecondsToDecide: 900,
      fastDecisions: 0,
    },
  ],
  ...over,
});

const show = (
  status: AgentKillSwitchStatus = SWITCH(),
  stats: AgentReviewStats = STATS(),
) => {
  vi.mocked(useAgentKillSwitch).mockReturnValue({
    data: status,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useAgentReviewStats).mockReturnValue({
    data: stats,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  render(<AgentPanel />);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSetAgentKillSwitch).mockReturnValue({
    mutate: setMutate,
    isPending: false,
    isError: false,
  } as never);
});

describe('🔴 G3 — "switched off" is not "stopped"', () => {
  it('does not claim it has settled while runs are still parked', () => {
    show(
      SWITCH({
        enabled: false,
        settled: false,
        liveRuns: 3,
        pendingProposals: 2,
      }),
    );

    // 🔴 The badge itself refuses the shorter reading. An operator in an
    // incident reads this and nothing else.
    expect(screen.getByText('Switched off — not settled')).toBeTruthy();
    expect(screen.getByText(/become live again/i)).toBeTruthy();
  });

  it('says plainly when it really has settled', () => {
    show(SWITCH({ enabled: false, settled: true }));

    expect(screen.getByText('Switched off')).toBeTruthy();
    expect(screen.queryByText(/become live again/i)).toBeNull();
  });

  /**
   * 🔴 The direction people do not expect. Switching OFF is cautious;
   * switching ON is what releases whatever was parked — and one of those
   * proposals may assign a real licence (G1).
   */
  it('warns about what switching back ON releases, with the counts', () => {
    show(
      SWITCH({
        enabled: false,
        settled: false,
        liveRuns: 3,
        pendingProposals: 2,
      }),
    );

    fireEvent.click(screen.getByText('Switch on'));

    expect(screen.getByText(/Switch it back on\?/)).toBeTruthy();
    expect(screen.getByText(/3 run\(s\) and 2 proposal\(s\)/)).toBeTruthy();
    expect(screen.getByText(/licence assignment among them/i)).toBeTruthy();
  });

  it('spells out that approvals stop too, not only new runs', () => {
    show();

    fireEvent.click(screen.getByText('Switch off'));

    /**
     * ⚠️ Scoped to the dialog's own sentence, not to the page.
     *
     * The first version matched `/approvals/i` page-wide and went red on
     * "found multiple elements" — the card SUBTITLE says it too. A page-wide
     * match would have gone green on the subtitle alone, i.e. on text that is
     * visible before anyone opens the dialog, which is not the claim.
     */
    const refusal = screen.getByText(/will be refused/i);
    // The half a reader assumes is not covered: approving an EXISTING proposal
    // is the branch that can assign a licence.
    expect(refusal.textContent).toMatch(/approvals/i);
    expect(
      screen.getByText(/nothing already assigned is undone/i),
    ).toBeTruthy();
  });

  it('sends the flag and the typed reason', () => {
    show();

    fireEvent.click(screen.getByText('Switch off'));
    fireEvent.change(screen.getByPlaceholderText(/audit entry/i), {
      target: { value: 'Runaway run' },
    });
    fireEvent.click(screen.getAllByText('Switch off').at(-1) as HTMLElement);

    expect(setMutate).toHaveBeenCalledWith(
      { enabled: false, reason: 'Runaway run' },
      expect.anything(),
    );
  });

  it('omits an empty reason rather than sending blank text', () => {
    show();

    fireEvent.click(screen.getByText('Switch off'));
    fireEvent.click(screen.getAllByText('Switch off').at(-1) as HTMLElement);

    expect(setMutate).toHaveBeenCalledWith(
      { enabled: false, reason: undefined },
      expect.anything(),
    );
  });

  it('says rejection still works, because that reads like an omission', () => {
    show(SWITCH({ enabled: false, settled: true }));

    expect(screen.getByText(/clearing up after it/i)).toBeTruthy();
  });
});

describe('🔴 G7 — one figure is evidence, the other is not', () => {
  it('carries the reading instructions, not just the numbers', () => {
    show();

    expect(screen.getByText(/was not read/i)).toBeTruthy();
    // 🔴 Without this sentence a reader takes a slow median as diligence —
    // the exact conclusion this panel exists to prevent.
    expect(screen.getByText(/context, not proof of care/i)).toBeTruthy();
  });

  it('shows a reviewer who approves everything in seconds', () => {
    show();

    const row = screen.getByText('Fast Reviewer').closest('tr') as HTMLElement;
    expect(within(row).getByText('100%')).toBeTruthy();
    expect(within(row).getByText('4s')).toBeTruthy();
  });

  it('prints no rate at all when there is nothing to divide', () => {
    show(
      SWITCH(),
      STATS({
        decided: 0,
        approved: 0,
        rejected: 0,
        approvalRate: null,
        medianSecondsToDecide: null,
        fastDecisions: 0,
        byReviewer: [],
      }),
    );

    // 🔴 `0%` would read as "this team approves nothing", which is the opposite
    // of "there is nothing here".
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('No decisions yet')).toBeTruthy();
  });

  it('keeps a reviewer whose account can no longer be named', () => {
    show(
      SWITCH(),
      STATS({
        byReviewer: [
          {
            approverId: 'u-gone',
            displayName: null,
            decided: 2,
            approved: 2,
            rejected: 0,
            approvalRate: 1,
            medianSecondsToDecide: 3,
            fastDecisions: 2,
          },
        ],
      }),
    );

    // Their decisions still happened; dropping the row would quietly remove
    // them from the totals a reader is comparing against.
    expect(screen.getByText('Unknown account')).toBeTruthy();
  });
});
