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
import type { RequestDetail as RequestDetailType } from '@/lib/api-types';

/**
 * W43 F5 / ADR-0025 D4-D5 — the ServiceNow gate on the request detail.
 *
 * Tested through the render rather than a helper because what W43 added to this
 * screen is entirely about what an operator can SEE and PRESS: which check point
 * is outstanding, and which controls are offered for it. A gate the backend
 * enforces but the UI hides just turns into an unexplained 400.
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

const REQUEST = (over: Partial<RequestDetailType> = {}): RequestDetailType =>
  ({
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
    azureSyncedAt: null,
    serviceNowUserSyncedAt: null,
    serviceNowUserSysId: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    opco: { code: 'RHK', displayName: 'RHK Co' },
    lineItems: [READY_LINE],
    events: [],
    ...over,
  }) as RequestDetailType;

/** Both gates open unless a test shuts one. */
const OPEN = {
  azureSyncedAt: '2026-08-01T01:00:00Z',
  serviceNowUserSyncedAt: '2026-08-01T01:05:00Z',
} as const;

function show(over: Partial<RequestDetailType> = {}) {
  vi.mocked(useRequest).mockReturnValue({
    data: REQUEST(over),
    isLoading: false,
    isError: false,
  } as any);
  render(<RequestDetail />);
}

/**
 * By role, not by text: "Blocked · sync" is deliberately BOTH the header badge
 * (deriveStatus) and this button, so a plain text query matches two nodes. That
 * they agree is the point — the badge is what the list column shows.
 */
const assignButton = () =>
  screen.getByRole('button', {
    name: /^(Assign now|Blocked · sync)$/,
  }) as HTMLButtonElement;

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

describe('request detail — the ServiceNow check point (F5-1)', () => {
  it('shows it as a third check point, outstanding while the gate is shut', () => {
    show({ ...OPEN, serviceNowUserSyncedAt: null });

    expect(screen.getByText('Known to ServiceNow')).toBeTruthy();
    // The two it sits beside are still there — it was added, not substituted.
    expect(screen.getByText('Account created')).toBeTruthy();
    expect(screen.getByText('Synced to Azure AD')).toBeTruthy();
  });

  it('says what it is waiting on, and that nobody has to press anything', () => {
    show({ ...OPEN, serviceNowUserSyncedAt: null });

    expect(screen.getByText('Waiting on ServiceNow')).toBeTruthy();
    expect(screen.getByText('checked automatically')).toBeTruthy();
    expect(screen.queryByText('Ready to assign')).toBeNull();
  });

  /**
   * 🔴 The controls beside the check points ask GRAPH. Offering them while the
   * outstanding gate is the ServiceNow one would send the operator to re-check
   * the side that is already fine — and "Mark synced" would let them force open
   * a gate that is not the one holding this request up.
   */
  it('offers no Graph control when it is ServiceNow that is outstanding', () => {
    show({ ...OPEN, serviceNowUserSyncedAt: null });

    expect(screen.queryByText(/^Check now/)).toBeNull();
    expect(screen.queryByText('Mark synced')).toBeNull();
  });

  it('still offers them when it is the Azure gate that is shut', () => {
    show({ ...OPEN, azureSyncedAt: null });

    expect(screen.getByText(/^Check now/)).toBeTruthy();
    expect(screen.getByText('Mark synced')).toBeTruthy();
    expect(screen.queryByText('Waiting on ServiceNow')).toBeNull();
  });
});

describe('request detail — assigning needs both gates (F5-1 / ADR-0025 D5)', () => {
  it('blocks assign while the ServiceNow gate is shut', () => {
    show({ ...OPEN, serviceNowUserSyncedAt: null });

    const button = assignButton();
    expect(button.textContent).toBe('Blocked · sync');
    expect(button.disabled).toBe(true);
    // Which side, not merely that something is shut: the two are chased by
    // different people, and the tooltip is where that is said.
    expect(button.title).toBe(
      'Blocked — the target user is not in ServiceNow yet',
    );
  });

  it('keeps the Azure wording when that is the gate that is shut', () => {
    show({ ...OPEN, azureSyncedAt: null });

    expect(assignButton().title).toBe(
      'Blocked — account not synced to Azure AD',
    );
  });

  it('allows assign once both gates are open', () => {
    show(OPEN);

    const button = assignButton();
    expect(button.textContent).toBe('Assign now');
    expect(button.disabled).toBe(false);
    // Twice on purpose: the header badge (deriveStatus, same text the list
    // column shows) and the sync row. They must not be able to disagree.
    expect(screen.getAllByText('Ready to assign')).toHaveLength(2);
  });

  /**
   * H6 / DS-3 — one primary per view. The waiting state deliberately adds text
   * rather than another accent button, so the assign button stays the only
   * accent-coloured thing on screen while a gate is shut.
   */
  it('adds no second primary while waiting on ServiceNow', () => {
    show({ ...OPEN, serviceNowUserSyncedAt: null });

    // Accent-coloured BUTTONS, not accent-coloured pixels: the line-item stepper
    // paints its reached dots in the accent too, and counting those would make
    // this assertion about styling rather than about how many actions compete.
    const primaries = document.querySelectorAll('button.bg-accent');
    expect(primaries.length).toBe(1);
    expect((primaries[0] as HTMLElement).textContent).toBe('Blocked · sync');
  });
});
