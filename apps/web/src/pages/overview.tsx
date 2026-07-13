import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CircleAlert,
  ClipboardList,
  Inbox,
  KeyRound,
  LineChart,
  Lightbulb,
  TriangleAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { useDrift, useLedgerStats, useRequests } from '@/hooks/queries';
import { matchesFilter } from '@/lib/requests';
import type { RequestStatus } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { relativeTime, signed } from '@/lib/format';

// Small "→" link shown in a card header (prototype: View all / Open).
function HeaderLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 cursor-pointer items-center gap-[4px] text-[11.5px] font-medium text-fg-muted hover:text-fg"
    >
      {label}
      <ArrowRight size={13} strokeWidth={2} />
    </button>
  );
}

// Aggregate request status → badge tone + label + leading-dot colour.
const REQ: Record<RequestStatus, { tone: BadgeTone; label: string }> = {
  OPEN: { tone: 'info', label: 'Open' },
  IN_PROGRESS: { tone: 'warn', label: 'In progress' },
  COMPLETED: { tone: 'ok', label: 'Completed' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};
const DOT: Record<BadgeTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  info: 'bg-info',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  purple: 'bg-purple',
};

// Static roadmap (matches the prototype; no backend source — it is a plan, not data).
const ROADMAP: {
  label: string;
  tone: BadgeTone;
  badge: string;
  lead: boolean;
}[] = [
  {
    label: 'OpCo IT self-service portal',
    tone: 'info',
    badge: 'In progress',
    lead: true,
  },
  {
    label: 'AI assist — parse remarks & suggest',
    tone: 'purple',
    badge: 'Next',
    lead: true,
  },
  {
    label: 'Richer procurement stage tracking',
    tone: 'neutral',
    badge: 'Planned',
    lead: false,
  },
  {
    label: 'Dynamics 365 licenses',
    tone: 'neutral',
    badge: 'Backlog',
    lead: false,
  },
];

export function Overview() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'summary' | 'analytics'>('summary');
  const requests = useRequests();
  const drift = useDrift();
  const stats = useLedgerStats();

  const openReqs = (requests.data ?? []).filter(
    (r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED',
  );
  // Requests with an active procurement-stage line item (derived, like the list).
  const inProcurement = (requests.data ?? []).filter((r) =>
    matchesFilter(r, 'procurement'),
  ).length;
  const openDrift = (drift.data ?? []).filter((d) => d.status === 'OPEN');
  // Honest "last checked" proxy: the most recent alert detection (no separate
  // reconcile-run timestamp is stored). Undefined until data loads.
  const lastChecked = openDrift
    .map((d) => d.detectedAt)
    .sort()
    .at(-1);

  // KPI value: never invent a number — show '—' while loading / on error.
  const kpi = (
    q: { isLoading: boolean; isError: boolean },
    value: number,
  ): string => (q.isLoading || q.isError ? '—' : String(value));

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Summary / Analytics tabs */}
      <div className="flex items-center gap-[22px] border-b border-border">
        {(['summary', 'analytics'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'relative -mb-px cursor-pointer border-b-2 pb-[10px] pt-[2px] text-[13px] capitalize transition-colors',
              tab === t
                ? 'border-accent font-semibold text-fg'
                : 'border-transparent font-medium text-fg-muted hover:text-fg',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'analytics' ? (
        <Card>
          <EmptyState
            tone="info"
            icon={<LineChart size={18} strokeWidth={2} />}
            title="Analytics coming"
            description="Usage trends and reconciliation history land in a later phase."
          />
        </Card>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Open requests"
              value={kpi(requests, openReqs.length)}
              tone="info"
              icon={<Inbox size={16} strokeWidth={2} />}
              sub="across all OpCos"
            />
            <StatCard
              label="In procurement"
              value={kpi(requests, inProcurement)}
              tone="warn"
              icon={<ClipboardList size={16} strokeWidth={2} />}
              sub="awaiting quote · vendor"
            />
            <StatCard
              label="Open drift alerts"
              value={kpi(drift, openDrift.length)}
              tone="danger"
              icon={<TriangleAlert size={16} strokeWidth={2} />}
              sub="ledger vs tenant"
            />
            <StatCard
              label="Licenses assigned"
              value={kpi(stats, stats.data?.totalAssigned ?? 0)}
              tone="ok"
              icon={<KeyRound size={16} strokeWidth={2} />}
              sub="in active use"
            />
          </div>

          {/* Needs attention + right rail */}
          <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              padded={false}
              title={
                <span className="flex items-center gap-[8px]">
                  <CircleAlert
                    size={16}
                    strokeWidth={2}
                    className="text-danger"
                  />
                  Needs attention
                </span>
              }
              action={
                <HeaderLink
                  label="View all requests"
                  onClick={() => navigate('/requests')}
                />
              }
            >
              <div className="px-[16px]">
                {requests.isLoading ? (
                  <Loading />
                ) : requests.isError ? (
                  <LoadError />
                ) : openReqs.length === 0 ? (
                  <EmptyState
                    tone="ok"
                    icon={<CircleAlert size={18} strokeWidth={2} />}
                    title="All clear"
                    description="No open requests need attention right now."
                  />
                ) : (
                  openReqs.map((r) => {
                    const meta = REQ[r.status];
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-[12px] border-b border-border py-[11px] last:border-0"
                      >
                        <span
                          className={cn(
                            'h-[7px] w-[7px] shrink-0 rounded-full',
                            DOT[meta.tone],
                          )}
                        />
                        <div className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                          <span className="truncate text-[13px] font-medium">
                            <span className="font-mono">
                              {r.serviceNowNumber ?? `#${r.id.slice(-6)}`}
                            </span>
                            <span className="text-fg-muted"> · </span>
                            {r.targetDisplayName ?? r.targetUpn}
                          </span>
                          <span className="truncate font-mono text-[11px] text-fg-subtle">
                            {r.targetUpn}
                          </span>
                        </div>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="w-[34px] shrink-0 text-right font-mono text-[11.5px] text-fg-subtle">
                          {relativeTime(r.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <div className="flex flex-col gap-[16px]">
              {/* Drift summary */}
              <Card
                title="Drift summary"
                action={
                  openDrift.length > 0 ? (
                    <HeaderLink
                      label="Open"
                      onClick={() => navigate('/drift')}
                    />
                  ) : undefined
                }
              >
                {drift.isLoading ? (
                  <Loading />
                ) : drift.isError ? (
                  <LoadError />
                ) : openDrift.length === 0 ? (
                  <EmptyState
                    tone="ok"
                    icon={<TriangleAlert size={18} strokeWidth={2} />}
                    title="In sync"
                    description="No open drift alerts."
                  />
                ) : (
                  <div className="flex flex-col gap-[12px]">
                    <div className="flex items-baseline gap-[8px]">
                      <span className="text-[27px] font-semibold leading-none tracking-[-.02em]">
                        {openDrift.length}
                      </span>
                      <span className="text-[12px] text-fg-subtle">
                        open {openDrift.length === 1 ? 'alert' : 'alerts'}
                        {lastChecked &&
                          ` · last checked ${relativeTime(lastChecked)}`}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      {openDrift.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between border-t border-border py-[9px] first:border-0"
                        >
                          <span className="truncate text-[12.5px]">
                            {d.sku.displayName}
                          </span>
                          <Badge tone={d.delta < 0 ? 'danger' : 'warn'}>
                            {signed(d.delta)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Roadmap (static) */}
              <Card
                title={
                  <span className="flex items-center gap-[8px]">
                    <Lightbulb
                      size={16}
                      strokeWidth={2}
                      className="text-purple"
                    />
                    On the roadmap
                  </span>
                }
              >
                <div className="flex flex-col gap-[12px]">
                  {ROADMAP.map((r) => (
                    <div key={r.label} className="flex items-center gap-[10px]">
                      <span
                        className={cn(
                          'h-[6px] w-[6px] shrink-0 rounded-full',
                          r.lead ? 'bg-purple' : 'bg-neutral',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">
                        {r.label}
                      </span>
                      <Badge tone={r.tone}>{r.badge}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* Recent activity — no events endpoint yet (honest EmptyState) */}
          <Card title="Recent activity">
            <EmptyState
              icon={<Activity size={18} strokeWidth={2} />}
              title="No activity yet"
              description="The activity feed appears once request event history is exposed by the API."
            />
          </Card>
        </>
      )}
    </div>
  );
}
