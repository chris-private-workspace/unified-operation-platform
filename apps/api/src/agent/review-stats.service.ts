import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 期二 G7 / plan B7 — the numbers R13 is watched with.
 *
 * 🔴 **R13 is not "the agent proposes something wrong". It is that the person
 * approving stops reading.** ADR-0036 D3 puts a human in front of every write,
 * which is the entire safety argument for Tier 1 — and an approval step nobody
 * actually performs converts that argument into a formality while every screen
 * keeps showing a person's name against the decision. Nothing about the system
 * looks different when this happens, which is why it needs numbers rather than
 * attention.
 *
 * `audit-fields.ts` already made the audit side of this one query
 * (AGENT_PROPOSAL_DECIDED covers approve AND reject, told apart by
 * `metadata.reason`). This reads `AgentProposal` instead, and the reason is
 * that the columns are STRUCTURED: `status`, `decidedAt`, `approvedById`.
 * Deriving an approval rate from an audit row would mean parsing the prefix of
 * a free-text reason string — a metric one wording change away from silently
 * becoming wrong, which is worse than no metric.
 */

/**
 * Under this, nobody read it.
 *
 * A starting number, not a finding. What makes it defensible is the asymmetry
 * below: a SHORT time is unambiguous evidence, a long one is not evidence of
 * anything, so this threshold only ever has to be right about the fast end.
 */
export const FAST_REVIEW_SECONDS = 30;

/** Default window. Long enough to have data, short enough to describe now. */
export const DEFAULT_WINDOW_DAYS = 30;

export interface ReviewerStats {
  /** `AppUser.id`. Null for the one path that records a decision without one. */
  approverId: string | null;
  displayName: string | null;
  decided: number;
  approved: number;
  rejected: number;
  approvalRate: number | null;
  medianSecondsToDecide: number | null;
  fastDecisions: number;
}

export interface AgentReviewStats {
  windowDays: number;
  since: Date;
  decided: number;
  approved: number;
  rejected: number;
  /** 🔴 Null when nothing was decided — never 0. See `rateOf`. */
  approvalRate: number | null;
  medianSecondsToDecide: number | null;
  fastDecisions: number;
  /** Echoed so a reader knows what "fast" meant without reading this file. */
  fastReviewSeconds: number;
  /** Still waiting on a person. Context the rate cannot carry on its own. */
  pending: number;
  byReviewer: ReviewerStats[];
}

/** One decided proposal, reduced to the four fields the maths needs. */
interface DecidedRow {
  status: string;
  approvedById: string | null;
  createdAt: Date;
  decidedAt: Date;
}

/**
 * 🔴 Null, never 0, when there is nothing to divide.
 *
 * `approvalRate: 0` reads as "this person approves nothing", which is the
 * opposite of "this person has decided nothing". The platform already keeps
 * that distinction elsewhere for the same reason — `lastSuccessAt: null` is "no
 * evidence", never a guessed timestamp (ADR-0010 D4).
 */
function rateOf(approved: number, decided: number): number | null {
  if (decided === 0) return null;
  return Math.round((approved / decided) * 1000) / 1000;
}

/**
 * Median, not mean.
 *
 * One proposal approved the next morning is 14 hours, and it would drag the
 * average of ten 5-second decisions up past any threshold worth having. The
 * question being asked is what a TYPICAL review looks like, and that is what a
 * median answers.
 */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

const secondsToDecide = (row: DecidedRow) =>
  Math.max(
    0,
    Math.round((row.decidedAt.getTime() - row.createdAt.getTime()) / 1000),
  );

/**
 * 🔴 What a person DECIDED, which is not what the platform then did.
 *
 * `executed` and `failed` both mean the approver said yes: 期二 G1 marks a
 * proposal `failed` when the approver approved it and one of the eight assign
 * gates then refused. For R13 that is still an approval — the question is
 * whether the human is still reading, and they said yes.
 *
 * Counting `failed` as a rejection would make a reviewer look more sceptical
 * the more often the platform had to save them, which is precisely backwards.
 */
const isApproval = (row: DecidedRow) =>
  row.status === 'executed' || row.status === 'failed';

@Injectable()
export class AgentReviewStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async summarise(windowDays = DEFAULT_WINDOW_DAYS): Promise<AgentReviewStats> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    /**
     * 🔴 `decidedAt: { not: null }` IS the definition of "a person decided
     * this", and it is a checkable one: every write of that column lives in
     * `agent-approval.service.ts`, i.e. on a path a human triggered.
     * `agent.boundary.spec.ts` holds that true.
     *
     * What it EXCLUDES is the point. `abortRun` rejects a run's pending
     * proposals in bulk and sets neither `decidedAt` nor `approvedById` — those
     * are the platform tidying up, not a person saying no. Counting them would
     * push the approval rate DOWN, i.e. make rubber-stamping look better than
     * it is, which is the one direction a risk metric must never be wrong in.
     *
     * ⚠️ No row cap, deliberately. A truncated statistic is a wrong statistic
     * that looks right; the window is what bounds this, and proposals arrive at
     * human speed.
     */
    const [rows, pending] = await Promise.all([
      this.prisma.agentProposal.findMany({
        where: { decidedAt: { not: null, gte: since } },
        select: {
          status: true,
          approvedById: true,
          createdAt: true,
          decidedAt: true,
        },
      }),
      this.prisma.agentProposal.count({ where: { status: 'pending' } }),
    ]);

    const decided = rows as DecidedRow[];

    return {
      windowDays,
      since,
      ...this.tally(decided),
      fastReviewSeconds: FAST_REVIEW_SECONDS,
      pending,
      byReviewer: await this.byReviewer(decided),
    };
  }

  private tally(rows: DecidedRow[]) {
    const approved = rows.filter(isApproval).length;
    const seconds = rows.map(secondsToDecide);
    return {
      decided: rows.length,
      approved,
      rejected: rows.length - approved,
      approvalRate: rateOf(approved, rows.length),
      medianSecondsToDecide: medianOf(seconds),
      fastDecisions: seconds.filter((value) => value < FAST_REVIEW_SECONDS)
        .length,
    };
  }

  /**
   * 🔴 Per person, and that is the half the aggregate cannot answer.
   *
   * Rubber-stamping is an individual habit. A team that approves 70% overall
   * can contain one reviewer at 100% in four seconds, and the aggregate is the
   * number that hides them. A metric that cannot name the person it is about is
   * a metric nobody can act on.
   */
  private async byReviewer(rows: DecidedRow[]): Promise<ReviewerStats[]> {
    const groups = new Map<string | null, DecidedRow[]>();
    for (const row of rows) {
      const bucket = groups.get(row.approvedById);
      if (bucket) bucket.push(row);
      else groups.set(row.approvedById, [row]);
    }

    const names = await this.namesOf(
      [...groups.keys()].filter((id): id is string => id !== null),
    );

    return [...groups.entries()]
      .map(([approverId, group]) => ({
        approverId,
        displayName: approverId ? (names.get(approverId) ?? null) : null,
        ...this.tally(group),
      }))
      .sort((a, b) => b.decided - a.decided);
  }

  /**
   * 🔴 `displayName` ONLY, and nothing else about the person (H4).
   *
   * A name is included at all because a cuid is not something anybody can act
   * on, and a metric nobody can act on is the same as not building one. It is
   * also the minimum that achieves that: email adds no information here, and
   * this endpoint is ADMIN-only for the reason `/admin/audit` is — it describes
   * named individuals' behaviour.
   *
   * ⚠️ `approvedById` carries no foreign key (`AgentProposal`, following
   * `OutboundFailure.resolvedById`), so this is a second query rather than an
   * `include` — and a deactivated or deleted account resolves to `null`, which
   * is reported as null rather than dropping the row. Their decisions still
   * happened.
   */
  private async namesOf(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}
