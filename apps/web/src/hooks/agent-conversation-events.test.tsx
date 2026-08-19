import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentConversationEvents } from './agent-conversation-events';

/**
 * W49 `F4-3`. This hook shipped in W48 with no test at all, which was defensible
 * while it returned void — there was nothing to assert. Giving it a return value
 * made its failure MODES assertable, and the first thing that produced was a
 * defect that had been there all along.
 *
 * 🔴 The defect, found live (kill the api, watch a real `EventSource`): an HTTP
 * error response closes the connection permanently and fires `onerror` exactly
 * ONCE — `readyState` 2 at that moment, still 2 twelve seconds later. Counting
 * three consecutive failures never happens on that path, so the banner would
 * never have appeared in the most common case: a deploy.
 *
 * ⚠️ Note what the dock's own test could not see. It asserts "when
 * `disconnected` is true, a banner shows" — true, and useless if `disconnected`
 * never becomes true. WHEN it flips is a different question, and it lives here.
 */

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readyState = CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = CLOSED;
  });

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  /** What a dead api / a 403 does: closed for good, one error, no retry. */
  failPermanently() {
    this.readyState = CLOSED;
    this.onerror?.();
  }

  /** What a blip does: the browser will try again. */
  failButKeepTrying() {
    this.readyState = CONNECTING;
    this.onerror?.();
  }

  succeed() {
    this.readyState = OPEN;
    this.onopen?.();
  }
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const latest = () =>
  FakeEventSource.instances[FakeEventSource.instances.length - 1];

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAgentConversationEvents (W49 F4-3)', () => {
  it('subscribes to the conversation it was given', () => {
    renderHook(() => useAgentConversationEvents('conv-1'), { wrapper });

    expect(latest().url).toContain('/agent/conversations/conv-1/events');
  });

  it('subscribes to nothing without an id', () => {
    renderHook(() => useAgentConversationEvents(undefined), { wrapper });

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('starts connected', () => {
    const { result } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });

    expect(result.current.disconnected).toBe(false);
  });

  /**
   * 🔴 The one this file exists for. ONE error is enough when the browser has
   * already closed the connection — waiting for three would wait forever.
   */
  it('reports disconnected after a single permanent failure', () => {
    const { result } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });

    act(() => latest().failPermanently());

    expect(result.current.disconnected).toBe(true);
  });

  /**
   * 🔴 And the opposite case, which is why the count still exists: an
   * `EventSource` that is retrying must not put a banner on screen, or the
   * banner appears during every ordinary blip and stops meaning anything.
   */
  it('stays quiet while the browser is still retrying', () => {
    const { result } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });

    act(() => latest().failButKeepTrying());
    expect(result.current.disconnected).toBe(false);

    act(() => latest().failButKeepTrying());
    expect(result.current.disconnected).toBe(false);
  });

  it('gives up once the retries themselves stop being worth it', () => {
    const { result } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });

    act(() => {
      latest().failButKeepTrying();
      latest().failButKeepTrying();
      latest().failButKeepTrying();
    });

    expect(result.current.disconnected).toBe(true);
    expect(latest().close).toHaveBeenCalled();
  });

  it('clears the warning when a connection comes back on its own', () => {
    const { result } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });

    act(() => latest().failPermanently());
    expect(result.current.disconnected).toBe(true);

    act(() => latest().succeed());
    expect(result.current.disconnected).toBe(false);
  });

  /**
   * ⚠️ `reconnect()` has to open a NEW connection. A closed `EventSource` cannot
   * be revived, so merely clearing the flag would leave a panel claiming to be
   * live while nothing was listening — worse than the banner it replaced.
   */
  it('reconnect opens a fresh subscription and clears the warning', () => {
    const { result } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });

    act(() => latest().failPermanently());
    const before = FakeEventSource.instances.length;

    act(() => result.current.reconnect());

    expect(result.current.disconnected).toBe(false);
    expect(FakeEventSource.instances.length).toBe(before + 1);
  });

  it('closes the connection when the thread goes away', () => {
    const { unmount } = renderHook(() => useAgentConversationEvents('conv-1'), {
      wrapper,
    });
    const source = latest();

    unmount();

    expect(source.close).toHaveBeenCalled();
  });
});
