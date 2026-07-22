import { describe, expect, it } from 'vitest';
import { matchesFilter } from './requests';
import type { OnboardingRequest } from './api-types';

function req(overrides: Partial<OnboardingRequest>): OnboardingRequest {
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
    azureSyncedAt: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    lineItems: [],
    ...overrides,
  };
}

describe('matchesFilter — My queue (AUTH-3b)', () => {
  it('matches a request handled by me', () => {
    expect(matchesFilter(req({ handledById: 'me-1' }), 'mine', 'me-1')).toBe(
      true,
    );
  });
  it('excludes a request handled by someone else', () => {
    expect(matchesFilter(req({ handledById: 'other' }), 'mine', 'me-1')).toBe(
      false,
    );
  });
  it('excludes an unassigned request', () => {
    expect(matchesFilter(req({ handledById: null }), 'mine', 'me-1')).toBe(
      false,
    );
  });
  it('matches nothing when meId is absent (role still loading)', () => {
    expect(matchesFilter(req({ handledById: 'me-1' }), 'mine', null)).toBe(
      false,
    );
    expect(matchesFilter(req({ handledById: 'me-1' }), 'mine')).toBe(false);
  });
  it('all filter is unaffected by the new meId param', () => {
    expect(matchesFilter(req({ handledById: 'other' }), 'all')).toBe(true);
  });
});
