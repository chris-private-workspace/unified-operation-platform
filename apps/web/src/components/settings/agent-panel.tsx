import { useState } from 'react';
import { Bot, ShieldAlert } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { Select } from '@/components/ui/select';
import { useAgentKillSwitch, useAgentReviewStats } from '@/hooks/queries';
import { useSetAgentKillSwitch } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import type { AgentKillSwitchStatus, ReviewerStats } from '@/lib/api-types';

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[11px] align-middle';
const NUM = 'font-mono text-[13px]'; // DS-5 — every figure is mono

const WINDOWS = [7, 30, 90];

function Restricted({ what }: { what: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-card">
      <EmptyState
        icon={<ShieldAlert size={18} strokeWidth={2} />}
        title="Access required"
        description={what}
      />
    </div>
  );
}

/** `null` is "no data", and it must not print as a number. */
const pct = (rate: number | null) =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;

const duration = (seconds: number | null) => {
  if (seconds === null) return '—';
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};

/**
 * 期二 G3 — the switch, and the fact it is easy to misread.
 *
 * 🔴 The tone escalates on `settled`, not on `enabled`. Being switched off is
 * an intended state and should not shout; being switched off with runs still
 * parked is the state an operator has to know about, because those runs come
 * back the moment the switch does.
 */
function switchTone(status: AgentKillSwitchStatus): {
  tone: BadgeTone;
  label: string;
} {
  if (status.enabled) return { tone: 'purple', label: 'Running' };
  if (status.settled) return { tone: 'neutral', label: 'Switched off' };
  return { tone: 'warn', label: 'Switched off — not settled' };
}

function KillSwitchCard() {
  const status = useAgentKillSwitch();
  const set = useSetAgentKillSwitch();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (status.isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-card">
        <Loading />
      </div>
    );
  }
  if (status.isError) {
    const forbidden =
      status.error instanceof ApiError && status.error.status === 403;
    return forbidden ? (
      <Restricted what="Switching the AI agent on or off changes what the whole platform will do, so it is limited to platform admins." />
    ) : (
      <div className="rounded-[12px] border border-border bg-card">
        <LoadError description="Couldn't load the agent switch. Check the API is running, then retry." />
      </div>
    );
  }

  const data = status.data;
  if (!data) return null;
  const { tone, label } = switchTone(data);
  const residue = data.liveRuns > 0 || data.pendingProposals > 0;

  const apply = () => {
    set.mutate(
      { enabled: !data.enabled, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          setConfirming(false);
          setReason('');
        },
      },
    );
  };

  return (
    <Card
      title="AI agent"
      subtitle="Switching the agent off refuses new runs, resumes and approvals. It does not undo anything already done."
      action={
        <Button
          variant={data.enabled ? 'danger' : 'primary'}
          onClick={() => setConfirming(true)}
          disabled={set.isPending}
        >
          {data.enabled ? 'Switch off' : 'Switch on'}
        </Button>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-[10px]">
          <Badge tone={tone} dot>
            {label}
          </Badge>
          <span className="font-mono text-[12.5px] text-fg-muted">
            {data.principal}
          </span>
        </div>

        {/* 🔴 B5 — the two facts, side by side and never merged. An operator
            who reads only the badge during an incident would conclude the
            agent had stopped; these are what says otherwise. */}
        <div className="flex gap-[28px]">
          <div className="flex flex-col gap-[2px]">
            <span className="text-[11.5px] text-fg-subtle">Runs in flight</span>
            <span className={NUM}>{data.liveRuns}</span>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[11.5px] text-fg-subtle">
              Proposals pending
            </span>
            <span className={NUM}>{data.pendingProposals}</span>
          </div>
        </div>

        {!data.enabled && residue && (
          <p className="text-[11.5px] leading-[1.55] text-warn">
            Switched off, but <strong>not settled</strong>. The runs above are
            inert while the switch is off — they become live again, proposals
            and all, the moment somebody switches it back on.
          </p>
        )}

        <p className="text-[11.5px] leading-[1.55] text-fg-muted">
          Rejecting a proposal keeps working while the agent is off, on purpose:
          stopping the agent must not stop people clearing up after it.
        </p>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={data.enabled ? 'Switch the AI agent off?' : 'Switch it back on?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant={data.enabled ? 'danger' : 'primary'}
              onClick={apply}
              disabled={set.isPending}
            >
              {data.enabled ? 'Switch off' : 'Switch on'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-[12px]">
          {data.enabled ? (
            <p className="text-[12.5px] leading-[1.6] text-fg-muted">
              New runs, resumes and <strong>approvals</strong> will be refused.
              Runs already waiting stay where they are — nothing is deleted and
              nothing already assigned is undone.
            </p>
          ) : (
            /* 🔴 The direction that actually surprises people. Switching ON is
               what releases whatever was parked, and one of those proposals
               may assign a real licence. */
            <p className="text-[12.5px] leading-[1.6] text-fg-muted">
              {residue ? (
                <>
                  <strong>
                    {data.liveRuns} run(s) and {data.pendingProposals}{' '}
                    proposal(s)
                  </strong>{' '}
                  are parked. Switching on makes them approvable again — a
                  licence assignment among them would go ahead once somebody
                  approves it.
                </>
              ) : (
                'Nothing is parked, so this only allows new runs to start.'
              )}
            </p>
          )}
          <div className="flex flex-col gap-[6px]">
            <label className="text-[12px] text-fg-muted" htmlFor="ks-reason">
              Reason (optional)
            </label>
            <Input
              id="ks-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Stored on the audit entry"
            />
          </div>
          {set.isError && (
            <p className="text-[11.5px] text-danger">
              Couldn’t change the switch. Nothing was altered — try again.
            </p>
          )}
        </div>
      </Dialog>
    </Card>
  );
}

function ReviewerRow({ row }: { row: ReviewerStats }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className={TD}>
        <span className="text-[13px]">
          {row.displayName ?? (
            <span className="text-fg-subtle">Unknown account</span>
          )}
        </span>
      </td>
      <td className={TD}>
        <span className={NUM}>{row.decided}</span>
      </td>
      <td className={TD}>
        <span className={NUM}>{pct(row.approvalRate)}</span>
      </td>
      <td className={TD}>
        <span className={NUM}>{duration(row.medianSecondsToDecide)}</span>
      </td>
      <td className={TD}>
        {row.fastDecisions > 0 ? (
          <Badge tone="warn">{row.fastDecisions}</Badge>
        ) : (
          <span className={`${NUM} text-fg-subtle`}>0</span>
        )}
      </td>
    </tr>
  );
}

/**
 * 期二 G7 / plan B7 — R13.
 *
 * 🔴 The screen has to carry the reading instructions, not just the numbers.
 * `fastDecisions` is evidence — a proposal decided seconds after it appeared
 * was not read. A slow median is NOT evidence of care: the clock starts when
 * the proposal was created, so it may equally mean nobody was looking. A panel
 * that presented both as "how careful the team is" would be inventing the
 * reassuring reading, which is the failure R13 is about in the first place.
 */
function ReviewStatsCard() {
  const [days, setDays] = useState(30);
  const stats = useAgentReviewStats(days);

  if (stats.isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-card">
        <Loading />
      </div>
    );
  }
  if (stats.isError) {
    const forbidden =
      stats.error instanceof ApiError && stats.error.status === 403;
    return forbidden ? (
      <Restricted what="These figures describe named people's reviewing behaviour, so they are limited to platform admins." />
    ) : (
      <div className="rounded-[12px] border border-border bg-card">
        <LoadError description="Couldn't load the review figures. Check the API is running, then retry." />
      </div>
    );
  }

  const data = stats.data;
  if (!data) return null;

  return (
    <Card
      padded={false}
      title="Proposal reviews"
      subtitle={`${data.decided} decided in the last ${data.windowDays} days · ${data.pending} still waiting.`}
      action={
        /* 🔴 The width goes on a WRAPPER, not on the <select>.
           `Select` is `<div class="relative w-full">` with the chevron
           absolutely positioned against that div, so sizing only the inner
           element leaves the chevron pinned to the full-width edge — which
           rendered as a stray arrow floating at the far right of the card
           header. Caught by looking at the screenshot; every test was green. */
        <div className="w-[150px]">
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Window"
          >
            {WINDOWS.map((value) => (
              <option key={value} value={value}>
                Last {value} days
              </option>
            ))}
          </Select>
        </div>
      }
    >
      <div className="flex flex-col gap-[14px] px-[16px] pb-[4px] pt-[14px]">
        <div className="flex flex-wrap gap-[28px]">
          <div className="flex flex-col gap-[2px]">
            <span className="text-[11.5px] text-fg-subtle">Approval rate</span>
            <span className="font-mono text-[20px] font-semibold">
              {pct(data.approvalRate)}
            </span>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[11.5px] text-fg-subtle">Median review</span>
            <span className="font-mono text-[20px] font-semibold">
              {duration(data.medianSecondsToDecide)}
            </span>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[11.5px] text-fg-subtle">
              Under {data.fastReviewSeconds}s
            </span>
            <span
              className={`font-mono text-[20px] font-semibold ${
                data.fastDecisions > 0 ? 'text-warn' : ''
              }`}
            >
              {data.fastDecisions}
            </span>
          </div>
        </div>

        {/* 🔴 The asymmetry, on screen. Without it a reader takes a slow median
            as diligence — the exact conclusion this panel exists to prevent. */}
        <p className="text-[11.5px] leading-[1.55] text-fg-muted">
          A decision made in <strong>seconds</strong> was not read — that is
          what the third figure counts. The median is{' '}
          <strong>context, not proof of care</strong>: the clock starts when the
          proposal was created, so a slow one may equally mean nobody was
          looking.
        </p>
      </div>

      {data.byReviewer.length === 0 ? (
        <EmptyState
          icon={<Bot size={18} strokeWidth={2} />}
          title="No decisions yet"
          description="Nobody has approved or rejected an agent proposal in this window."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Reviewer</th>
                <th className={TH}>Decided</th>
                <th className={TH}>Approved</th>
                <th className={TH}>Median</th>
                <th className={TH}>Under {data.fastReviewSeconds}s</th>
              </tr>
            </thead>
            <tbody>
              {data.byReviewer.map((row) => (
                <ReviewerRow key={row.approverId ?? 'unattributed'} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Settings → AI agent (期二 G3 + G7).
 *
 * Both halves live here rather than under Integrations because they are not
 * about vendor wiring: one decides whether the capability runs at all, the
 * other watches whether the human gate in front of it is still being used.
 * The Integrations panel keeps the connector row (runtime, model) it already
 * had — that is configuration, and this is operation.
 *
 * One primary action in the view (H6): the switch. The figures are read-only.
 */
export function AgentPanel() {
  return (
    <div className="flex flex-col gap-[16px]">
      <KillSwitchCard />
      <ReviewStatsCard />
    </div>
  );
}
