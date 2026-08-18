import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { scrubPii } from '../integration/scrub-pii';
import {
  AGENT_RUN_QUEUE,
  agentRedisConnection,
  type AgentRunJobData,
} from './agent-run.queue';
import { AiAssistService } from './ai-assist.service';
import { AgentConversationService } from './agent-conversation.service';

/**
 * W46 期二 G5-B / ADR-0039 F1 + F3 — the thing that actually runs the agent.
 *
 * 🔴 IN-PROCESS, not a third container (F3). §5.2's locked stack says
 * "Docker Compose (app + postgres + redis)" — there is no worker in it, so
 * adding one is a deployment change, and this phase already has one external
 * dependency waiting on infra (ADR-0037). The cost is stated rather than hidden:
 * a long run takes a share of the API's event loop (R24). Acceptable because an
 * LLM call is I/O-bound — the process is waiting on a socket, not computing.
 *
 * 🔴 It knows one verb. Everything about WHAT a run does lives in
 * `AiAssistService`; this file decides only that it happens off the request
 * thread. That separation is what lets the same `executeRun` be driven by a
 * test, and it is why the boundary spec's "AgentStep has one writer" still
 * holds with a queue in the picture — the worker writes nothing.
 */
@Injectable()
export class AgentRunWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunWorker.name);
  private readonly concurrency: number;
  private worker?: Worker<AgentRunJobData>;

  constructor(
    private readonly aiAssist: AiAssistService,
    /**
     * W48 F4 — where a chat's reply gets recorded, and the reason the worker is
     * the caller rather than `AiAssistService`.
     *
     * `AgentConversationService` already depends on `AiAssistService` (a chat
     * starts an ordinary run), so the reverse edge would be a cycle needing
     * `forwardRef` — which `agent.module.ts` avoided once already for the queue
     * and the worker, for the same reason. The worker sits above both and can
     * see the result, so it is the honest place for the handoff.
     *
     * 🔴 The worker still writes nothing itself; it calls the one service that
     * owns `AgentChatTurn`, which is what `agent.boundary.spec.ts` enforces.
     */
    private readonly conversations: AgentConversationService,
    private readonly config: ConfigService,
  ) {
    /**
     * Two at a time by default.
     *
     * One would serialise every run in the deployment behind whichever one is
     * waiting on the model — and the wait is minutes, not milliseconds. A large
     * number would be pretending the event loop is free (R24). Two is a floor
     * that stops one slow run from blocking the queue, and the knob exists so
     * the real number can come from a real deployment rather than from here.
     */
    this.concurrency = toPositiveInt(
      config.get<string>('AGENT_RUN_CONCURRENCY'),
      2,
    );
  }

  onModuleInit(): void {
    this.worker = new Worker<AgentRunJobData>(
      AGENT_RUN_QUEUE,
      async (job: Job<AgentRunJobData>) => {
        /**
         * 🔴 W48 F4-2 — the conversation is told either way.
         *
         * `recordAssistantTurn` is a no-op for a run with no conversation, so
         * the request-screen path is unchanged. What the `catch` buys is the
         * failure case: a thread told only about successes leaves the browser
         * showing "thinking…" forever, and a person who is waiting does not
         * retry. The run's own failure was already recorded by `failRun`; this
         * only makes sure somebody hears about it.
         *
         * ⚠️ The original error is rethrown unchanged. Swallowing it would take
         * the job out of BullMQ's `failed` handler and out of the log line the
         * operator reads.
         */
        try {
          const result = await this.aiAssist.executeRun(job.data.runId);
          await this.conversations.recordAssistantTurn(
            job.data.runId,
            result.finalOutput,
          );
        } catch (err) {
          await this.conversations.recordAssistantTurn(job.data.runId);
          throw err;
        }
      },
      {
        connection: agentRedisConnection(this.config),
        concurrency: this.concurrency,
      },
    );

    /**
     * 🔴 Same reason as the queue's listeners: an EventEmitter with no `error`
     * listener throws, and an unhandled throw in a worker is an unhandled
     * rejection that kills the Nest process. A Redis outage must degrade the
     * agent, not take down the API serving every other screen.
     */
    this.worker.on('error', (err: Error) => {
      this.logger.error(`Agent run worker error: ${scrubPii(err.message)}`);
    });

    /**
     * ⚠️ `failed` is logged, not repaired.
     *
     * By the time a job fails, `executeRun` has already marked the run `failed`
     * in the database through `failRun` — the row is the record, and this is
     * only the operator-facing line. Retrying here would re-enter a run that is
     * no longer `running`, which `executeRun` refuses on purpose
     * (`attempts: 1` in the queue options says the same thing from the other
     * end).
     */
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Agent run job ${job?.id ?? '?'} failed: ${scrubPii(err?.message)}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}

/** Env values arrive as strings; a junk value must fall back, not become NaN. */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
