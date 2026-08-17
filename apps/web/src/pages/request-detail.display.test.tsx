import { render, screen } from '@testing-library/react';
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
import { formatDateTime } from '@/lib/format';
import type { RequestDetail as RequestDetailType } from '@/lib/api-types';

/**
 * CH-030 F2 / F3 / F4 — three display corrections on the request detail screen.
 *
 * All three are about what the screen SAYS versus what is true, which is why
 * they are tested through the render rather than against a helper:
 *
 *   F2 — the stepper draws dots and puts every label in `title=`, so "Completed"
 *        (CH-025 A) only existed in a hover tooltip.
 *   F3 — two of the three sync steps carry a timestamp the platform observed;
 *        the third carries one it invented, so it gets none.
 *   F4 — a "Coming soon" preview card held the top of the right column.
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
// W46 F8 — stubbed with a marker, not with null: these files are about
// the request, not the agent, so they should not have to satisfy the
// card's own data needs — but the ROLE GATING around it is a
// request-detail concern, and a marker keeps that assertable.
vi.mock('@/components/requests/ai-assist-card', () => ({
  AiAssistCard: () => <div data-testid="ai-assist-card" />,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'r1' }),
}));

// 🔴 Deliberately three DIFFERENT months. The whole point of F3 is that one of
// these must not reach the screen, and same-day values would let a leak hide
// behind a matching sibling.
const ACCOUNT_AT = '2026-06-15T02:00:00Z';
const AZURE_AT = '2026-07-20T03:00:00Z';
const SN_AT = '2026-08-05T04:00:00Z';

const LINE = (over: Record<string, unknown> = {}) => ({
  id: 'li-1',
  requestId: 'r1',
  skuCatalogId: 'sku-1',
  quantity: 1,
  procurementRequired: false,
  stage: 'READY',
  serviceNowSysId: null,
  serviceNowNumber: null,
  quoteRef: null,
  poRef: null,
  quotedAt: null,
  opcoApprovedAt: null,
  vendorOrderedAt: null,
  readyAt: null,
  assignedAt: null,
  note: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  sku: { skuId: 'g-1', skuPartNumber: 'O365_E3', displayName: 'Office 365 E3' },
  ...over,
});

function show(over: Partial<RequestDetailType> = {}) {
  vi.mocked(useRequest).mockReturnValue({
    data: {
      id: 'r1abcdef123456',
      serviceNowSysId: null,
      serviceNowNumber: null,
      serviceNowStatus: null,
      origin: 'onboarding-intake',
      rawRequestText: null,
      requesterEmail: null,
      targetUpn: 'new.user@rhk.com',
      targetDisplayName: 'New User',
      opcoId: 'opco-rhk',
      status: 'OPEN',
      handledById: null,
      accountCreatedAt: ACCOUNT_AT,
      azureSyncedAt: AZURE_AT,
      serviceNowUserSyncedAt: SN_AT,
      serviceNowUserSysId: 'u-sys',
      serviceNowLicenceReqNumber: null,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      opco: { code: 'RHK', displayName: 'RHK Co' },
      lineItems: [LINE()],
      events: [],
      ...over,
    },
    isLoading: false,
    isError: false,
  } as any);
  return render(<RequestDetail />);
}

beforeEach(() => {
  vi.mocked(useCurrentUser).mockReturnValue({ role: 'ADMIN' } as any);
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

describe('CH-030 F2 — the stepper says which step it is on', () => {
  it('names the terminal step on a finished line', () => {
    show({ lineItems: [LINE({ stage: 'ASSIGNED' })] } as any);

    // 🔴 The word itself, not just the count. "Step 4/4" was already on screen
    // and is exactly what read as "one step still outstanding".
    expect(screen.getByText('Step 4/4 · Completed')).toBeTruthy();
  });

  it('names the current stage mid-path', () => {
    show();

    expect(screen.getByText('Step 2/4 · READY')).toBeTruthy();
  });

  it('follows the longer procurement path too', () => {
    show({
      lineItems: [LINE({ procurementRequired: true, stage: 'QUOTING' })],
    } as any);

    // 7, not 6: PROC_STEPS has six stages and `displayStepsFor` appends the
    // display-only terminal marker (CH-025 A).
    expect(screen.getByText('Step 2/7 · QUOTING')).toBeTruthy();
  });
});

describe('CH-030 F3 — sync timestamps, and the one that is withheld', () => {
  it('shows when each gate the platform observed actually opened', () => {
    show();

    expect(screen.getByText(formatDateTime(AZURE_AT))).toBeTruthy();
    expect(screen.getByText(formatDateTime(SN_AT))).toBeTruthy();
  });

  /**
   * 🔴 The reason this change exists at all.
   *
   * Neither n8n intake path sends `accountCreatedAt`, so `open-sync-gate.ts`
   * fills it with `?? now` when the gate opens — the same instant it writes
   * `azureSyncedAt`. Printing it would put an identical timestamp on two steps
   * and let the screen claim the account was created and replicated in the same
   * second. That claim would be the UI's, not the data's.
   *
   * Two assertions on purpose: the first is exact but shares `formatDateTime`
   * with the component, so a change to that function could make it pass
   * vacuously. The second is a plain substring that knows nothing about the
   * formatter.
   */
  it('does NOT show the AD account-created time', () => {
    const { container } = show();

    expect(screen.queryByText(formatDateTime(ACCOUNT_AT))).toBeNull();
    expect(container.textContent).not.toContain('Jun 15');
    // The step itself is still there and still ticked — only its time is gone.
    expect(screen.getByText('AD account created')).toBeTruthy();
  });

  it('prints no time at all — not a dash — while a gate is still shut', () => {
    show({
      azureSyncedAt: null,
      serviceNowUserSyncedAt: null,
    } as any);

    expect(screen.getByText('Synced to Azure AD')).toBeTruthy();
    expect(screen.getByText('Synced to ServiceNow')).toBeTruthy();
    // '—' is what formatDateTime(null) returns, so rendering it unconditionally
    // would read as "we looked and found nothing" on a gate nobody has reached.
    //
    // Matched as a WHOLE element rather than a substring of the page: the AI
    // Assist card's description contains an em-dash mid-sentence, so a
    // `textContent` check would fail on prose that has nothing to do with this.
    expect(screen.queryByText('—')).toBeNull();
  });
});

describe('CH-030 F4 — the right column leads with real history', () => {
  it('puts Operational history above AI Assist', () => {
    show();

    const history = screen.getByText('Operational history');
    // W46 F8 replaced the "Coming soon" card with the real one, so the anchor
    // moved from its title text to the stub's marker. The CLAIM is unchanged —
    // history leads the column — which is why this test was updated rather than
    // deleted along with the placeholder it originally described.
    const ai = screen.getByTestId('ai-assist-card');
    // DOM order, not styling: asserting on the rendered position is what makes
    // this a real check rather than a restatement of the JSX.
    expect(
      history.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // 🔴 The mirror assertion, because a bitmask check is the kind that passes
    // for the wrong reason. If the mask were wrong (or `compareDocumentPosition`
    // returned a value where both bits happen to be set), the line above would
    // be green whatever the order — this one would not.
    expect(
      ai.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeFalsy();
  });
});

describe('W46 F8 — who sees the agent card', () => {
  it.each(['ADMIN', 'REGIONAL'] as const)('shows it to %s', (role) => {
    vi.mocked(useCurrentUser).mockReturnValue({ role } as never);
    show();

    expect(screen.queryByTestId('ai-assist-card')).toBeTruthy();
  });

  it('hides it from OPCO_IT rather than showing a card that can only 403', () => {
    // Every /agent route is @Roles(ADMIN, REGIONAL). The server guard is the
    // real one — this only stops offering a button that cannot work. 🔴 Stated
    // that way round on purpose: a hidden card is not a permission, and reading
    // it as one is how the next change ships an endpoint with no @Roles.
    vi.mocked(useCurrentUser).mockReturnValue({ role: 'OPCO_IT' } as never);
    show();

    expect(screen.queryByTestId('ai-assist-card')).toBeNull();
  });
});
