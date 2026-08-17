import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AiAssistCard } from './ai-assist-card';
import { useAgentRun } from '@/hooks/queries';
import {
  useAbortAgentRun,
  useDecideProposal,
  useHideAgentRun,
  useStartAgentRun,
} from '@/hooks/mutations';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import type { AgentRun, Role } from '@/lib/api-types';

/**
 * W46 F8 — the agent card.
 *
 * 🔴 The claim worth testing here is not "it renders". It is that a reader can
 * still tell the two kinds of record apart (ADR-0036 D4): what the PLATFORM
 * observed, and what the AGENT said about itself. INC-001 is what happens when
 * that distinction stops being visible, so it is asserted rather than assumed.
 *
 * The second is F8-3: approving decides that something SHOULD happen, never
 * that it may skip the checks — and that is counter-intuitive enough that the
 * screen has to say it.
 */

vi.mock('@/hooks/queries', () => ({ useAgentRun: vi.fn() }));
// 期二 G6 — the SSE hook reaches for a QueryClient, which this file does not
// provide. Its own behaviour is `agent-run-events.test.ts`; here it only has to
// not exist.
vi.mock('@/hooks/agent-run-events', () => ({ useAgentRunEvents: vi.fn() }));
vi.mock('@/hooks/mutations', () => ({
  useStartAgentRun: vi.fn(),
  useAbortAgentRun: vi.fn(),
  useHideAgentRun: vi.fn(),
  useDecideProposal: vi.fn(),
}));
// CH-031 — the card asks who is looking before offering Hide (ADR-0040 D7).
vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));

const GUID = '11111111-2222-3333-4444-555555555555';

const start = { mutate: vi.fn(), isPending: false, error: null };
const abort = { mutate: vi.fn(), isPending: false, error: null };
const hide = { mutate: vi.fn(), isPending: false, error: null };
const decide = { mutate: vi.fn(), isPending: false, error: null };

const asRole = (role: Role) =>
  vi.mocked(useCurrentUser).mockReturnValue({ role } as never);

const RUN = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: 'run-1',
  requestId: 'r1',
  status: 'awaiting_approval',
  startedById: 'u-admin',
  startedAt: '2026-08-16T01:00:00Z',
  endedAt: null,
  steps: [
    {
      id: 's1',
      key: 'start',
      status: 'ok',
      detail: 'Run started for request r1',
      createdAt: '2026-08-16T01:00:00Z',
    },
    {
      id: 's2',
      key: 'search_catalog',
      status: 'ok',
      createdAt: '2026-08-16T01:00:05Z',
    },
  ],
  messages: [
    {
      id: 'm1',
      role: 'assistant',
      content: 'I have created the line items already.',
      createdAt: '2026-08-16T01:00:06Z',
    },
  ],
  proposals: [
    {
      id: 'p1',
      kind: 'line_items',
      status: 'pending',
      payload: {
        requestId: 'r1',
        items: [{ skuId: GUID, quantity: 2 }],
        reasoning: 'The remark asks for two E5 seats.',
      },
      createdAt: '2026-08-16T01:00:06Z',
    },
  ],
  ...over,
});

const showRun = (run: AgentRun | null, isLoading = false) => {
  vi.mocked(useAgentRun).mockReturnValue({ data: run, isLoading } as never);
  render(<AiAssistCard requestId="r1" />);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useStartAgentRun).mockReturnValue(start as never);
  vi.mocked(useAbortAgentRun).mockReturnValue(abort as never);
  vi.mocked(useHideAgentRun).mockReturnValue(hide as never);
  vi.mocked(useDecideProposal).mockReturnValue(decide as never);
  asRole('ADMIN');
});

describe('no run yet', () => {
  it('offers to start one and says the agent creates nothing on its own', () => {
    showRun(null);

    expect(screen.getByText('No run yet')).toBeTruthy();
    expect(screen.getByText(/creates nothing on its own/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Run AI Assist'));
    expect(start.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 D4 — two kinds of record, told apart', () => {
  it('leads with what the platform observed, under its own heading', () => {
    showRun(RUN());

    expect(screen.getByText('What ran')).toBeTruthy();
    // Operator-facing labels, never the raw key.
    expect(screen.getByText('Run started')).toBeTruthy();
    expect(screen.getByText('Searched the catalogue')).toBeTruthy();
    expect(screen.queryByText('search_catalog')).toBeNull();
  });

  it('keeps the transcript collapsed, and warns what it is when opened', () => {
    showRun(RUN());

    // 🔴 The model's claim must NOT be on screen next to the steps by default:
    // "I have created the line items already" is exactly the sentence INC-001
    // is about, and a reader skimming the card should meet the evidence first.
    expect(screen.queryByText(/I have created the line items/)).toBeNull();

    fireEvent.click(screen.getByText('Transcript'));

    expect(screen.getByText(/I have created the line items/)).toBeTruthy();
    expect(
      screen.getByText(/not evidence that anything happened/i),
    ).toBeTruthy();
  });
});

describe('🔴 F8-3 — approving is not a bypass', () => {
  it('says the platform checks still run, next to the button that approves', () => {
    showRun(RUN());

    // ADR-0036 D3's counter-intuitive consequence. Asserted because the whole
    // reason it is written on screen is that nobody expects it.
    expect(
      screen.getByText(/normal checks — they can still refuse/i),
    ).toBeTruthy();
  });

  it('shows the proposed SKU as a GUID, never as a product name', () => {
    showRun(RUN());

    // plan §3.4 / R15 — the catalogue carries more than one E5, so a name does
    // not identify a product. The card shows what the proposal actually says.
    expect(screen.getByText(new RegExp(GUID))).toBeTruthy();
    expect(screen.getByText(/The remark asks for two E5 seats/)).toBeTruthy();
  });

  it('approves with no reason, and rejects only with one', () => {
    showRun(RUN());

    fireEvent.click(screen.getByText('Approve'));
    expect(decide.mutate).toHaveBeenCalledWith({ proposalId: 'p1' });

    decide.mutate.mockClear();
    fireEvent.click(screen.getByText('Reject'));

    // The confirm is disabled until there are words: the reason is stored on
    // the proposal AND sent back to the agent, so an empty one fails both
    // readers.
    const confirm = screen.getAllByText('Reject').at(-1) as HTMLElement;
    fireEvent.click(confirm);
    expect(decide.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/add-ons/i), {
      target: { value: 'Only the base licence was asked for' },
    });
    fireEvent.click(screen.getAllByText('Reject').at(-1) as HTMLElement);
    expect(decide.mutate).toHaveBeenCalledWith({
      proposalId: 'p1',
      reason: 'Only the base licence was asked for',
    });
  });
});

/**
 * 期二 G1 — an `assign` proposal is a different payload shape, and the Approve
 * button beside it assigns a real licence.
 *
 * 🔴 These exist because G1 nearly shipped without them. `ProposalSummary` read
 * only `payload.items`, so an assign proposal rendered as "Nothing proposed."
 * with a working Approve button next to it — a person could have authorised
 * something the screen had declined to describe, which is worse than the
 * feature not existing.
 */
describe('🔴 G1 — an assign proposal has to describe itself', () => {
  const assignRun = (payload: Record<string, unknown>) =>
    RUN({
      proposals: [
        {
          id: 'p1',
          kind: 'assign',
          status: 'pending',
          payload,
          createdAt: '2026-08-16T01:00:06Z',
        },
      ],
    } as Partial<AgentRun>);

  it('names the line item and says the platform still checks it', () => {
    showRun(
      assignRun({ lineItemId: 'line-abc', reasoning: 'This line is READY.' }),
    );

    expect(screen.getByText('Proposed licence assignment')).toBeTruthy();
    expect(screen.getByText(/line-abc/)).toBeTruthy();
    expect(screen.getByText('This line is READY.')).toBeTruthy();
    // The counter-intuitive half stays on screen for this kind too.
    expect(screen.getByText(/they can still refuse/i)).toBeTruthy();
  });

  it('refuses to imply emptiness when it cannot read the payload', () => {
    // A kind or shape this build does not understand. The old fallback said
    // "Nothing proposed.", which reads as "there is nothing here" — beside a
    // button that would have gone ahead anyway.
    showRun(assignRun({ somethingElse: true }));

    expect(screen.getByText(/cannot be displayed/i)).toBeTruthy();
    expect(screen.queryByText('Nothing proposed.')).toBeNull();
  });
});

describe('stopping a run', () => {
  it.each(['running', 'awaiting_approval'] as const)(
    'offers Stop while the run is %s',
    (status) => {
      showRun(RUN({ status }));

      fireEvent.click(screen.getByText('Stop'));
      expect(abort.mutate).toHaveBeenCalledWith('run-1');
    },
  );

  it.each(['completed', 'failed', 'aborted'] as const)(
    'offers no Stop once the run is %s',
    (status) => {
      showRun(RUN({ status, proposals: [] }));

      // A button whose only possible outcome is an error is worse than no
      // button — `abortRun` refuses a terminal run.
      expect(screen.queryByText('Stop')).toBeNull();
    },
  );

  it('shows a decided proposal as no longer awaiting anyone', () => {
    showRun(
      RUN({
        status: 'completed',
        proposals: [
          {
            id: 'p1',
            kind: 'line_items',
            status: 'executed',
            payload: {},
            createdAt: '2026-08-16T01:00:06Z',
          },
        ],
      }),
    );

    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText(/normal checks/i)).toBeNull();
  });
});

/**
 * CH-031 / ADR-0040 — hiding a run.
 *
 * 🔴 Both gates are mirrored from the server rather than trusted, and both are
 * asserted here for the same reason the Stop tests above assert their absence:
 * a control whose only possible outcome is 409 or 403 is worse than no control.
 */
describe('CH-031 — hiding a finished run', () => {
  it.each(['completed', 'failed', 'aborted', 'expired'] as const)(
    'offers Hide to an admin once the run is %s',
    (status) => {
      showRun(RUN({ status, proposals: [] }));

      fireEvent.click(screen.getByText('Hide'));
      expect(hide.mutate).toHaveBeenCalledWith('run-1');
    },
  );

  it.each(['running', 'awaiting_approval', 'approved'] as const)(
    'offers no Hide while the run is still %s',
    (status) => {
      showRun(RUN({ status }));

      // D6: hiding a run that still holds a pending proposal would leave that
      // proposal in the approval queue with nobody able to see it.
      expect(screen.queryByText('Hide')).toBeNull();
    },
  );

  it.each(['REGIONAL', 'OPCO_IT'] as const)(
    'offers no Hide to %s, who would be 403d',
    (role) => {
      asRole(role);
      showRun(RUN({ status: 'completed', proposals: [] }));

      expect(screen.queryByText('Hide')).toBeNull();
    },
  );

  it('still offers Stop to a non-admin — hiding is the narrower power', () => {
    asRole('REGIONAL');
    showRun(RUN({ status: 'running' }));

    // The two are deliberately not the same permission (D7): REGIONAL runs the
    // agent and decides its proposals, and only ADMIN makes a record vanish.
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.queryByText('Hide')).toBeNull();
  });

  it('surfaces a failed hide instead of swallowing it', () => {
    vi.mocked(useHideAgentRun).mockReturnValue({
      ...hide,
      error: new Error('This run is still running; stop it before hiding it'),
    } as never);
    showRun(RUN({ status: 'completed', proposals: [] }));

    expect(screen.getByText(/stop it before hiding it/i)).toBeTruthy();
  });
});
