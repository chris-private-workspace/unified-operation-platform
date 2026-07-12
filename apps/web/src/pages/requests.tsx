import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { Inbox } from 'lucide-react';
import { useRequests } from '@/hooks/queries';
import {
  deriveStatus,
  matchesFilter,
  stageCounts,
  STAGE_LABEL,
  STAGE_TONE,
  type RequestFilter,
} from '@/lib/requests';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 8;

const DOT: Record<BadgeTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  info: 'bg-info',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  purple: 'bg-purple',
};

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[12px] align-middle';

const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'blocked', label: 'Blocked' },
];

export function Requests() {
  const navigate = useNavigate();
  const requests = useRequests();
  const [filter, setFilter] = useState<RequestFilter>('all');
  const [page, setPage] = useState(0);

  const all = requests.data ?? [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.value,
          (requests.data ?? []).filter((r) => matchesFilter(r, f.value)).length,
        ]),
      ) as Record<RequestFilter, number>,
    [requests.data],
  );
  const rows = all.filter((r) => matchesFilter(r, filter));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  function pick(f: RequestFilter) {
    setFilter(f);
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between gap-[16px]">
        {/* Filter pills (prototype): active = inverted pill, others plain + count. */}
        <div className="flex flex-wrap items-center gap-[6px]">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => pick(f.value)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-[7px] rounded-pill px-[12px] py-[6px] text-[12.5px] transition-colors',
                  active
                    ? 'bg-fg font-semibold text-bg'
                    : 'font-medium text-fg-muted hover:bg-hover',
                )}
              >
                {f.label}
                {active ? (
                  <span className="font-mono text-[10.5px] text-bg opacity-70">
                    {counts[f.value]}
                  </span>
                ) : (
                  <span className="rounded-pill bg-hover px-[6px] font-mono text-[10.5px] text-fg-subtle">
                    {counts[f.value]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {requests.data && (
          <span className="shrink-0 text-[11.5px] text-fg-subtle">
            {rows.length} of {all.length} requests
          </span>
        )}
      </div>

      <Card padded={false}>
        {requests.isLoading ? (
          <Loading />
        ) : requests.isError ? (
          <LoadError description="Couldn't load requests. Check the API is running, then retry." />
        ) : rows.length === 0 ? (
          <EmptyState
            tone="ok"
            icon={<Inbox size={18} strokeWidth={2} />}
            title="Nothing here"
            description="No requests match this filter."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>Request</th>
                    <th className={TH}>Target user</th>
                    <th className={TH}>OpCo</th>
                    <th className={TH}>Line items</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Handler</th>
                    <th className={cn(TH, 'text-right')}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const status = deriveStatus(r);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/requests/${r.id}`)}
                        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-hover"
                      >
                        <td className={cn(TD, 'font-mono text-[12px]')}>
                          {r.serviceNowNumber ?? `#${r.id.slice(-6)}`}
                        </td>
                        <td className={TD}>
                          <div className="flex flex-col leading-[1.3]">
                            <span className="font-medium">
                              {r.targetDisplayName ?? r.targetUpn}
                            </span>
                            <span className="font-mono text-[11px] text-fg-subtle">
                              {r.targetUpn}
                            </span>
                          </div>
                        </td>
                        <td className={cn(TD, 'text-fg-muted')}>
                          {r.opco?.code ?? '—'}
                        </td>
                        <td className={TD}>
                          <div className="flex flex-wrap gap-[6px]">
                            {stageCounts(r).map((c) => (
                              <Badge key={c.stage} tone={STAGE_TONE[c.stage]}>
                                {c.count} {STAGE_LABEL[c.stage]}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className={TD}>
                          <span className="flex items-center gap-[7px] whitespace-nowrap">
                            <span
                              className={cn(
                                'h-[7px] w-[7px] shrink-0 rounded-full',
                                DOT[status.tone],
                              )}
                            />
                            {status.label}
                          </span>
                        </td>
                        <td className={cn(TD, 'text-fg-subtle')}>
                          {r.handledById ? 'Assigned' : 'Unassigned'}
                        </td>
                        <td
                          className={cn(
                            TD,
                            'text-right font-mono text-[11.5px] text-fg-subtle',
                          )}
                        >
                          {relativeTime(r.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-[12px] border-t border-border px-[16px] py-[11px]">
              <span className="text-[11.5px] text-fg-subtle">
                {`${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + pageRows.length} of ${rows.length}`}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-[6px]">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={cn(
                        'h-[28px] min-w-[28px] rounded-md px-[9px] text-[12px] font-medium',
                        i === safePage
                          ? 'bg-accent text-accent-fg'
                          : 'border border-border bg-card text-fg hover:bg-hover',
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
