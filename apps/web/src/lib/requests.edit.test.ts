import { describe, expect, it } from 'vitest';
import { canAddLine, canEditUpn, canRemoveLine } from './requests';

// CH-007 edit-lock gating. These mirror the backend guards; the UI shows a
// control only when the matching function is true. Each test is written so that
// a wrong boolean flips it — i.e. the "locked" cases really assert false.

describe('canEditUpn (D2 — sync gate)', () => {
  it('allows editing the UPN before the account has synced', () => {
    expect(canEditUpn({ azureSyncedAt: null })).toBe(true);
  });

  it('locks the UPN once the account has synced', () => {
    expect(canEditUpn({ azureSyncedAt: '2026-07-01T00:00:00Z' })).toBe(false);
  });
});

describe('canRemoveLine (D5 — no RITM AND still REQUESTED)', () => {
  it('allows removing a REQUESTED line with no ServiceNow RITM', () => {
    expect(canRemoveLine({ serviceNowSysId: null, stage: 'REQUESTED' })).toBe(
      true,
    );
  });

  it('locks a line that has an RITM in ServiceNow', () => {
    expect(
      canRemoveLine({ serviceNowSysId: 'ritm-sys-1', stage: 'REQUESTED' }),
    ).toBe(false);
  });

  it('locks a line that has moved past REQUESTED', () => {
    expect(canRemoveLine({ serviceNowSysId: null, stage: 'READY' })).toBe(
      false,
    );
  });

  // Both conditions must hold — a line can be advanced AND have an RITM.
  it('locks a line that is both advanced and in ServiceNow', () => {
    expect(
      canRemoveLine({ serviceNowSysId: 'ritm-sys-1', stage: 'ASSIGNED' }),
    ).toBe(false);
  });
});

describe('canAddLine (D6 — intake requests only)', () => {
  it('allows adding to an onboarding-intake request', () => {
    expect(canAddLine({ origin: 'onboarding-intake' })).toBe(true);
  });

  it('locks adding to a platform-created request (already fully in SN)', () => {
    expect(canAddLine({ origin: 'platform-created' })).toBe(false);
  });
});
