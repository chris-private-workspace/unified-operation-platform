import { AgentRunExpiryService } from './run-expiry.service';
import type { AiAssistService } from './ai-assist.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

/**
 * W46 期二 G5 / plan OQ-5 — the clock half of run expiry.
 *
 * The properties worth pinning here are the ones a reader cannot see by looking
 * at the query: which statuses are in scope, that the threshold is what Chris
 * answered, that one bad row does not abandon the round, and that a scheduled
 * job cannot kill the process.
 */
const NOW = new Date('2026-08-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('AgentRunExpiryService', () => {
  let prisma: { agentRun: { findMany: jest.Mock } };
  let aiAssist: { expireRun: jest.Mock };
  let env: Record<string, string | undefined>;

  const build = () =>
    new AgentRunExpiryService(
      prisma as unknown as PrismaService,
      aiAssist as unknown as AiAssistService,
      { get: (k: string) => env[k] } as unknown as ConfigService,
    );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = { agentRun: { findMany: jest.fn().mockResolvedValue([]) } };
    aiAssist = { expireRun: jest.fn().mockResolvedValue(undefined) };
    env = {};
  });

  afterEach(() => jest.useRealTimers());

  const whereOf = () => prisma.agentRun.findMany.mock.calls[0][0].where;
  const argsOf = () => prisma.agentRun.findMany.mock.calls[0][0];

  it('expires a run parked past the threshold', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      { id: 'run_1', startedAt: new Date(NOW.getTime() - 8 * DAY) },
    ]);

    await expect(build().sweep()).resolves.toEqual({ scanned: 1, expired: 1 });
    expect(aiAssist.expireRun).toHaveBeenCalledWith(
      'run_1',
      expect.stringContaining('7 days'),
    );
  });

  /**
   * 🔴 plan OQ-5 ① — Chris answered 7 days. Asserted as a real cutoff date
   * rather than by reading the constant back, so the test fails if the unit is
   * ever wrong (days vs hours) and not merely if the number changes.
   */
  it('uses a 7-day cutoff by default', async () => {
    await build().sweep();
    expect(whereOf().startedAt).toEqual({
      lt: new Date(NOW.getTime() - 7 * DAY),
    });
  });

  it('honours AGENT_RUN_EXPIRY_DAYS', async () => {
    env.AGENT_RUN_EXPIRY_DAYS = '2';
    await build().sweep();
    expect(whereOf().startedAt).toEqual({
      lt: new Date(NOW.getTime() - 2 * DAY),
    });
  });

  it.each([['junk'], ['0'], ['-3'], ['']])(
    'falls back to 7 days when the env value is %p',
    async (raw) => {
      env.AGENT_RUN_EXPIRY_DAYS = raw;
      await build().sweep();
      expect(whereOf().startedAt).toEqual({
        lt: new Date(NOW.getTime() - 7 * DAY),
      });
    },
  );

  /**
   * 🔴🔴 The scope rule, and the one most likely to be "improved" later.
   *
   * `running` is deliberately out. A run in that state has an in-flight model
   * call, and expiring it from the scheduler would record it as over while it
   * is still working — the platform telling itself something finished when it
   * did not. Detecting genuinely dead runs needs a heartbeat, not a threshold.
   */
  it('only sweeps awaiting_approval — never running', async () => {
    await build().sweep();
    expect(whereOf().status).toBe('awaiting_approval');
  });

  /**
   * F8 learned this the expensive way: `runState` holds the model's message
   * history UNSCRUBBED (D6 scrubs on the way into `AgentMessage`, a different
   * column). Nothing here needs it, so nothing here selects it.
   */
  it('never selects runState', async () => {
    await build().sweep();
    // Falsy, not absent: `runState: false` is a legitimate spelling that also
    // excludes it.
    expect(argsOf().select?.runState).toBeFalsy();
    expect(argsOf().select).toEqual({ id: true, startedAt: true });
  });

  it('takes the oldest first, in a bounded batch', async () => {
    await build().sweep();
    expect(argsOf().orderBy).toEqual({ startedAt: 'asc' });
    expect(argsOf().take).toBe(50);
  });

  it('does nothing at all when disabled', async () => {
    env.AGENT_RUN_EXPIRY_ENABLED = 'false';
    await expect(build().sweep()).resolves.toEqual({ scanned: 0, expired: 0 });
    // Not one query: a disabled sweep should cost nothing, not cost a query
    // whose result is thrown away.
    expect(prisma.agentRun.findMany).not.toHaveBeenCalled();
  });

  it('stays on when the flag is unset or misspelled', async () => {
    env.AGENT_RUN_EXPIRY_ENABLED = 'FALSE';
    await build().sweep();
    expect(prisma.agentRun.findMany).toHaveBeenCalled();
  });

  it('costs nothing beyond the query when there is nothing parked', async () => {
    await expect(build().sweep()).resolves.toEqual({ scanned: 0, expired: 0 });
    expect(aiAssist.expireRun).not.toHaveBeenCalled();
  });

  /**
   * 🔴 One row's failure must not abandon the round. Unlike the sync sweep's
   * vendor-down flags there is no shared dependency here — these are
   * independent local writes, so a failure on one says nothing about the next.
   */
  it('carries on after a row that could not be expired', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      { id: 'run_1', startedAt: NOW },
      { id: 'run_2', startedAt: NOW },
      { id: 'run_3', startedAt: NOW },
    ]);
    aiAssist.expireRun.mockRejectedValueOnce(new Error('row is gone'));

    await expect(build().sweep()).resolves.toEqual({ scanned: 3, expired: 2 });
    expect(aiAssist.expireRun).toHaveBeenCalledTimes(3);
  });

  /**
   * 🔴 BUG-002 — an exception escaping a scheduled job is an unhandled
   * rejection, which kills the Nest process. The cron boundary swallows;
   * `sweep()` itself may still be awaited by a caller that wants the numbers.
   */
  it('never lets the cron boundary throw', async () => {
    prisma.agentRun.findMany.mockRejectedValue(new Error('db down'));
    await expect(build().handleCron()).resolves.toBeUndefined();
  });
});
