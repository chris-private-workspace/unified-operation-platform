import { describe, expect, it } from 'vitest';
import { deriveStatus, matchesFilter } from './requests';
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
