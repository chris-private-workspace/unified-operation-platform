import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgentRunEvents } from './agent-run-events';
import type { AgentRunStatus } from '@/lib/api-types';

/**
 * W46 期二 G6 / ADR-0039 — the browser half of the change channel.
 *
 * 🔴 What is worth asserting here is all about what does NOT happen: no
 * connection for a run that has ended, no infinite reconnect against a run that
 * is gone, no socket left open when the card unmounts. The happy path is one
 * line (`invalidateQueries`), and it is the failure modes that would ship
 * silently — a leaked EventSource costs nothing visible until a person has left
 * the tab open all afternoon.
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(
    readonly url: string,
    readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

const latest = () =>
  FakeEventSource.instances[FakeEventSource.instances.length - 1];

let client: QueryClient;
let invalidate: ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

const mount = (status: AgentRunStatus | null) =>
  renderHook(
    () =>
      useAgentRunEvents(
        'req-1',
        status === null ? null : { id: 'run-1', status },
      ),
    { wrapper },
  );

beforeEach(() => {
  FakeEventSource.instances = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Replaced rather than spied: `invalidateQueries` is generic, and a spy on it
  // does not narrow to a plain mock without fighting the types for nothing —
  // what the tests read is the arguments, which this keeps intact.
  invalidate = vi.fn().mockResolvedValue(undefined);
  client.invalidateQueries = invalidate as never;
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  client.clear();
});

describe('useAgentRunEvents (G6)', () => {
  describe('when it connects at all', () => {
    it.each<AgentRunStatus>(['running', 'awaiting_approval', 'approved'])(
      'opens a connection for a run that is still %s',
      (status) => {
        mount(status);

        expect(FakeEventSource.instances).toHaveLength(1);
      },
    );

    /**
     * 🔴 The one that matters for a page a person scrolls back through.
     *
     * Terminal runs are the majority of what this card ever shows. A connection
     * per historical run would be a socket per card, held for as long as the tab
     * is open, updating something that cannot change.
     */
    it.each<AgentRunStatus>(['completed', 'failed', 'aborted', 'expired'])(
      'opens nothing for a run that has ended (%s)',
      (status) => {
        mount(status);

        expect(FakeEventSource.instances).toHaveLength(0);
      },
    );

    it('opens nothing when there is no run yet', () => {
      mount(null);

      expect(FakeEventSource.instances).toHaveLength(0);
    });

    /**
     * ⚠️ Not written through `mount`, and the first version was: a default
     * parameter swallows an explicitly-passed `undefined`, so `mount('running',
     * undefined)` handed the hook 'req-1' and the test asserted a case it never
     * exercised. It went red, which is the only reason that is a footnote.
     */
    it('opens nothing without a request id', () => {
      renderHook(
        () => useAgentRunEvents(undefined, { id: 'run-1', status: 'running' }),
        { wrapper },
      );

      expect(FakeEventSource.instances).toHaveLength(0);
    });

    /**
     * jsdom has no EventSource, and neither does an SSR pass. Absence has to
     * mean "no live updates" rather than a card that throws — the run is still
     * readable, it just will not refresh itself.
     */
    it('degrades quietly where EventSource does not exist', () => {
      vi.stubGlobal('EventSource', undefined);

      expect(() => mount('running')).not.toThrow();
    });
  });

  describe('the connection it opens', () => {
    it('points at the run’s own event route, under the shared API base', () => {
      mount('running');

      // The base comes from `@/lib/api` rather than being spelled again here —
      // two places computing it is how a dev proxy and a production reverse
      // proxy end up disagreeing about where the API is.
      expect(latest().url).toBe('/api/agent/runs/run-1/events');
    });

    it('sends credentials, because the session cookie is the only one there is', () => {
      mount('running');

      // ADR-0028: no Authorization header exists to fall back on.
      expect(latest().init).toEqual({ withCredentials: true });
    });
  });

  describe('what a message does', () => {
    /**
     * 🔴 The payload is not read, and that is ADR-0039 F10 arriving on this
     * side: the card renders what `useAgentRun` refetched, so an SSE update and
     * a page reload cannot show different things.
     */
    it('invalidates the run query, ignoring whatever arrived', () => {
      mount('running');

      latest().onmessage?.({ data: 'anything at all' } as MessageEvent);

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['agent', 'runs', 'req-1'],
      });
    });

    it('invalidates nothing until a message arrives', () => {
      mount('running');

      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe('failure and teardown', () => {
    /**
     * 🔴🔴 `EventSource` retries forever on its own and never exposes the
     * status code — so a 404 (the run is gone) or a 403 (wrong OpCo) looks
     * exactly like a blip and would be retried until the tab is closed. This is
     * the bound that turns a permanent error into a stopped connection instead
     * of a permanent request loop.
     */
    it('gives up after three consecutive failures', () => {
      mount('running');
      const source = latest();

      source.onerror?.();
      source.onerror?.();
      expect(source.closed).toBe(false);

      source.onerror?.();
      expect(source.closed).toBe(true);
    });

    /**
     * The other half, and without it the bound above would be a bound on
     * LIFETIME failures rather than consecutive ones — an all-day connection
     * would eventually accumulate three unrelated blips and stop for good.
     */
    it('forgets earlier failures once it reconnects', () => {
      mount('running');
      const source = latest();

      source.onerror?.();
      source.onerror?.();
      source.onopen?.();
      source.onerror?.();
      source.onerror?.();

      expect(source.closed).toBe(false);
    });

    it('closes the connection when the card goes away', () => {
      const { unmount } = mount('running');
      const source = latest();

      unmount();

      expect(source.closed).toBe(true);
    });

    /**
     * A run moving from `running` to `completed` is the normal end of a run's
     * life, and it has to take the socket with it — otherwise every finished
     * run leaves one behind for the rest of the session.
     */
    it('closes the connection when the run reaches a terminal status', () => {
      const { rerender } = renderHook(
        ({ status }: { status: AgentRunStatus }) =>
          useAgentRunEvents('req-1', { id: 'run-1', status }),
        { wrapper, initialProps: { status: 'running' as AgentRunStatus } },
      );
      const source = latest();

      rerender({ status: 'completed' });

      expect(source.closed).toBe(true);
      expect(FakeEventSource.instances).toHaveLength(1);
    });
  });
});
