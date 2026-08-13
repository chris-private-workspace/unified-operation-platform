import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestDetail } from './request-detail';
import {
  useRequest,
  useCatalog,
  useLedger,
  useTenantSkus,
} from '@/hooks/queries';
import {
  useAdvanceStage,
  useAssignLineItem,
  useMarkSynced,
  useSyncCheck,
  useUpdateRequest,
  useAddLineItem,
  useRemoveLineItem,
} from '@/hooks/mutations';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { ApiError } from '@/lib/api';
import type {
  AssignResult,
  AssignStep,
  RequestDetail as RequestDetailType,
} from '@/lib/api-types';

/**
 * W45 / ADR-0029 — the assign step breakdown, tested through the render.
 *
 * 🔴 G5 is the reason this file exists and it is a "quietly red" risk: changing
 * the 400 body could leave the operator with a dialog that says a licence
 * failed without saying why, and nothing in the type system or the API tests
 * would notice. Every assertion below is about what an operator can READ.
 */

vi.mock('@/hooks/queries', () => ({
  useRequest: vi.fn(),
  useCatalog: vi.fn(),
  useLedger: vi.fn(),
  useTenantSkus: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({
  useAdvanceStage: vi.fn(),
  useAssignLineItem: vi.fn(),
  useMarkSynced: vi.fn(),
  useSyncCheck: vi.fn(),
  useUpdateRequest: vi.fn(),
  useAddLineItem: vi.fn(),
  useRemoveLineItem: vi.fn(),
}));
vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'r1' }),
}));

const READY_LINE = {
  id: 'li-1',
  requestId: 'r1',
  skuCatalogId: 'sku-1',
  quantity: 1,
  procurementRequired: false,
  stage: 'READY',
  serviceNowSysId: 'ritm-sys',
  serviceNowNumber: 'RITM0001',
  quoteRef: null,
  poRef: null,
  quotedAt: null,
  opcoApprovedAt: null,
  vendorOrderedAt: null,
  readyAt: '2026-08-01T00:00:00Z',
  assignedAt: null,
  note: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  sku: { skuId: 'g-1', skuPartNumber: 'O365_E3', displayName: 'Office 365 E3' },
};

const REQUEST: RequestDetailType = {
  id: 'r1',
  serviceNowSysId: null,
  serviceNowNumber: 'REQ0001',
  serviceNowStatus: null,
  origin: 'onboarding-intake',
  rawRequestText: null,
  requesterEmail: null,
  targetUpn: 'new.user@rhk.com',
  targetDisplayName: 'New User',
  opcoId: 'opco-rhk',
  status: 'OPEN',
  handledById: null,
  accountCreatedAt: '2026-08-01T00:00:00Z',
  // Both gates open so "Assign now" is pressable.
  azureSyncedAt: '2026-08-01T01:00:00Z',
  serviceNowUserSyncedAt: '2026-08-01T01:05:00Z',
  serviceNowUserSysId: 'sn-user',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  opco: { code: 'RHK', displayName: 'RHK Co' },
  lineItems: [READY_LINE],
  events: [],
} as unknown as RequestDetailType;

const GATES_OK: AssignStep[] = [
  { key: 'stage', status: 'ok' },
  { key: 'sync-azure', status: 'ok' },
  { key: 'sync-servicenow', status: 'ok' },
  { key: 'directory', status: 'ok' },
  { key: 'usage-location', status: 'ok' },
  { key: 'budget', status: 'ok' },
  // CH-029 / ADR-0034 — the eighth gate, between budget and seats.
  { key: 'holding', status: 'ok' },
  { key: 'seats', status: 'ok' },
];

/** Press "Assign now" and let the mutation answer with `result`. */
function assignSucceeds(result: AssignResult) {
  vi.mocked(useAssignLineItem).mockReturnValue({
    mutate: (_vars: unknown, opts: any) => opts.onSuccess(result),
    isPending: false,
  } as any);
  render(<RequestDetail />);
  fireEvent.click(screen.getByRole('button', { name: 'Assign now' }));
}

/** Press "Assign now" and let the mutation answer with `err`. */
function assignFails(err: unknown) {
  vi.mocked(useAssignLineItem).mockReturnValue({
    mutate: (_vars: unknown, opts: any) => opts.onError(err),
    isPending: false,
  } as any);
  render(<RequestDetail />);
  fireEvent.click(screen.getByRole('button', { name: 'Assign now' }));
}

beforeEach(() => {
  vi.mocked(useCurrentUser).mockReturnValue({ role: 'ADMIN' } as any);
  vi.mocked(useRequest).mockReturnValue({
    data: REQUEST,
    isLoading: false,
    isError: false,
  } as any);
  for (const q of [useCatalog, useLedger, useTenantSkus]) {
    vi.mocked(q).mockReturnValue({ data: [] } as any);
  }
  for (const m of [
    useAdvanceStage,
    useAssignLineItem,
    useMarkSynced,
    useSyncCheck,
    useUpdateRequest,
    useAddLineItem,
    useRemoveLineItem,
  ]) {
    vi.mocked(m).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  }
});

describe('assign refusal — the operator learns which gate and who fixes it (G5)', () => {
  const blocked = new ApiError(
    400,
    'ServiceNow sync gate not passed: the target user is not in ServiceNow yet',
    {
      outcome: 'blocked',
      failedAt: 'sync-servicenow',
      steps: [
        { key: 'stage', status: 'ok' },
        { key: 'sync-azure', status: 'ok' },
        {
          key: 'sync-servicenow',
          status: 'failed',
          detail:
            'ServiceNow sync gate not passed: the target user is not in ServiceNow yet',
          retryable: true,
          whoFixes: 'servicenow',
        },
      ],
      message:
        'ServiceNow sync gate not passed: the target user is not in ServiceNow yet',
    },
  );

  /**
   * 🔴 The exact failure ADR-0029 Consequences named. It cannot go blank and
   * still pass — the assertion is on the operator-facing sentence itself.
   */
  it('never renders a blank error', () => {
    assignFails(blocked);

    expect(
      screen.getAllByText(/the target user is not in ServiceNow yet/).length,
    ).toBeGreaterThan(0);
  });

  it('names the step that stopped it, and who unblocks it', () => {
    assignFails(blocked);

    expect(screen.getByText('Target user known to ServiceNow')).toBeTruthy();
    // The whole point of `whoFixes` being an enum: this sentence is never
    // inferred from message text.
    expect(
      screen.getByText('Chased through the ServiceNow user import.'),
    ).toBeTruthy();
  });

  it('says nothing was attempted, because nothing was', () => {
    assignFails(blocked);

    expect(screen.getByText(/Nothing was assigned/)).toBeTruthy();
  });

  /**
   * 🔴 Steps after the failure are ABSENT from the response, not `skipped`.
   * Drawing a row for them would claim they were evaluated.
   */
  it('draws no row for steps that were never reached', () => {
    assignFails(blocked);

    expect(screen.queryByText('Licence applied via provider')).toBeNull();
    expect(screen.queryByText('Ledger updated')).toBeNull();
    // …and the gates it never got to are absent too.
    expect(screen.queryByText('Tenant seat available')).toBeNull();
  });

  /**
   * A 403 / 500 / dropped connection carries no steps. G5's requirement is that
   * the text never goes blank — not that everything gets a dialog.
   */
  it('falls back to the plain message when the body carries no steps', () => {
    assignFails(
      new ApiError(403, 'Only an admin may override the OpCo budget'),
    );

    expect(
      screen.getByText('Only an admin may override the OpCo budget'),
    ).toBeTruthy();
    // No dialog: there is nothing to break down.
    expect(screen.queryByText('Pre-flight')).toBeNull();
  });
});

describe('assign success — what actually happened downstream (G7 / F3-4)', () => {
  /**
   * 🔴 THE fact W44 F7-12 needed two days and a live ServiceNow query to
   * establish. `skipped` must not read like `ok`.
   */
  it('says outright when no ServiceNow record was touched', () => {
    assignSucceeds({
      outcome: 'assigned',
      steps: [
        ...GATES_OK,
        { key: 'assign', status: 'ok' },
        { key: 'ledger', status: 'ok' },
        {
          key: 'ticket',
          status: 'skipped',
          detail:
            'This line has no RITM and the request has no ServiceNow mirror',
        },
      ],
    });

    expect(screen.getByText(/no RITM and the request has no/)).toBeTruthy();
  });

  it('reports a closed RITM as a request, not as a confirmed close', () => {
    assignSucceeds({
      outcome: 'assigned',
      steps: [
        ...GATES_OK,
        { key: 'assign', status: 'ok' },
        { key: 'ledger', status: 'ok' },
        { key: 'ticket', status: 'ok', detail: 'RITM close requested' },
      ],
    });

    // "requested", not "closed" — the close is non-fatal and Delivery failures
    // stays the authority on whether it landed.
    expect(screen.getByText('RITM close requested')).toBeTruthy();
  });

  it('surfaces a busted allocation that an admin went past (G6)', () => {
    assignSucceeds({
      outcome: 'assigned',
      steps: [
        ...GATES_OK.filter((s) => s.key !== 'budget'),
        {
          key: 'budget',
          status: 'overridden',
          detail:
            'OpCo budget exceeded for O365_E3 (3 assigned of 3 allocated) — overridden by an admin.',
        },
        { key: 'assign', status: 'ok' },
        { key: 'ledger', status: 'ok' },
        { key: 'ticket', status: 'ok', detail: 'RITM close requested' },
      ],
    });

    // Visible without expanding: an override folded silently into "7 checks
    // passed" is exactly the dishonesty ADR-0016 R4 guards against.
    expect(screen.getByText(/OpCo allocation overridden/)).toBeTruthy();
  });

  it('collapses a clean pre-flight into one line', () => {
    assignSucceeds({
      outcome: 'assigned',
      steps: [
        ...GATES_OK,
        { key: 'assign', status: 'ok' },
        { key: 'ledger', status: 'ok' },
        { key: 'ticket', status: 'ok', detail: 'RITM close requested' },
      ],
    });

    // Queried on the sans half, then asserted on the whole line: the count is
    // its own mono element (DS-5), so the summary is deliberately split across
    // two nodes and only `textContent` sees what the operator actually reads.
    expect(screen.getByText(/checks passed/).textContent).toBe(
      '8 checks passed',
    );
    // Collapsed by default — the individual gates are behind the toggle.
    expect(screen.queryByText('Account synced to Azure AD')).toBeNull();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Account synced to Azure AD')).toBeTruthy();
  });

  /**
   * H6 / DS-3 — one primary per view. The result dialog's Done is it; the page
   * behind the scrim must not be adding a competing accent button.
   */
  it('offers exactly one primary action', () => {
    assignSucceeds({
      outcome: 'assigned',
      steps: [
        ...GATES_OK,
        { key: 'assign', status: 'ok' },
        { key: 'ledger', status: 'ok' },
        { key: 'ticket', status: 'ok' },
      ],
    });

    const primaries = document.querySelectorAll(
      '[role="dialog"] button.bg-accent',
    );
    expect(primaries.length).toBe(1);
    expect((primaries[0] as HTMLElement).textContent).toBe('Done');
  });
});

/**
 * CH-029 / ADR-0034 D2-D3 — the person already had it.
 *
 * The run ends `assigned` and the line closes, but no licence moved and no seat
 * was counted. Everything below is about the operator being able to READ that
 * difference: the outcome word is identical to an ordinary success, so if the
 * screen does not say so, nothing does.
 */
describe('assign success — the licence was already there (CH-029)', () => {
  const ALREADY_HELD: AssignStep[] = [
    ...GATES_OK.filter((s) => s.key !== 'holding' && s.key !== 'seats'),
    {
      key: 'holding',
      status: 'skipped',
      detail:
        'The target user already holds O365_E3 in M365 — no licence was assigned and the ledger was not incremented',
    },
    {
      key: 'seats',
      status: 'skipped',
      detail: 'No seat is needed — O365_E3 is already on the user',
    },
    {
      key: 'assign',
      status: 'skipped',
      detail: 'Nothing to assign — the licence is already on the user',
    },
    {
      key: 'ledger',
      status: 'skipped',
      detail: 'Ledger unchanged — no seat was consumed',
    },
    { key: 'ticket', status: 'ok', detail: 'RITM close requested' },
  ];

  /**
   * 🔴 The banner is the ONE line an operator reads without expanding anything,
   * and until CH-029 it said "ledger updated" unconditionally. On this path
   * that is simply untrue, and it is untrue about the exact number the whole
   * change exists to protect.
   */
  it('does not claim the ledger was updated', () => {
    assignSucceeds({ outcome: 'assigned', steps: ALREADY_HELD });

    expect(screen.queryByText(/ledger updated/)).toBeNull();
    expect(screen.getByText(/Already licensed/)).toBeTruthy();
  });

  /**
   * A skipped gate is not a passed one — assign-step.ts says so in as many
   * words. Counting these as passes would put "8 checks passed" on a run where
   * two of them never ran.
   */
  it('counts the skipped gates as skipped, not as passed', () => {
    assignSucceeds({ outcome: 'assigned', steps: ALREADY_HELD });

    const summary = screen.getByText(/checks passed/).textContent;
    expect(summary).toBe('6 checks passed · 2 skipped');
  });

  it('says why, in the operator’s own words, once expanded', () => {
    assignSucceeds({ outcome: 'assigned', steps: ALREADY_HELD });

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/already holds O365_E3 in M365/)).toBeTruthy();
    expect(screen.getByText('Not already licensed')).toBeTruthy();
  });

  /**
   * ADR-0034 D6 — the read failed, so the assign went ahead blind. The
   * degradation is silent by construction (the outcome is a normal success),
   * which is why the step is not allowed to read like a check that passed.
   */
  it('shows an unconfirmed holding check as skipped, never as passed', () => {
    assignSucceeds({
      outcome: 'assigned',
      steps: [
        ...GATES_OK.filter((s) => s.key !== 'holding'),
        {
          key: 'holding',
          status: 'skipped',
          detail:
            'Could not confirm whether the target user already holds O365_E3 — the M365 lookup failed, so the licence was assigned anyway. If they already had it, the ledger now counts it twice',
        },
        { key: 'assign', status: 'ok' },
        { key: 'ledger', status: 'ok' },
        { key: 'ticket', status: 'ok', detail: 'RITM close requested' },
      ],
    });

    expect(screen.getByText(/checks passed/).textContent).toBe(
      '7 checks passed · 1 skipped',
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/Could not confirm/)).toBeTruthy();
  });
});
