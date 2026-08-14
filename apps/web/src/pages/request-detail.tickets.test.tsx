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
 * CH-024 C — the ServiceNow tickets behind one onboarding.
 * CH-030 F1 / ADR-0035 — there are THREE of them, not two.
 *
 * Tested through the render because the defect was entirely about what reached
 * the screen: the data was there all along (`RequestLineItem.serviceNowNumber`
 * has been on the wire since ADR-0008 D6) and the header simply printed the
 * onboarding REQ twice while never mentioning the licence request at all.
 *
 * 🔴 CH-030 is a second round of the same defect, one level down: CH-024 C put
 * the RITMs on screen under the label "Licence request" — which is the one
 * ticket they are not. The REQ above them genuinely had nowhere to be stored
 * (schema.prisma), so the label pointed at the nearest thing available. These
 * tests now hold BOTH shapes: post-ADR-0035 (all three) and pre (RITMs only).
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

const LINE = (over: Record<string, unknown> = {}) => ({
  id: 'li-1',
  requestId: 'r1',
  skuCatalogId: 'sku-1',
  quantity: 1,
  procurementRequired: false,
  stage: 'READY',
  serviceNowSysId: 'ritm-sys',
  serviceNowNumber: 'RITM0047290',
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
  ...over,
});

function show(over: Partial<RequestDetailType> = {}) {
  vi.mocked(useRequest).mockReturnValue({
    data: {
      id: 'r1abcdef123456',
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ0012345',
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
      azureSyncedAt: '2026-08-01T01:00:00Z',
      serviceNowUserSyncedAt: '2026-08-01T01:05:00Z',
      serviceNowUserSysId: 'u-sys',
      // CH-030 F1 / ADR-0035 — the default fixture is a request raised AFTER
      // that ADR, so it carries all three tickets. The pre-ADR shape (this
      // field null, RITMs present) has its own test below.
      serviceNowLicenceReqNumber: 'REQ0044083',
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
  render(<RequestDetail />);
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

describe('request detail — the ServiceNow tickets (CH-024 C / CH-030 F1)', () => {
  it('names all three, with the number that belongs to each', () => {
    show();

    expect(screen.getByText('Onboarding request')).toBeTruthy();
    expect(screen.getByText('REQ0012345')).toBeTruthy();
    // CH-030 F1 — the licence REQ, which before ADR-0035 had nowhere to be
    // stored and so could never appear here.
    expect(screen.getByText('Licence request')).toBeTruthy();
    expect(screen.getByText('REQ0044083')).toBeTruthy();
    // The RITMs are now labelled as what they are: the items underneath it.
    expect(screen.getByText('Licence item')).toBeTruthy();
    // Twice: the header panel and the line item that owns it.
    expect(screen.getAllByText('RITM0047290')).toHaveLength(2);
  });

  /**
   * 🔴 The two REQ numbers must not be readable as one ticket. Asserting they
   * are DIFFERENT strings is the point: a regression that fed the onboarding
   * REQ into the licence row would still satisfy every "is it on screen" check
   * above, because the number would be on screen — just the wrong one.
   */
  it('keeps the onboarding REQ and the licence REQ apart', () => {
    show();

    const onboarding = screen.getByText('REQ0012345');
    const licence = screen.getByText('REQ0044083');
    expect(onboarding).not.toBe(licence);
    expect(screen.queryAllByText('REQ0012345')).toHaveLength(1);
  });

  it('says which system raised each one', () => {
    show();

    expect(
      screen.getByText('raised in ServiceNow — the source of this onboarding'),
    ).toBeTruthy();
    expect(
      screen.getByText('raised by this platform for this joiner'),
    ).toBeTruthy();
    expect(screen.getByText('one per SKU — closed on assign')).toBeTruthy();
  });

  /**
   * 🔴 ADR-0035 D5 — the regression that would matter most in practice.
   *
   * Every request raised before ADR-0035 has `serviceNowLicenceReqNumber`
   * null, which is most of the ones in the database today. If the RITM row had
   * been made conditional on the REQ row, this change would have BLANKED the
   * licence section on every existing request — a strictly worse screen than
   * the one being fixed, and invisible in any test that only feeds new data.
   */
  it('still shows the RITMs on a request raised before ADR-0035', () => {
    show({ serviceNowLicenceReqNumber: null } as any);

    expect(screen.queryByText('Licence request')).toBeNull();
    expect(screen.queryByText('REQ0044083')).toBeNull();
    // The half that existed yesterday is untouched.
    expect(screen.getByText('Licence item')).toBeTruthy();
    expect(screen.getAllByText('RITM0047290')).toHaveLength(2);
  });

  /**
   * 🔴 The regression this guards. The header used to read
   * `req.serviceNowNumber ?? #id` in the meta row AND again in the panel, so
   * the onboarding REQ appeared twice and the licence request nowhere.
   */
  it('does not print the onboarding REQ twice', () => {
    show();

    expect(screen.getAllByText('REQ0012345')).toHaveLength(1);
    // The platform's own short ref took that slot instead — last 6 of the id.
    expect(screen.getByText('#123456')).toBeTruthy();
  });

  it('omits the licence section entirely when no ticket has been raised', () => {
    show({
      serviceNowLicenceReqNumber: null,
      lineItems: [LINE({ serviceNowNumber: null })],
    } as any);

    expect(screen.queryByText('Licence request')).toBeNull();
    expect(screen.queryByText('Licence item')).toBeNull();
    // Not "—": an empty value reads as a MISSING ticket, which is a louder and
    // different claim than "none has been raised yet".
    expect(screen.queryByText(/RITM/)).toBeNull();
    // The onboarding half is untouched by the licence half being absent.
    expect(screen.getByText('Onboarding request')).toBeTruthy();
  });

  it('lists several RITMs when the lines carry different ones', () => {
    show({
      lineItems: [
        LINE(),
        LINE({ id: 'li-2', serviceNowNumber: 'RITM0047291' }),
      ],
    } as any);

    expect(screen.getByText('Licence items')).toBeTruthy();
    expect(screen.getAllByText('RITM0047290')).toHaveLength(2);
    expect(screen.getAllByText('RITM0047291')).toHaveLength(2);
    // Still ONE licence REQ above them — several items, one request.
    expect(screen.getAllByText('REQ0044083')).toHaveLength(1);
  });
});
