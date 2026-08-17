import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Queue,
  QueueEvents,
  QueueEventsProducer,
  type ConnectionOptions,
  type QueueEventsListener,
} from 'bullmq';
import { Observable, merge, interval, map } from 'rxjs';

/**
 * W46 期二 G5-B + G6 / ADR-0039 — the queue and the change channel, in one
 * provider because they are one Redis dependency, not two.
 *
 * 🔴 This file knows NOTHING about agent runs beyond an id. It cannot start
 * one, read one or finish one — `AgentRunWorker` does the executing and
 * `AiAssistService` does the writing. Kept that way on purpose: a transport
 * that can also decide is a second place decisions live, and ADR-0036 D0's
 * whole shape is that there is exactly one.
 *
 * 🔴 **ADR-0039 F9 — the pub/sub half rides BullMQ's own `QueueEvents`.**
 * The draft claimed this meant "zero new dependency"; that was checked and it
 * was WRONG — `bullmq@6` moved `ioredis` from a dependency to a peer, so it had
 * to be installed explicitly (see the ADR's own correction). What survived the
 * correction, and is why this is still the right call:
 *
 *   1. `QueueEventsProducer` publishes WITHOUT a job in hand. That is what lets
 *      `AiAssistService.writeStep` — the single writer the boundary spec already
 *      enforces — be the single publish point too, instead of threading a BullMQ
 *      `Job` handle through every method that might write a step.
 *   2. Redis STREAMS, not pub/sub. Pub/sub is fire-and-forget: a subscriber that
 *      attaches a moment late never learns what it missed. A run's steps arrive
 *      over seconds, so "a moment late" is the normal case.
 *   3. Reconnection, subscribe-mode isolation and consumer-loop lifetime are
 *      BullMQ's problem rather than ours. It is not FEWER connections — it is
 *      not our code managing them.
 */

/** Queue name. One queue: there is one kind of background work here. */
export const AGENT_RUN_QUEUE = 'agent-run';

/** Job name inside that queue. */
export const AGENT_RUN_JOB = 'execute';

/**
 * The custom event name. ADR-0039 F10: the payload is `{ runId }` and NOTHING
 * else — not the step, not the status, not the detail.
 *
 * 🔴 Three reasons, and the middle one is the one that would hurt:
 *
 *   1. It refuses to become a second source of truth. A step streamed over here
 *      and the same step refetched from `GET /agent/runs/:id` would eventually
 *      disagree, and the screen would hold both. CH-028 declined to compute a
 *      delta in the Platform view for exactly this reason.
 *   2. 🔴 H4. `AgentStep.detail` can carry a vendor error, and vendor errors
 *      quote request paths containing a UPN (BUG-004). Today that text passes
 *      `scrubPii` on its way INTO the table. Putting it on a new transport as
 *      well would create a second route that has to remember to scrub. A route
 *      that carries no content has nothing to remember.
 *   3. Falling back to polling (F7, if ACA buffers SSE) needs no contract change
 *      — a notify-then-refetch channel and a poll read the same endpoint.
 */
export const AGENT_RUN_CHANGED = 'agent-run-changed';

/** What `publishEvent` sends and `QueueEvents` hands back. */
interface AgentRunChangedEvent {
  eventName: typeof AGENT_RUN_CHANGED;
  runId: string;
}

/**
 * BullMQ types `QueueEvents.on` against its own listener union, so a custom
 * event name is a type error unless the union is extended. This is the
 * documented way to do that, and it is also what keeps the payload typed at
 * both ends instead of being `any` on the way out of Redis.
 */
interface AgentRunEventsListener extends QueueEventsListener {
  'agent-run-changed': (args: AgentRunChangedEvent, id: string) => void;
}

/** What an SSE subscriber receives. `data` is what lands in the browser. */
export interface AgentRunChangeMessage {
  data: { runId: string; type: 'changed' | 'ping' };
}

/** What the worker's job payload carries. One id — see F10. */
export interface AgentRunJobData {
  runId: string;
}

/**
 * Where Redis is, read in ONE place.
 *
 * 🔴 Exported because `AgentRunWorker` needs the same answer, and two providers
 * each reading `REDIS_URL` for themselves is how a queue and its worker end up
 * pointed at different instances — an outage whose symptom is "jobs are
 * accepted and never run", which looks exactly like a hung worker.
 */
export function agentRedisConnection(config: ConfigService): ConnectionOptions {
  // `get` with a default rather than getOrThrow: a developer who has never
  // heard of this feature should still be able to boot the API. What they must
  // NOT get is a silent degradation — see `enqueue`.
  return {
    url: config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379',
    /**
     * 🔴 R23 — fail fast instead of queueing forever.
     *
     * Without this, `add()` on a dead Redis waits for a connection that is
     * never coming, and the caller's HTTP request hangs. A run that cannot be
     * queued has to say so in the same second, because the alternative is a
     * screen that looks like it is working.
     */
    skipWaitingForReady: true,
  };
}

@Injectable()
export class AgentRunQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunQueue.name);
  private readonly connection: ConnectionOptions;
  private readonly heartbeatMs: number;

  private queue?: Queue;
  private events?: QueueEvents;
  private producer?: QueueEventsProducer;

  constructor(config: ConfigService) {
    this.connection = agentRedisConnection(config);
    this.heartbeatMs = toPositiveInt(
      config.get<string>('AGENT_SSE_HEARTBEAT_MS'),
      25_000,
    );
  }

  /**
   * Connections are opened here rather than in the constructor.
   *
   * 🔴 Not style: a constructor that dials Redis makes every test that
   * instantiates this class open a socket, and the first thing such a test
   * teaches you is to mock the whole module — after which nothing is checked at
   * all. `claude-tool-runner.provider.ts` refuses to build its client for the
   * same reason (ADR-0038 D3).
   */
  onModuleInit(): void {
    this.queue = new Queue(AGENT_RUN_QUEUE, { connection: this.connection });
    this.events = new QueueEvents(AGENT_RUN_QUEUE, {
      connection: this.connection,
    });
    this.producer = new QueueEventsProducer(AGENT_RUN_QUEUE, {
      connection: this.connection,
    });

    /**
     * 🔴 An `error` listener on each, and it is not optional politeness.
     *
     * ioredis emits `error` on every failed reconnect. An EventEmitter with no
     * `error` listener THROWS, and an unhandled throw here is an unhandled
     * rejection, which takes the Nest process with it (BUG-002's lesson, from
     * the other end). So a Redis outage would not degrade the agent — it would
     * kill the API that serves the other nine screens.
     */
    // Written out three times rather than looped: the three classes type `on`
    // with different listener unions, so a loop over them is not callable
    // without a cast — and a cast here would be casting away the one thing
    // that makes this correct.
    this.queue.on('error', (err) => this.logConnectionError('queue', err));
    this.events.on('error', (err) => this.logConnectionError('events', err));
    this.producer.on('error', (err) =>
      this.logConnectionError('producer', err),
    );
  }

  /** H4: message only. A Redis URL can carry a password. */
  private logConnectionError(what: string, err: Error): void {
    this.logger.error(`Agent run ${what} connection error: ${err.message}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.queue?.close(),
      this.events?.close(),
      this.producer?.close(),
    ]);
  }

  /**
   * Hand a run to the background worker.
   *
   * 🔴 R23 — the error message says REDIS, deliberately.
   *
   * ADR-0036 D2's kill switch is a thing a person flips on purpose, and the
   * screen says so. An agent that has quietly stopped because infrastructure is
   * down must not produce the same sentence, or the first question ("did
   * somebody turn this off?") gets a confidently wrong answer.
   */
  async enqueue(runId: string): Promise<void> {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'The agent run queue is not started',
      );
    }
    try {
      await this.queue.add(
        AGENT_RUN_JOB,
        { runId },
        {
          /**
           * One attempt. A retry would re-enter `executeRun` on a run that is
           * no longer `running` — the guard there refuses it — so retries would
           * buy nothing but a delayed, confusing failure. A run that failed is
           * repaired by starting a NEW one, which is a person's decision
           * (the same answer `expireRun` gives).
           */
          attempts: 1,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Could not queue agent run ${runId}: ${message}`);
      throw new ServiceUnavailableException(
        'AI-Assist cannot start right now: the background queue (Redis) is unreachable. This is an infrastructure problem, not the agent kill switch.',
      );
    }
  }

  /**
   * Tell every replica that this run changed.
   *
   * 🔴 Never throws, and that is a deliberate asymmetry with `enqueue` above.
   * This is a NOTIFICATION channel, not a gate: the truth is the database row,
   * which the browser can refetch. Letting a failed publish undo a step that
   * really was written would trade a real record for a missed screen update.
   *
   * ⚠️ Not to be read as a precedent for fail-open in general — ADR-0034 D6
   * argued a gate could fail open only because it was an accounting
   * optimisation. The distinction that makes it safe HERE is that nothing
   * downstream treats this channel as evidence of anything.
   */
  async publishChanged(runId: string): Promise<void> {
    if (!this.producer) return;
    try {
      const event: AgentRunChangedEvent = {
        eventName: AGENT_RUN_CHANGED,
        runId,
      };
      await this.producer.publishEvent(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Agent run ${runId} changed, but the change could not be published: ${message}`,
      );
    }
  }

  /**
   * A stream of "this run changed" for one run.
   *
   * 🔴 The FIRST thing a subscriber gets is a tick, before any Redis event.
   * ADR-0039 F10 names the race it closes: a short run can finish between the
   * POST returning and the browser opening its EventSource, and without the
   * opening tick that browser waits forever for an event that already happened.
   */
  changes(runId: string): Observable<AgentRunChangeMessage> {
    const changed$ = new Observable<AgentRunChangeMessage>((subscriber) => {
      const events = this.events;
      const listener = (args: AgentRunChangedEvent) => {
        // Queue-wide stream, one run's subscriber: the filter is what makes it
        // per-run. Every replica sees every event; only the ones with a browser
        // attached to THIS run pass it on.
        if (args.runId === runId) {
          subscriber.next({ data: { runId, type: 'changed' } });
        }
      };

      subscriber.next({ data: { runId, type: 'changed' } });
      events?.on<AgentRunEventsListener>(AGENT_RUN_CHANGED, listener);

      return () => {
        events?.off<AgentRunEventsListener>(AGENT_RUN_CHANGED, listener);
      };
    });

    /**
     * ⚠️ R22's mitigation, and it is a mitigation not a fix.
     *
     * An idle SSE connection is what a buffering proxy holds onto; periodic
     * bytes keep it flowing and keep an idle timeout from closing it. Whether
     * ACA's ingress buffers at all is the thing only DEV can answer (F7), so
     * this makes the good case survive rather than proving the bad case cannot
     * happen.
     */
    const heartbeat$ = interval(this.heartbeatMs).pipe(
      map((): AgentRunChangeMessage => ({ data: { runId, type: 'ping' } })),
    );

    return merge(changed$, heartbeat$);
  }
}

/** Env values arrive as strings; a junk value must fall back, not become NaN. */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
