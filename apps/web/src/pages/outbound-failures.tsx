import { Fragment, useState } from 'react';
import { CheckCircle2, ChevronDown, ShieldAlert, Undo2 } from 'lucide-react';
import { useOutboundFailures } from '@/hooks/queries';
import { useRepairFailure } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import {
  attemptText,
  FAILURE_KINDS,
  FAILURE_STATUSES,
  failureKindMeta,
  failureStatusLabel,
  failureStatusTone,
  repairAction,
} from '@/lib/outbound-failures';
import { formatDateTime } from '@/lib/format';
import type { OutboundFailure } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const TH =
  'px-[18px] py-[11px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';

/**
 * Delivery failures (W31 F4 / ADR-0011). An operations work queue: outbound
 * deliveries that failed, and the one repair that is correct for each.
 *
 * ADMIN + REGIONAL at the backend (D4). A direct URL open by anyone else
 * degrades to a restricted state — unlike the Overview feed (CH-005), which
 * hides entirely, because this is a screen you navigate to on purpose and
 * deserves an explanation rather than silence.
 *
 * No view-level primary action: every repair is a per-row secondary, since the
 * page's job is to show a queue, not to push one action (DS-3).
 */
export function OutboundFailures() {
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, error } = useOutboundFailures({
    ...(status && { status }),
    ...(kind && { kind }),
    limit: PAGE_SIZE,
    offset,
  });
  const repair = useRepairFailure();

  const entries = data?.entries ?? [];
  const forbidden = error instanceof ApiError && error.status === 403;

  const applyFilter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setOffset(0);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center justify-between gap-[14px] p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[15px] font-semibold tracking-[-.02em]">
            Delivery failures
          </h1>
          <p className="text-[12.5px] text-fg-muted">
            Outbound deliveries that did not complete, and the repair that is
            safe for each.
          </p>
        </div>
        <div className="flex items-center gap-[8px]">
          <div className="w-[170px]">
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => applyFilter(setStatus)(e.target.value)}
            >
              <option value="">All statuses</option>
              {FAILURE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {failureStatusLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[190px]">
            <Select
              aria-label="Filter by kind"
              value={kind}
              onChange={(e) => applyFilter(setKind)(e.target.value)}
            >
              <option value="">All kinds</option>
              {FAILURE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {failureKindMeta(k).label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {repair.isError && (
        <Card className="p-[14px]">
          <span className="text-[12.5px] text-danger">
            {(repair.error as Error)?.message ?? 'The repair failed.'}
          </span>
        </Card>
      )}

      {isLoading && <Loading label="Loading delivery failures…" />}
      {isError && forbidden && (
        <Card className="p-0">
          <EmptyState
            icon={<ShieldAlert size={18} strokeWidth={2} />}
            title="Access required"
            description="Repairing a delivery can create a ticket or write to ServiceNow, so this queue is limited to platform and regional administrators."
          />
        </Card>
      )}
      {isError && !forbidden && <LoadError />}

      {!isLoading && !isError && entries.length === 0 && (
        <Card className="p-0">
          <EmptyState
            tone="ok"
            icon={<CheckCircle2 size={18} strokeWidth={2} />}
            title="Nothing to repair"
            description={
              status || kind
                ? 'Nothing matches the current filters.'
                : 'Every outbound delivery has completed. Failures appear here if one does not.'
            }
          />
        </Card>
      )}

      {entries.length > 0 && (
        <Card className="overflow-hidden p-0">
          {/*
            The repair column carries a full sentence ("Submit to ServiceNow"),
            which overflows the card on a narrow viewport and puts the button
            out of reach. Scroll the table rather than truncate the label — the
            label is load-bearing here (ADR-0011 D3).
          */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-panel">
                  <th className={TH}>What failed</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Attempts</th>
                  <th className={TH}>Last attempt</th>
                  <th className={cn(TH, 'text-right')}>Repair</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <FailureRow
                    key={entry.id}
                    entry={entry}
                    busy={repair.isPending}
                    onAction={(action) =>
                      repair.mutate({ id: entry.id, action })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FailureRow({
  entry,
  busy,
  onAction,
}: {
  entry: OutboundFailure;
  busy: boolean;
  onAction: (action: 'retry' | 'abandon' | 'reopen') => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = failureKindMeta(entry.kind);
  const action = repairAction(entry.kind);
  const isOpen = entry.status === 'open';
  const isAbandoned = entry.status === 'abandoned';

  return (
    <Fragment>
      <tr className="border-b border-border last:border-0 hover:bg-hover">
        <td className="px-[18px] py-[11px]">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex cursor-pointer items-center gap-[8px] text-left"
          >
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={cn(
                'text-fg-subtle transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </button>
        </td>
        <td className="px-[18px] py-[11px]">
          <Badge tone={failureStatusTone(entry.status)}>
            {failureStatusLabel(entry.status)}
          </Badge>
        </td>
        <td className="px-[18px] py-[11px] font-mono text-[12px] text-fg-muted">
          {attemptText(entry.attemptCount)}
        </td>
        <td className="px-[18px] py-[11px] font-mono text-[12px] text-fg-muted">
          {formatDateTime(entry.lastAttemptAt)}
        </td>
        <td className="px-[18px] py-[11px]">
          <div className="flex items-center justify-end gap-[6px]">
            {isOpen && (
              <>
                {/*
                  Label comes from repairAction(kind), never a generic "Retry":
                  a request.mirror repair writes local rows only and must not
                  read as if it contacts ServiceNow (ADR-0011 D3).
                */}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onAction('retry')}
                >
                  {action.label}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onAction('abandon')}
                >
                  Abandon
                </Button>
              </>
            )}
            {isAbandoned && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onAction('reopen')}
              >
                <Undo2 size={14} strokeWidth={2} />
                Reopen
              </Button>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={5} className="bg-panel px-[18px] py-[12px]">
            <div className="flex flex-col gap-[10px]">
              <p className="text-[12.5px] leading-[1.5] text-fg-muted">
                {meta.detail}
              </p>
              {/* What pressing the button will actually do. */}
              <p className="text-[12px] leading-[1.5] text-fg-subtle">
                <span className="font-semibold">{action.label}:</span>{' '}
                {action.hint}
              </p>
              <div className="flex flex-wrap gap-[24px]">
                <DetailBlock label="Error" value={entry.lastError} />
                <DetailBlock label="Payload" value={entry.payload} />
                {entry.externalRef && (
                  <DetailBlock
                    label="Already in ServiceNow"
                    value={entry.externalRef}
                  />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex min-w-[180px] flex-col gap-[4px]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle">
        {label}
      </span>
      <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.5] text-fg-muted">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
