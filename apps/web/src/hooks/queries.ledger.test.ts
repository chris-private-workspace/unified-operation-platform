import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useLedger, useLedgerStats } from './queries';
import { apiGet } from '@/lib/api';

// CH-008. What is actually at risk here is not the filter itself (that lives in
// the backend, tested there) but the wiring around it: which URL each caller
// ends up requesting, and whether the reshaped query key still answers to the
// ['license','ledger'] invalidation every ledger mutation fires.
vi.mock('@/lib/api', () => ({ apiGet: vi.fn() }));

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

/** URLs passed to apiGet so far. */
const urls = () => vi.mocked(apiGet).mock.calls.map((c) => c[0]);

describe('useLedger / useLedgerStats — includeEmpty wiring (CH-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiGet).mockResolvedValue([] as never);
  });

  // The guard CH-009 spec §2.4 asks for: the default caller (request detail,
  // the allocation template) must NOT ask for empty rows. If someone "helpfully"
  // adds the param to the default path, CH-008's whole default is undone and
  // this fails.
  it('defaults to the bare URL — no includeEmpty param', async () => {
    const { result } = renderHook(() => useLedger(), {
      wrapper: wrapperFor(freshClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls()).toEqual(['/license/ledger']);
  });

  it('asks for empty rows only when explicitly told to', async () => {
    const { result } = renderHook(() => useLedger(true), {
      wrapper: wrapperFor(freshClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls()).toEqual(['/license/ledger?includeEmpty=true']);
  });

  it('stats follows the same two states', async () => {
    const client = freshClient();
    const a = renderHook(() => useLedgerStats(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const b = renderHook(() => useLedgerStats(true), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));

    expect(urls()).toEqual([
      '/license/ledger/stats',
      '/license/ledger/stats?includeEmpty=true',
    ]);
  });

  // Same client, both variants: two separate fetches. Were includeEmpty left out
  // of the key, the second hook would be served the filtered list from cache and
  // the toggle would silently do nothing on first flip.
  it('the two variants do not share a cache entry', async () => {
    const client = freshClient();
    const off = renderHook(() => useLedger(false), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(off.result.current.isSuccess).toBe(true));
    const on = renderHook(() => useLedger(true), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));

    expect(urls()).toEqual([
      '/license/ledger',
      '/license/ledger?includeEmpty=true',
    ]);
  });

  // Every ledger mutation invalidates the ['license','ledger'] prefix. Appending
  // to the key keeps it a prefix match — this proves it, so an inline edit still
  // refreshes the table while the toggle is on (A6).
  it('still answers to the ["license","ledger"] invalidation prefix', async () => {
    const client = freshClient();
    const { result } = renderHook(() => useLedger(true), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls()).toHaveLength(1);

    await client.invalidateQueries({ queryKey: ['license', 'ledger'] });
    await waitFor(() => expect(urls()).toHaveLength(2));
    expect(urls()[1]).toBe('/license/ledger?includeEmpty=true');
  });
});
