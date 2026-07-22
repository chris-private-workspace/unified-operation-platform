import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityFeed } from './activity-feed';
import { useActivity } from '@/hooks/queries';
import type { ActivityEvent } from '@/lib/api-types';

// The feed's branches are hard to reach against a live feed (it has real rows,
// and stubbing the response mid-session does not reliably re-trigger the query),
// so they are pinned here instead — this also keeps them from regressing.
vi.mock('@/hooks/queries', () => ({ useActivity: vi.fn() }));

const mockQuery = (over: Record<string, unknown>) =>
  vi.mocked(useActivity).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...over,
  } as ReturnType<typeof useActivity>);

const EVENT: ActivityEvent = {
  id: 'ev1',
  type: 'ASSIGN',
  fromStage: 'READY',
  toStage: 'ASSIGNED',
  message: 'Assigned SPE_E3',
  createdAt: new Date().toISOString(),
  actorName: 'Alex Tan',
  requestId: 'req-abc123def456',
  requestRef: 'REQ0012345',
};

describe('ActivityFeed (CH-006)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an operational row with its actor and request handle', () => {
    mockQuery({ data: [EVENT] });
    render(<ActivityFeed />);
    expect(screen.getByText(/Assigned SPE_E3 — Alex Tan/)).toBeInTheDocument();
    expect(screen.getByText('REQ0012345')).toBeInTheDocument();
  });

  /**
   * The empty copy must describe THIS source. CH-005's card said "Account, OpCo
   * and catalog changes appear here" because it read the audit trail; on the
   * operational feed that sentence would be false.
   */
  it('states what actually lands here when the feed is empty', () => {
    mockQuery({ data: [] });
    render(<ActivityFeed />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    const copy = screen.getByText(/appear here as requests move/);
    expect(copy.textContent).toMatch(/Assignments and stage changes/);
    expect(copy.textContent).not.toMatch(/Account, OpCo and catalog/i);
  });

  it('hides the "view all" link when there is nothing to view', () => {
    mockQuery({ data: [] });
    render(<ActivityFeed action={<button>View requests</button>} />);
    expect(screen.queryByText('View requests')).not.toBeInTheDocument();
  });

  it('shows the link once rows exist', () => {
    mockQuery({ data: [EVENT] });
    render(<ActivityFeed action={<button>View requests</button>} />);
    expect(screen.getByText('View requests')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty-looking card', () => {
    mockQuery({ isError: true });
    render(<ActivityFeed />);
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });

  /**
   * A stage move carries no message — the row must still say something. This is
   * the branch that would silently render an empty line if describe() lost its
   * stage fallback.
   */
  it('renders a stage move that has no message', () => {
    mockQuery({
      data: [
        {
          ...EVENT,
          id: 'ev2',
          type: 'STAGE_CHANGE',
          message: null,
          fromStage: 'QUOTING',
          toStage: 'READY',
        },
      ],
    });
    render(<ActivityFeed />);
    expect(screen.getByText(/Quoting → ready — Alex Tan/)).toBeInTheDocument();
  });
});
