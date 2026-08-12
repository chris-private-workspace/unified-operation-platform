import { describe, expect, it } from 'vitest';
import {
  allLinesAssigned,
  deriveStatus,
  licenceRequestNumbers,
  matchesFilter,
} from './requests';
import type {
  LineItemStage,
  OnboardingRequest,
  RequestLineItem,
} from './api-types';

/**
 * W43 / ADR-0025 D5 — assigning now needs TWO gates, so the derived status has
 * to answer for both. The bug this file exists to prevent is a quiet one: a
 * request whose Azure gate is open reading "Ready to assign" in the list while
 * the backend refuses it, sending an operator to click a button that 400s.
 */

const line = (stage: LineItemStage): RequestLineItem => ({
  id: `li-${stage}`,
  requestId: 'r1',
  skuCatalogId: 'sku-1',
  quantity: 1,
  procurementRequired: false,
  stage,
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
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
});

function req(over: Partial<OnboardingRequest> = {}): OnboardingRequest {
  return {
    id: 'r1',
    serviceNowSysId: null,
    serviceNowNumber: null,
    serviceNowStatus: null,
    origin: 'onboarding-intake',
    rawRequestText: null,
    requesterEmail: null,
    targetUpn: 'u@x',
    targetDisplayName: null,
    opcoId: 'o1',
    status: 'OPEN',
    handledById: null,
    accountCreatedAt: null,
    azureSyncedAt: '2026-08-01T00:00:00Z',
    serviceNowUserSyncedAt: '2026-08-01T00:05:00Z',
    serviceNowUserSysId: 'sys-1',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    lineItems: [line('READY')],
    ...over,
  };
}

describe('deriveStatus — the second sync gate (ADR-0025 D5)', () => {
  it('is ready only when BOTH gates are open', () => {
    expect(deriveStatus(req()).label).toBe('Ready to assign');
  });

  it('🔴 blocks on the ServiceNow gate even though Azure has synced', () => {
    const status = deriveStatus(req({ serviceNowUserSyncedAt: null }));
    expect(status.label).toBe('Blocked · sync');
    expect(status.tone).toBe('danger');
  });

  it('still blocks on the Azure gate alone (gate ① unchanged)', () => {
    expect(deriveStatus(req({ azureSyncedAt: null })).label).toBe(
      'Blocked · sync',
    );
  });

  /**
   * The migration back-filled nothing, so every request that existed before W43
   * carries a null gate ②. History must not turn red for it: a request whose
   * lines are all ASSIGNED was assigned under the rules of its day, and there is
   * nothing left to gate.
   */
  it('leaves a completed request completed, gate ② null or not', () => {
    expect(
      deriveStatus(
        req({ lineItems: [line('ASSIGNED')], serviceNowUserSyncedAt: null }),
      ).label,
    ).toBe('Completed');
  });

  it('does not relabel a request still in procurement', () => {
    expect(
      deriveStatus(
        req({ lineItems: [line('QUOTING')], serviceNowUserSyncedAt: null }),
      ).label,
    ).toBe('In procurement');
  });
});

/**
 * CH-024 D — the check-point row on the request detail asks this instead of
 * asking the sync gates, which is why it used to keep saying "Ready to assign"
 * after everything had been assigned.
 *
 * The gates are left OPEN in every case here on purpose: they are exactly what
 * the old code looked at, so a regression that reverts to reading them would
 * still pass a fixture that shut them.
 */
describe('allLinesAssigned (CH-024 D)', () => {
  it('every line assigned → true', () => {
    expect(allLinesAssigned(req({ lineItems: [line('ASSIGNED')] }))).toBe(true);
  });

  it('🔴 one of two assigned → false (must not flip on the first assign)', () => {
    expect(
      allLinesAssigned(req({ lineItems: [line('ASSIGNED'), line('READY')] })),
    ).toBe(false);
  });

  it('nothing assigned yet → false', () => {
    expect(allLinesAssigned(req({ lineItems: [line('READY')] }))).toBe(false);
  });

  it('cancelled lines do not count against a finished request', () => {
    expect(
      allLinesAssigned(
        req({ lineItems: [line('ASSIGNED'), line('CANCELLED')] }),
      ),
    ).toBe(true);
  });

  it('🔴 an all-cancelled request is NOT assigned — nothing was', () => {
    expect(allLinesAssigned(req({ lineItems: [line('CANCELLED')] }))).toBe(
      false,
    );
  });

  it('a request with no lines at all is not assigned', () => {
    expect(allLinesAssigned(req({ lineItems: [] }))).toBe(false);
  });
});

/**
 * CH-024 C — the licence RITMs, which are NOT `req.serviceNowNumber`.
 * `schema.prisma` warns that confusing the two is the easiest mistake here, so
 * the first case pins that this function ignores the onboarding REQ entirely.
 */
describe('licenceRequestNumbers (CH-024 C)', () => {
  const withRitm = (n: string | null) => ({
    ...line('READY'),
    serviceNowNumber: n,
  });

  it('🔴 never returns the onboarding REQ, even when the lines have no RITM', () => {
    const r = req({
      serviceNowNumber: 'REQ0012345',
      lineItems: [withRitm(null)],
    });
    expect(licenceRequestNumbers(r)).toEqual([]);
  });

  it('returns the RITM off a line', () => {
    const r = req({
      serviceNowNumber: 'REQ0012345',
      lineItems: [withRitm('RITM0047290')],
    });
    expect(licenceRequestNumbers(r)).toEqual(['RITM0047290']);
  });

  it('dedupes lines raised on one submission, keeping first-seen order', () => {
    const r = req({
      lineItems: [
        withRitm('RITM0047290'),
        withRitm('RITM0047291'),
        withRitm('RITM0047290'),
      ],
    });
    expect(licenceRequestNumbers(r)).toEqual(['RITM0047290', 'RITM0047291']);
  });

  it('skips lines with no ticket without leaving a hole', () => {
    const r = req({
      lineItems: [withRitm(null), withRitm('RITM0047290'), withRitm(null)],
    });
    expect(licenceRequestNumbers(r)).toEqual(['RITM0047290']);
  });

  it('a cancelled line keeps its ticket visible — it still exists over there', () => {
    const r = req({
      lineItems: [{ ...line('CANCELLED'), serviceNowNumber: 'RITM0047290' }],
    });
    expect(licenceRequestNumbers(r)).toEqual(['RITM0047290']);
  });
});

describe('matchesFilter — the Blocked tab covers both gates', () => {
  /**
   * The reason both gates share one label. A second label would have needed
   * this filter updated in step, and forgetting that would have dropped
   * gate-②-blocked requests out of the one tab an operator uses to find them —
   * silently, since the row would simply not be there.
   */
  it('finds a request blocked on ServiceNow', () => {
    expect(
      matchesFilter(req({ serviceNowUserSyncedAt: null }), 'blocked'),
    ).toBe(true);
  });

  it('finds a request blocked on Azure', () => {
    expect(matchesFilter(req({ azureSyncedAt: null }), 'blocked')).toBe(true);
  });

  it('does not list a request with both gates open', () => {
    expect(matchesFilter(req(), 'blocked')).toBe(false);
  });
});
