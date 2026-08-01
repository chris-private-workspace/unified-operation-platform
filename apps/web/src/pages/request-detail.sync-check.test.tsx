import { render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestDetail } from './request-detail';
import { useRequest, useCatalog, useLedger, useTenantSkus } from '@/hooks/queries';
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
 * CH-015 — the sync-check control on the request detail.
 *
 * The three outcomes are tested through the rendered toast rather than a pure
 * helper on purpose: the failure this guards against is a WORDING one (a
 * throttle rendered as "not synced" would send an operator chasing an account
 * that is fine), and wording only exists at this layer.
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
    accountCreatedAt: null,
    azureSyncedAt: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    opco: { code: 'RHK', displayName: 'RHK Co' },
    lineItems: [],
    events: [],
    ...over,
  }) as RequestDetailType;

let checkMutate: ReturnType<typeof vi.fn>;

/** Make the next Check now click resolve with this server result. */
function respondWith(status: string, retryAfterSeconds: number) {
  checkMutate.mockImplementation((_vars: unknown, opts: any) =>
    opts?.onSuccess?.({ status, retryAfterSeconds, request: REQUEST() }),
  );
}

const clickCheck = () => fireEvent.click(screen.getByText(/^Check now/));

/**
 * Advance the countdown one second at a time. Each tick has to leave `act` for
 * React to re-render and the effect to arm the NEXT timeout — advancing 2000ms
 * in one go fires one callback and drops the second, which reads as a bug in
 * the countdown when it is an artefact of the test.
 */
function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    act(() => void vi.advanceTimersByTime(1000));
  }
}

beforeEach(() => {
  vi.mocked(useCurrentUser).mockReturnValue({ role: 'ADMIN' } as any);
  vi.mocked(useRequest).mockReturnValue({
    data: REQUEST(),
    isLoading: false,
    isError: false,
  } as any);
  for (const q of [useCatalog, useLedger, useTenantSkus]) {
    vi.mocked(q).mockReturnValue({ data: [] } as any);
  }

  checkMutate = vi.fn();
  vi.mocked(useSyncCheck).mockReturnValue({
    mutate: checkMutate,
    isPending: false,
  } as any);
  for (const m of [
    useAdvanceStage,
    useAssignLineItem,
    useMarkSynced,
    useUpdateRequest,
    useAddLineItem,
    useRemoveLineItem,
  ]) {
    vi.mocked(m).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  }
});

afterEach(() => vi.useRealTimers());

describe('request detail — sync check (CH-015)', () => {
  it('offers Check now as the primary and demotes Mark synced to ghost', () => {
    render(<RequestDetail />);

    // H6: exactly one primary in the sync area. bg-accent is the Ricoh red.
    expect(screen.getByText(/^Check now/).className).toContain('bg-accent');
    expect(screen.getByText('Mark synced').className).not.toContain(
      'bg-accent',
    );
  });

  it('reports a hit as verified', () => {
    respondWith('FOUND', 0);
    render(<RequestDetail />);

    clickCheck();

    expect(screen.getByText(/Verified in Azure AD/)).toBeTruthy();
  });

  it('reports a miss as "not yet", never as a failure', () => {
    respondWith('NOT_FOUND', 30);
    render(<RequestDetail />);

    clickCheck();

    expect(screen.getByText('Not in Azure AD yet · retry in 30s')).toBeTruthy();
  });

  /**
   * The wording bug this whole test file exists for: a throttle means nobody
   * asked Graph anything, so it must not be reported as a fact about the
   * account.
   */
  it('reports a throttle as "just checked", NOT as a sync result', () => {
    respondWith('THROTTLED', 25);
    render(<RequestDetail />);

    clickCheck();

    expect(screen.getByText('Just checked · retry in 25s')).toBeTruthy();
    expect(screen.queryByText(/Not in Azure AD/)).toBeNull();
  });

  it('disables the button and counts down while cooling off', () => {
    vi.useFakeTimers();
    respondWith('NOT_FOUND', 30);
    render(<RequestDetail />);

    clickCheck();

    const cooling = screen.getByText(/^Check now/) as HTMLButtonElement;
    expect(cooling.textContent).toBe('Check now · 30s');
    expect(cooling.disabled).toBe(true);

    tick(2);
    expect(screen.getByText(/^Check now/).textContent).toBe('Check now · 28s');
  });

  it('re-enables once the countdown reaches zero', () => {
    vi.useFakeTimers();
    respondWith('NOT_FOUND', 2);
    render(<RequestDetail />);

    clickCheck();
    tick(2);

    const button = screen.getByText(/^Check now/) as HTMLButtonElement;
    expect(button.textContent).toBe('Check now');
    expect(button.disabled).toBe(false);
  });

  it('shows neither button once the gate is open', () => {
    vi.mocked(useRequest).mockReturnValue({
      data: REQUEST({ azureSyncedAt: '2026-08-01T01:00:00Z' }),
      isLoading: false,
      isError: false,
    } as any);
    render(<RequestDetail />);

    expect(screen.getByText('Ready to assign')).toBeTruthy();
    expect(screen.queryByText(/^Check now/)).toBeNull();
    expect(screen.queryByText('Mark synced')).toBeNull();
  });
});
