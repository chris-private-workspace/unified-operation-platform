import { describe, expect, it } from 'vitest';
import { latestRunFailure } from './assistant';
import type { AgentConversationRun, AgentRunStatus } from './api-types';

/**
 * CH-035 `G1` — `latestRunFailure`.
 *
 * 🔴 This file exists because the rule has two halves that fail in opposite
 * directions, and a component test can only ever show one of them at a time:
 * which STATUSES count, and which RUN is asked. Both are one-line mistakes and
 * neither produces an error — the wrong status set stays silent on a real
 * failure, the wrong run puts a permanent notice on a working thread.
 */

const run = (
  status: AgentRunStatus,
  over: Partial<AgentConversationRun> = {},
): AgentConversationRun => ({
  id: `run-${status}`,
  status,
  startedAt: '2026-08-20T07:50:00Z',
  ...over,
});

describe('latestRunFailure (CH-035)', () => {
  it('reports a failed run, and hands back the whoFixes with it', () => {
    const failed = run('failed', { whoFixes: 'platform' });

    expect(latestRunFailure([failed])).toBe(failed);
    expect(latestRunFailure([failed])?.whoFixes).toBe('platform');
  });

  /**
   * `DEV-1` — widened past the spec's `failed`, because `expireRun` writes a
   * `whoFixes` exactly like `failRun` does. A thread whose run expired has the
   * same problem: the person asked something and nothing came back.
   */
  it('reports an expired run too', () => {
    expect(
      latestRunFailure([run('expired', { whoFixes: 'operator' })]),
    ).not.toBeNull();
  });

  /**
   * 🔴 `aborted` is NOT a failure, and this is the assertion that keeps that
   * decision from being quietly reversed by someone reaching for "any terminal
   * status that is not completed".
   *
   * Somebody pressed Stop. There is no failed step behind it, so `whoFixes`
   * would be null and the screen would say "the run stopped" to the person who
   * stopped it.
   */
  it('does not treat a stopped run as a failure', () => {
    expect(latestRunFailure([run('aborted')])).toBeNull();
  });

  it('says nothing about a run that completed', () => {
    expect(latestRunFailure([run('completed')])).toBeNull();
  });

  /**
   * 🔴 The LATEST run only — the rule `isThinking` established in W48.
   *
   * A thread accumulates one run per turn. An implementation asking "did any
   * run fail" would leave a permanent failure notice on a thread that has since
   * answered two questions perfectly well, and it would look correct in every
   * single-run test above.
   */
  it('ignores a failure that has already been superseded', () => {
    expect(
      latestRunFailure([
        run('failed', { id: 'old', whoFixes: 'platform' }),
        run('completed', { id: 'new' }),
      ]),
    ).toBeNull();
  });

  /** The mirror: a fresh failure after older successes still counts. */
  it('reports a failure that came after a success', () => {
    expect(
      latestRunFailure([
        run('completed', { id: 'old' }),
        run('failed', { id: 'new', whoFixes: 'platform' }),
      ])?.id,
    ).toBe('new');
  });

  it('is quiet on a thread with no runs at all', () => {
    expect(latestRunFailure([])).toBeNull();
    expect(latestRunFailure(undefined)).toBeNull();
  });
});
