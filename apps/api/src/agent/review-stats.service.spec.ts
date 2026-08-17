import { Test } from '@nestjs/testing';
import {
  AgentReviewStatsService,
  FAST_REVIEW_SECONDS,
} from './review-stats.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 期二 G7 / plan B7 — R13 monitoring.
 *
 * 🔴 What is being pinned is not arithmetic. It is the three judgements the
 * arithmetic rests on, each of which can be wrong while every number still
 * looks plausible:
 *
 *   1. WHO counts — only proposals a person decided. Machine tidy-up must not
 *      be counted as a rejection, because that makes rubber-stamping look
 *      BETTER than it is.
 *   2. WHAT counts as an approval — a proposal the gates later refused was
 *      still approved by the human.
 *   3. Null, not zero, when there is nothing to divide.
 *
 * Get any of those backwards and the dashboard reports a reassuring number
 * about a risk that is materialising.
 */

const at = (iso: string) => new Date(iso);

/** Decided `seconds` after it was created. */
const decidedRow = (
  overrides: {
    status?: string;
    approvedById?: string | null;
    seconds?: number;
  } = {},
) => {
  const seconds = overrides.seconds ?? 300;
  const createdAt = at('2026-08-16T09:00:00Z');
  return {
    status: overrides.status ?? 'executed',
    approvedById:
      overrides.approvedById === undefined ? 'u-admin' : overrides.approvedById,
    createdAt,
    decidedAt: new Date(createdAt.getTime() + seconds * 1000),
  };
};

describe('AgentReviewStatsService', () => {
  let service: AgentReviewStatsService;
  let prisma: {
    agentProposal: { findMany: jest.Mock; count: jest.Mock };
    appUser: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      agentProposal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      appUser: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentReviewStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AgentReviewStatsService);
  });

  // ── 1. who counts ──────────────────────────────────────────

  /**
   * 🔴 The load-bearing one, and the direction of the error is why.
   *
   * `abortRun` rejects a run's pending proposals in bulk, setting neither
   * `decidedAt` nor `approvedById`. Counting those as rejections would push the
   * approval rate DOWN — i.e. make a reviewer who says yes to everything look
   * more sceptical the more runs got stopped. A risk metric that fails in the
   * reassuring direction is worse than no metric.
   */
  it('counts only proposals a PERSON decided', async () => {
    await service.summarise(30);

    const { where } = prisma.agentProposal.findMany.mock.calls[0][0] as {
      where: { decidedAt: { not: null; gte: Date } };
    };
    // `decidedAt` is written on exactly four paths, all of them in the approval
    // orchestrator — so this predicate IS "a human decided it".
    // agent.boundary.spec.ts holds that true.
    expect(where.decidedAt.not).toBeNull();
    expect(where.decidedAt.gte).toBeInstanceOf(Date);
  });

  it('bounds the window by the requested number of days', async () => {
    const before = Date.now();
    await service.summarise(7);

    const { where } = prisma.agentProposal.findMany.mock.calls[0][0] as {
      where: { decidedAt: { gte: Date } };
    };
    const days = (before - where.decidedAt.gte.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  // ── 2. what counts as an approval ──────────────────────────

  /**
   * 🔴 期二 G1 marks a proposal `failed` when the approver said yes and one of
   * the eight assign gates then refused. The human still approved.
   *
   * Counting it as a rejection would make a reviewer look MORE sceptical the
   * more often the platform had to save them — exactly backwards, and it would
   * show up as an improving trend at the moment things were going wrong.
   */
  it('treats a gate-refused proposal as an approval, because the person approved it', async () => {
    prisma.agentProposal.findMany.mockResolvedValue([
      decidedRow({ status: 'executed' }),
      decidedRow({ status: 'failed' }),
      decidedRow({ status: 'rejected' }),
    ]);

    const stats = await service.summarise();

    expect(stats.decided).toBe(3);
    expect(stats.approved).toBe(2);
    expect(stats.rejected).toBe(1);
    expect(stats.approvalRate).toBeCloseTo(0.667, 3);
  });

  // ── 3. null, not zero ──────────────────────────────────────

  it('reports no rate at all when nothing was decided', async () => {
    const stats = await service.summarise();

    // 🔴 `0` would read as "this team approves nothing", which is the opposite
    // of "there is nothing here". Same rule as `lastSuccessAt: null`.
    expect(stats.approvalRate).toBeNull();
    expect(stats.medianSecondsToDecide).toBeNull();
    expect(stats.decided).toBe(0);
  });

  // ── the two metrics, and their asymmetry ───────────────────

  describe('🔴 fast decisions are evidence; a slow median is not', () => {
    it('counts a decision made in seconds as unread', async () => {
      prisma.agentProposal.findMany.mockResolvedValue([
        decidedRow({ seconds: 2 }),
        decidedRow({ seconds: FAST_REVIEW_SECONDS - 1 }),
        decidedRow({ seconds: FAST_REVIEW_SECONDS }),
        decidedRow({ seconds: 4000 }),
      ]);

      const stats = await service.summarise();

      // The threshold is exclusive: exactly at it is not "under" it.
      expect(stats.fastDecisions).toBe(2);
      expect(stats.fastReviewSeconds).toBe(FAST_REVIEW_SECONDS);
    });

    /**
     * Median, not mean, and this is the case that decides it: one overnight
     * approval would drag a mean past any threshold worth having while nine
     * five-second decisions sat underneath it.
     */
    it('uses a median so one overnight approval cannot hide nine fast ones', async () => {
      prisma.agentProposal.findMany.mockResolvedValue([
        decidedRow({ seconds: 5 }),
        decidedRow({ seconds: 5 }),
        decidedRow({ seconds: 50_000 }),
      ]);

      const stats = await service.summarise();

      expect(stats.medianSecondsToDecide).toBe(5);
      // The mean would be ~16,670 — a number that would read as careful review.
      expect(stats.medianSecondsToDecide).toBeLessThan(100);
    });

    /**
     * ⚠️ The fixture is deliberately LOPSIDED, and the first version was not.
     *
     * It used 10/20/30/40, where the mean and the median are both 25 — so
     * swapping the implementation for a mean left this test green. It was
     * asserting the number, not the statistic. 10/20/30/200 has a median of 25
     * and a mean of 65, so only one of the two can pass.
     */
    it('averages the two middle values on an even count', async () => {
      prisma.agentProposal.findMany.mockResolvedValue([
        decidedRow({ seconds: 10 }),
        decidedRow({ seconds: 20 }),
        decidedRow({ seconds: 30 }),
        decidedRow({ seconds: 200 }),
      ]);

      await expect(service.summarise()).resolves.toMatchObject({
        medianSecondsToDecide: 25,
      });
    });
  });

  // ── per reviewer ───────────────────────────────────────────

  /**
   * 🔴 The half the aggregate cannot answer. A team at 67% overall can contain
   * one reviewer at 100% in four seconds, and the aggregate is the number that
   * hides them.
   */
  describe('🔴 per reviewer — where the aggregate hides the person', () => {
    beforeEach(() => {
      prisma.agentProposal.findMany.mockResolvedValue([
        decidedRow({ approvedById: 'u-fast', seconds: 3 }),
        decidedRow({ approvedById: 'u-fast', seconds: 4 }),
        decidedRow({ approvedById: 'u-fast', seconds: 5 }),
        decidedRow({
          approvedById: 'u-careful',
          status: 'rejected',
          seconds: 900,
        }),
      ]);
      prisma.appUser.findMany.mockResolvedValue([
        { id: 'u-fast', displayName: 'Fast Reviewer' },
        { id: 'u-careful', displayName: 'Careful Reviewer' },
      ]);
    });

    it('separates a 100%-in-seconds reviewer from the aggregate', async () => {
      const stats = await service.summarise();

      // The aggregate on its own looks unremarkable.
      expect(stats.approvalRate).toBeCloseTo(0.75, 3);

      const fast = stats.byReviewer.find((r) => r.approverId === 'u-fast');
      expect(fast).toMatchObject({
        decided: 3,
        approved: 3,
        approvalRate: 1,
        fastDecisions: 3,
      });
    });

    it('names the person, because a cuid is not something anyone can act on', async () => {
      const stats = await service.summarise();

      expect(stats.byReviewer[0].displayName).toBe('Fast Reviewer');
      // 🔴 H4 — the NAME and nothing else. No email: it adds no information to
      // this question, and every extra field is a new place PII lives.
      expect(Object.keys(stats.byReviewer[0]).sort()).toEqual([
        'approvalRate',
        'approved',
        'approverId',
        'decided',
        'displayName',
        'fastDecisions',
        'medianSecondsToDecide',
        'rejected',
      ]);
      expect(prisma.appUser.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['u-fast', 'u-careful'] } },
        select: { id: true, displayName: true },
      });
    });

    it('busiest reviewer first', async () => {
      const stats = await service.summarise();
      expect(stats.byReviewer.map((r) => r.approverId)).toEqual([
        'u-fast',
        'u-careful',
      ]);
    });

    /**
     * A deactivated or deleted account still made those decisions. Dropping the
     * row would quietly remove them from the totals a reader is comparing
     * against — the one thing a statistic must not do silently.
     */
    it('keeps the decisions of an account it cannot name', async () => {
      prisma.appUser.findMany.mockResolvedValue([]);

      const stats = await service.summarise();

      expect(stats.decided).toBe(4);
      expect(stats.byReviewer[0].displayName).toBeNull();
      expect(stats.byReviewer[0].decided).toBe(3);
    });

    it('does not look up a name it does not have', async () => {
      prisma.agentProposal.findMany.mockResolvedValue([
        decidedRow({ approvedById: null }),
      ]);

      const stats = await service.summarise();

      expect(prisma.appUser.findMany).not.toHaveBeenCalled();
      expect(stats.byReviewer[0].approverId).toBeNull();
      expect(stats.byReviewer[0].decided).toBe(1);
    });
  });

  it('reports what is still waiting, at any age', async () => {
    prisma.agentProposal.count.mockResolvedValue(4);

    // Context the rate cannot carry: a high approval rate over 2 decisions with
    // 40 proposals queued is a different situation from the same rate over 40.
    await expect(service.summarise()).resolves.toMatchObject({ pending: 4 });
    expect(prisma.agentProposal.count).toHaveBeenCalledWith({
      where: { status: 'pending' },
    });
  });
});
