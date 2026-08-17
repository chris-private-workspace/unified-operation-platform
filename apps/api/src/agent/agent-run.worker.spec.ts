import type { ConfigService } from '@nestjs/config';
import { AGENT_RUN_QUEUE } from './agent-run.queue';
import { AgentRunWorker } from './agent-run.worker';
import type { AiAssistService } from './ai-assist.service';

/**
 * W46 期二 G5-B / ADR-0039 F3 — the in-process worker.
 *
 * 🔴 There is very little here on purpose. The worker knows one verb, and the
 * things it CAN get wrong are all structural: which queue it drains, what it
 * calls, how many at once, and whether a Redis error takes the process down
 * with it. Everything about what a run does is `ai-assist.service.spec.ts`.
 */

jest.mock('bullmq', () => {
  const state = {
    args: [] as unknown[],
    on: jest.fn(),
    close: jest.fn(),
  };
  return {
    __state: state,
    Worker: jest.fn().mockImplementation((...args: unknown[]) => {
      state.args = args;
      return { on: state.on, close: state.close };
    }),
  };
});

interface MockState {
  args: unknown[];
  on: jest.Mock;
  close: jest.Mock;
}
const state = (jest.requireMock('bullmq') as { __state: MockState }).__state;

type Processor = (job: { data: { runId: string } }) => Promise<void>;

const configOf = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('AgentRunWorker (G5-B)', () => {
  beforeEach(() => jest.clearAllMocks());

  const build = (values: Record<string, string> = {}) => {
    const aiAssist = { executeRun: jest.fn().mockResolvedValue(undefined) };
    const worker = new AgentRunWorker(
      aiAssist as unknown as AiAssistService,
      configOf(values),
    );
    worker.onModuleInit();
    return { worker, aiAssist };
  };

  it('drains the queue the API enqueues to', () => {
    build();

    // A worker on a different queue name is silence: jobs pile up and nothing
    // errors. The constant is shared with `agent-run.queue.ts` so this cannot
    // drift, and this asserts the constant actually reached the constructor.
    expect(state.args[0]).toBe(AGENT_RUN_QUEUE);
  });

  it('executes the run named in the job, and nothing else', async () => {
    const { aiAssist } = build();

    const processor = state.args[1] as Processor;
    await processor({ data: { runId: 'run-1' } });

    expect(aiAssist.executeRun).toHaveBeenCalledWith('run-1');
  });

  /**
   * 🔴 Two, not one, and the reason is R24's other side.
   *
   * Concurrency 1 serialises every run in the deployment behind whichever one
   * is waiting on a model — and that wait is minutes. A big number would be
   * pretending the event loop is free. Two is a floor; the knob exists so a
   * real deployment can replace this guess with a measurement.
   */
  it('runs two at a time by default', () => {
    build();

    expect(state.args[2]).toMatchObject({ concurrency: 2 });
  });

  it('takes the concurrency from the environment when set', () => {
    build({ AGENT_RUN_CONCURRENCY: '5' });

    expect(state.args[2]).toMatchObject({ concurrency: 5 });
  });

  it('falls back rather than becoming NaN on a junk value', () => {
    build({ AGENT_RUN_CONCURRENCY: 'lots' });

    expect(state.args[2]).toMatchObject({ concurrency: 2 });
  });

  /**
   * 🔴🔴 The one that is not cosmetic.
   *
   * ioredis emits `error` on every failed reconnect, and an EventEmitter with
   * no `error` listener THROWS. An unhandled throw here is an unhandled
   * rejection, which kills the Nest process — so a Redis outage would not
   * degrade the agent, it would take down the API serving every other screen.
   */
  it('listens for connection errors, so a Redis outage cannot kill the process', () => {
    build();

    const events = state.on.mock.calls.map((call) => call[0]);
    expect(events).toContain('error');
  });

  it('closes the worker on shutdown', async () => {
    const { worker } = build();

    await worker.onModuleDestroy();

    expect(state.close).toHaveBeenCalled();
  });
});
