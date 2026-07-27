import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAssignLineItem } from './mutations';
import { apiPatch } from '@/lib/api';

// CH-009 A6. The other component tests mock the hooks away, which cannot prove
// anything about invalidation — so this one drives a REAL QueryClient and spies
// on invalidateQueries. Rationale for testing it at all: A6 originally planned a
// live check, but that needs a real assign, and an assign calls the real tenant
// Graph (CLAUDE.md §3.4 forbids it, and GraphService is not env-mockable). The
// proxy alternative (edit via By-OpCo, come back) proves nothing either — leaving
// the page re-mounts it, so the fresh number comes from a re-fetch, not from
// invalidation. This test isolates the one claim that was actually unverified.
vi.mock('@/lib/api', () => ({
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

const REQUEST_ID = 'req-1';

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** Run one successful assign and return every queryKey that got invalidated. */
async function invalidatedKeysAfterAssign(): Promise<string[]> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const spy = vi.spyOn(client, 'invalidateQueries');
  vi.mocked(apiPatch).mockResolvedValue({ id: 'li-1' } as never);

  const { result } = renderHook(() => useAssignLineItem(REQUEST_ID), {
    wrapper: wrapperFor(client),
  });
  result.current.mutate({ lineItemId: 'li-1' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  return spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
}

describe('useAssignLineItem invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The bug this locks down: request detail now renders assignedQuantity right
  // next to the Assign button, so without this invalidation the operator sees a
  // stale budget immediately after assigning — the exact opposite of CH-009's
  // purpose. Delete the ledger invalidation and this test fails.
  it('invalidates the ledger so the capacity figure refreshes after an assign', async () => {
    const keys = await invalidatedKeysAfterAssign();
    expect(keys).toContain(JSON.stringify(['license', 'ledger']));
  });

  // Deliberate omission (spec D1): tenant seats come from TenantSkuSnapshot,
  // which an assign never writes — it is an as-of-last-sync figure on purpose.
  // This also catches someone widening the key to ['license'], which would drag
  // tenant-skus in and make the "last sync" label a lie.
  it('does NOT invalidate tenant-skus (an assign does not touch the snapshot)', async () => {
    const keys = await invalidatedKeysAfterAssign();
    expect(keys).not.toContain(JSON.stringify(['license', 'tenant-skus']));
    expect(keys).not.toContain(JSON.stringify(['license']));
  });

  // Guards the pre-existing behaviour CH-009 must not have broken.
  it('still invalidates the request, the request list and drift', async () => {
    const keys = await invalidatedKeysAfterAssign();
    expect(keys).toContain(
      JSON.stringify(['fulfilment', 'requests', REQUEST_ID]),
    );
    expect(keys).toContain(JSON.stringify(['fulfilment', 'requests']));
    expect(keys).toContain(JSON.stringify(['license', 'drift']));
  });

  // ── W36 / ADR-0016 D3: what actually goes on the wire ──
  //
  // This matters more than it looks. A non-admin sending budgetOverrideReason
  // gets a 403 (the backend refuses to silently ignore it), so an accidentally
  // always-present field would break every OPCO_IT assign — a failure mode the
  // invalidation tests above cannot see.
  describe('request body', () => {
    /** Run one assign and return the body passed to apiPatch. */
    async function bodyFor(vars: {
      lineItemId: string;
      usageLocation?: string;
      budgetOverrideReason?: string;
    }) {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      vi.mocked(apiPatch).mockResolvedValue({ id: 'li-1' } as never);

      const { result } = renderHook(() => useAssignLineItem(REQUEST_ID), {
        wrapper: wrapperFor(client),
      });
      result.current.mutate(vars);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      return vi.mocked(apiPatch).mock.calls[0][1];
    }

    it('sends no body at all for a plain assign (pre-W36 behaviour)', async () => {
      expect(await bodyFor({ lineItemId: 'li-1' })).toBeUndefined();
    });

    it('carries the override reason when an admin supplies one', async () => {
      expect(
        await bodyFor({
          lineItemId: 'li-1',
          budgetOverrideReason: 'RHK urgent hire, tops up next week',
        }),
      ).toEqual({ budgetOverrideReason: 'RHK urgent hire, tops up next week' });
    });

    it('still carries usageLocation alone, and both together', async () => {
      expect(
        await bodyFor({ lineItemId: 'li-1', usageLocation: 'HK' }),
      ).toEqual({ usageLocation: 'HK' });

      vi.clearAllMocks();
      expect(
        await bodyFor({
          lineItemId: 'li-1',
          usageLocation: 'HK',
          budgetOverrideReason: 'documented exception here',
        }),
      ).toEqual({
        usageLocation: 'HK',
        budgetOverrideReason: 'documented exception here',
      });
    });
  });

  it('invalidates nothing when the assign fails (backend gates fail closed)', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const spy = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(apiPatch).mockRejectedValue(new Error('No available seats'));

    const { result } = renderHook(() => useAssignLineItem(REQUEST_ID), {
      wrapper: wrapperFor(client),
    });
    result.current.mutate({ lineItemId: 'li-1' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(spy).not.toHaveBeenCalled();
  });
});
