import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityFeed } from './activity-feed';
import { useAuditLog } from '@/hooks/queries';
import type { AuditEntry } from '@/lib/api-types';

// The feed's branches are hard to reach against a live trail (it has real rows,
// and stubbing the response mid-session does not reliably re-trigger the query),
// so they are pinned here instead — this also keeps them from regressing.
vi.mock('@/hooks/queries', () => ({ useAuditLog: vi.fn() }));

const mockQuery = (over: Record<string, unknown>) =>
  vi.mocked(useAuditLog).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...over,
  } as ReturnType<typeof useAuditLog>);

const ENTRY: AuditEntry = {
  id: 'a1',
  createdAt: new Date().toISOString(),
  action: 'user.role_change',
  targetType: 'AppUser',
  targetId: 'clx9k2m4a0000qwer1234abcd',
  actorId: 'u-admin',
  actor: { email: 'admin@uop.local', displayName: 'Alice Wong' },
  actorType: 'user',
  before: null,
  after: null,
  metadata: null,
};

describe('ActivityFeed (CH-005)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an audit row with its actor and target', () => {
    mockQuery({ data: { total: 1, limit: 6, offset: 0, entries: [ENTRY] } });
    render(<ActivityFeed />);
    expect(screen.getByText(/Role changed — Alice Wong/)).toBeInTheDocument();
    expect(screen.getByText(/AppUser · 34abcd/)).toBeInTheDocument();
  });

  /**
   * The empty copy must NOT promise the prototype's operational stream. The
   * placeholder this replaced said the feed "appears once request event history
   * is exposed by the API" — that endpoint never arrived and the feed shipped on
   * a different source, so the sentence would now be a lie.
   */
  it('states what actually lands here when the trail is empty', () => {
    mockQuery({ data: { total: 0, limit: 6, offset: 0, entries: [] } });
    render(<ActivityFeed />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    const copy = screen.getByText(/appear here as they are recorded/);
    expect(copy.textContent).toMatch(/Account, OpCo and catalog changes/);
    expect(copy.textContent).not.toMatch(/request event history/i);
  });

  it('hides the "view all" link when there is nothing to view', () => {
    mockQuery({ data: { total: 0, limit: 6, offset: 0, entries: [] } });
    render(<ActivityFeed action={<button>View audit log</button>} />);
    expect(screen.queryByText('View audit log')).not.toBeInTheDocument();
  });

  it('shows the link once rows exist', () => {
    mockQuery({ data: { total: 1, limit: 6, offset: 0, entries: [ENTRY] } });
    render(<ActivityFeed action={<button>View audit log</button>} />);
    expect(screen.getByText('View audit log')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty-looking card', () => {
    mockQuery({ isError: true });
    render(<ActivityFeed />);
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });
});
