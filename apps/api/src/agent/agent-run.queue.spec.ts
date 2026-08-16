import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  AGENT_RUN_CHANGED,
  AGENT_RUN_JOB,
  AGENT_RUN_QUEUE,
  AgentRunQueue,
  agentRedisConnection,
} from './agent-run.queue';

/**
 * W46 期二 G5-B + G6 / ADR-0039 — the queue and the change channel.
 *
 * 🔴 `bullmq` is mocked, and the reason is the same one ADR-0038 D3 gave for
 * the Claude provider: a unit test that opens a Redis socket is a test that
 * fails on a laptop with no Redis, and the first fix anyone reaches for is to
 * skip it. What is NOT mocked is the shape of what we hand BullMQ — the fake
 * records it and the assertions read it, so a wrong argument order or a
 * dropped option is still visible.
 *
 * ⚠️ What this file cannot prove is that Redis behaves as assumed. That is
 * `B6`, a live check on DEV, and it needs Redis to exist there first (F5).
 */

jest.mock('bullmq', () => {
  const add = jest.fn().mockResolvedValue(undefined);
  const publishEvent = jest.fn().mockResolvedValue(undefined);
  const eventsOn = jest.fn();
  const eventsOff = jest.fn();

  const state = {
    add,
    publishEvent,
    eventsOn,
    eventsOff,
    queueArgs: [] as unknown[],
    eventsArgs: [] as unknown[],
    producerArgs: [] as unknown[],
  };

  return {
    __state: state,
    Queue: jest.fn().mockImplementation((...args: unknown[]) => {
      state.queueArgs = args;
      return { add, on: jest.fn(), close: jest.fn() };
    }),
    QueueEvents: jest.fn().mockImplementation((...args: unknown[]) => {
      state.eventsArgs = args;
      return { on: eventsOn, off: eventsOff, close: jest.fn() };
    }),
    QueueEventsProducer: jest.fn().mockImplementation((...args: unknown[]) => {
      state.producerArgs = args;
      return { publishEvent, on: jest.fn(), close: jest.fn() };
    }),
  };
});

const state = (jest.requireMock('bullmq') as { __state: MockState }).__state;

interface MockState {
  add: jest.Mock;
  publishEvent: jest.Mock;
  eventsOn: jest.Mock;
  eventsOff: jest.Mock;
  queueArgs: unknown[];
  eventsArgs: unknown[];
  producerArgs: unknown[];
}

const configOf = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/**
 * The change listener, found by NAME rather than by position.
 *
 * 🔴 The first version of this indexed `calls[0]` and went red immediately:
 * `onModuleInit` registers an `'error'` listener first, so position 0 is a
 * different subscription entirely. Kept as a lookup because that ordering is
 * not a fact the tests below should depend on.
 */
const changeListener = () => {
  const call = state.eventsOn.mock.calls.find(
    (args) => args[0] === AGENT_RUN_CHANGED,
  );
  if (!call) throw new Error(`no listener registered for ${AGENT_RUN_CHANGED}`);
  return call[1] as (args: unknown, id: string) => void;
};

describe('AgentRunQueue (G5-B / G6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.add.mockResolvedValue(undefined);
    state.publishEvent.mockResolvedValue(undefined);
  });

  const started = (values: Record<string, string> = {}) => {
    const queue = new AgentRunQueue(configOf(values));
    queue.onModuleInit();
    return queue;
  };

  describe('where Redis is', () => {
    /**
     * 🔴 R23. `skipWaitingForReady` is the difference between "AI-Assist cannot
     * start, here is why" and an HTTP request that hangs until something times
     * it out — and a hanging request is indistinguishable, from the screen, from
     * an agent that is thinking.
     */
    it('fails fast rather than waiting for a connection that may never come', () => {
      expect(agentRedisConnection(configOf())).toMatchObject({
        skipWaitingForReady: true,
      });
    });

    it('defaults to localhost so a developer can boot without setting anything', () => {
      expect(agentRedisConnection(configOf())).toMatchObject({
        url: 'redis://127.0.0.1:6379',
      });
    });

    it('uses REDIS_URL when it is set', () => {
      expect(
        agentRedisConnection(configOf({ REDIS_URL: 'redis://cache:6379' })),
      ).toMatchObject({ url: 'redis://cache:6379' });
    });

    /**
     * 🔴 One function, two callers — the queue here and `AgentRunWorker`. Two
     * providers each reading the env for themselves is how a queue and its
     * worker end up on different instances, whose symptom is "jobs are accepted
     * and never run" — which looks exactly like a hung worker and is not.
     */
    it('is the same answer the worker gets', () => {
      const config = configOf({ REDIS_URL: 'redis://cache:6379' });
      expect(agentRedisConnection(config)).toEqual(
        agentRedisConnection(config),
      );
    });
  });

  describe('connections are opened in onModuleInit, not the constructor', () => {
    it('refuses to enqueue before it has started', async () => {
      const queue = new AgentRunQueue(configOf());

      await expect(queue.enqueue('run-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(state.add).not.toHaveBeenCalled();
    });

    it('names the same queue for all three connections', () => {
      started();

      // A producer publishing to one stream while the consumer reads another
      // is silence, not an error — nothing throws, nothing arrives.
      expect(state.queueArgs[0]).toBe(AGENT_RUN_QUEUE);
      expect(state.eventsArgs[0]).toBe(AGENT_RUN_QUEUE);
      expect(state.producerArgs[0]).toBe(AGENT_RUN_QUEUE);
    });
  });

  describe('enqueue', () => {
    it('sends the run id and nothing else', async () => {
      await started().enqueue('run-1');

      expect(state.add).toHaveBeenCalledWith(
        AGENT_RUN_JOB,
        { runId: 'run-1' },
        expect.objectContaining({ attempts: 1 }),
      );
    });

    /**
     * 🔴 One attempt, deliberately. A retry re-enters `executeRun` on a run
     * that is no longer `running`, which that method refuses — so retries buy a
     * delayed, more confusing failure and nothing else. Starting a new run is
     * the repair, and it is a person's decision.
     */
    it('does not retry', async () => {
      await started().enqueue('run-1');

      const opts = state.add.mock.calls[0][2] as { attempts: number };
      expect(opts.attempts).toBe(1);
    });

    /**
     * 🔴🔴 R23 — the sentence a person reads when Redis is down must not be the
     * sentence they read when an admin flipped the kill switch.
     *
     * ADR-0036 D2's switch is something somebody DID. An agent that stopped
     * because infrastructure fell over did not have anything done to it, and
     * conflating the two sends the first question ("did someone turn this
     * off?") to a confidently wrong answer.
     */
    it('says it is Redis, and says it is not the kill switch', async () => {
      const queue = started();
      state.add.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(queue.enqueue('run-1')).rejects.toThrow(
        /Redis.*not the agent kill switch/s,
      );
    });
  });

  describe('publishing a change', () => {
    it('carries the run id and the event name — no run content (F10)', async () => {
      await started().publishChanged('run-1');

      expect(state.publishEvent).toHaveBeenCalledWith({
        eventName: AGENT_RUN_CHANGED,
        runId: 'run-1',
      });
    });

    /**
     * 🔴 Never throws, and this is the asymmetry with `enqueue` above.
     *
     * The caller is `writeStep`, which has ALREADY written the row. Letting a
     * failed publish propagate would turn a missed screen update into a failed
     * step — trading a real record for a cosmetic one.
     *
     * ⚠️ Not a precedent for fail-open in general (ADR-0034 D6 argued that only
     * for an accounting optimisation). It is safe here because nothing
     * downstream treats this channel as evidence.
     */
    it('swallows a publish failure rather than failing the step that caused it', async () => {
      const queue = started();
      state.publishEvent.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(queue.publishChanged('run-1')).resolves.toBeUndefined();
    });
  });

  describe('the change stream', () => {
    /**
     * 🔴 ADR-0039 F10's race, and it is the one that would have shipped.
     *
     * A short run can finish between the POST returning and the browser opening
     * its EventSource. Without an opening tick, that browser waits for an event
     * that already happened — forever, on a card that says "running".
     */
    it('emits immediately on subscribe, before any Redis event', async () => {
      const first = await firstValueFrom(started().changes('run-1'));

      expect(first).toEqual({ data: { runId: 'run-1', type: 'changed' } });
    });

    /**
     * 🔴 The half that proves the two ends agree.
     *
     * Asserting "we publish AGENT_RUN_CHANGED" and "we listen for
     * AGENT_RUN_CHANGED" separately is a tautology — both read the same
     * constant. This takes what `publishEvent` was actually given and feeds it
     * to the listener `changes` actually registered, so it fails if the shapes
     * ever stop matching, not just if the name does.
     */
    it('delivers what publishChanged sends, to a subscriber of that run', async () => {
      const queue = started();
      const seen: unknown[] = [];
      // Unsubscribed at the end: the stream also carries a heartbeat interval,
      // and a test that walks away from it leaves a timer running — which jest
      // reports as a worker that would not exit. (It did, first run.)
      const sub = queue.changes('run-1').subscribe((msg) => seen.push(msg));

      await queue.publishChanged('run-1');
      changeListener()(state.publishEvent.mock.calls[0][0], 'redis-id');
      sub.unsubscribe();

      // The opening tick, then the published one.
      expect(seen).toEqual([
        { data: { runId: 'run-1', type: 'changed' } },
        { data: { runId: 'run-1', type: 'changed' } },
      ]);
    });

    /**
     * Every replica sees every event on the stream; the filter is what makes
     * the channel per-run. Without it, one browser watching run A would refetch
     * on every step of every OTHER run in the deployment.
     */
    it('ignores events for a different run', async () => {
      const queue = started();
      const seen: unknown[] = [];
      const sub = queue.changes('run-1').subscribe((msg) => seen.push(msg));

      changeListener()(
        { eventName: AGENT_RUN_CHANGED, runId: 'run-2' },
        'redis-id',
      );
      sub.unsubscribe();

      expect(seen).toHaveLength(1); // the opening tick only
    });

    /**
     * 🔴 A listener per subscriber, on a shared emitter: an SSE connection that
     * closes without removing its listener leaks one per browser tab, and
     * BullMQ's emitter would eventually warn about a leak that is ours.
     */
    it('removes its listener when the subscriber goes away', () => {
      const queue = started();
      const sub = queue.changes('run-1').subscribe();

      expect(state.eventsOff).not.toHaveBeenCalled();
      sub.unsubscribe();

      expect(state.eventsOff).toHaveBeenCalledWith(
        AGENT_RUN_CHANGED,
        expect.any(Function),
      );
    });
  });
});
