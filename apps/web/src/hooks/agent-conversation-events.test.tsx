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

  // ── the outage that fires no events at all ──────────────────────

  /**
   * 🔴🔴 The case that actually happens, and the reason a clock exists here.
   *
   * Instrumenting the dock's real `EventSource` and killing the api produced
   * `open` and then NOTHING for 18 seconds — no error, no reconnect, readyState
   * still OPEN. A proxy can hold the socket after the upstream is gone. Neither
   * branch above can fire, so silence has to be treated as a symptom.
   */
  it('reports disconnected when a connection goes silent', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(
        () => useAgentConversationEvents('conv-1'),
        {
          wrapper,
        },
      );
      act(() => latest().succeed());
      expect(result.current.disconnected).toBe(false);

      /**
       * ⚠️ 90s, not 61s. The check runs on a 10s interval, so with 61s the last
       * tick lands at exactly 60_000 and `> 60_000` is false — the first draft
       * of this test failed on that off-by-one-tick, which is a property of the
       * schedule rather than of the threshold.
       */
      act(() => vi.advanceTimersByTime(90_000));

      expect(result.current.disconnected).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * ⚠️ And the other half, which is what stops it being a nuisance: a heartbeat
   * IS proof of life. The server sends one every 25s by default, so an idle but
   * healthy thread must never trip this.
   */
  it('treats a heartbeat as proof the connection is alive', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(
        () => useAgentConversationEvents('conv-1'),
        {
          wrapper,
        },
      );
      act(() => latest().succeed());

      // Three heartbeats over 75s — well past the 60s threshold.
      for (let i = 0; i < 3; i += 1) {
        act(() => vi.advanceTimersByTime(25_000));
        act(() => latest().onmessage?.());
      }

      expect(result.current.disconnected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * ⚠️ NOT closed when stale — it may still be a live socket with nothing
   * behind it, and the api coming back clears the banner by itself.
   */
  it('leaves a stale connection open so it can recover on its own', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(
        () => useAgentConversationEvents('conv-1'),
        {
          wrapper,
        },
      );
      act(() => latest().succeed());
      /**
       * ⚠️ 90s, not 61s. The check runs on a 10s interval, so with 61s the last
       * tick lands at exactly 60_000 and `> 60_000` is false — the first draft
       * of this test failed on that off-by-one-tick, which is a property of the
       * schedule rather than of the threshold.
       */
      act(() => vi.advanceTimersByTime(90_000));
      expect(result.current.disconnected).toBe(true);
      expect(latest().close).not.toHaveBeenCalled();

      act(() => latest().onmessage?.());

      expect(result.current.disconnected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
