import { Fragment, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  ShieldAlert,
} from 'lucide-react';
import { useAuditLog } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_TARGET_TYPE_OPTIONS,
  auditActionTone,
} from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50; // backend default; hard cap is 100 (audit-query.dto)

const TH =
  'px-[18px] py-[11px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';

/**
 * Audit log (W29 F4 / ADR-0009). Read-only by design — the trail is written by
 * the backend inside the audited transactions, so there is nothing to do here
 * but look: the view carries NO primary action (DS-3 trivially satisfied).
 * ADMIN-only at the backend (P-B: rows carry whitelisted PII); the sidebar hides
 * the entry for other roles, and a direct URL open degrades to a restricted
 * state — the backend 403 is the real authority.
 */
export function Audit() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, error } = useAuditLog({
    ...(action && { action }),
    ...(targetType && { targetType }),
    limit: PAGE_SIZE,
    offset,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const forbidden = error instanceof ApiError && error.status === 403;

  // Any filter change restarts from the first page — a stale offset against a
  // narrower result set would show an empty page below real rows.
  const applyFilter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setOffset(0);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {/* header + filters — read-only view, no primary action */}
      <Card className="flex flex-wrap items-center justify-between gap-[14px] p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[15px] font-semibold tracking-[-.02em]">
            Audit log
          </h1>
          <p className="text-[12.5px] text-fg-muted">
            Who changed what, across the platform.{' '}
            <span className="font-mono">{total}</span>{' '}
            {total === 1 ? 'event' : 'events'}
          </p>
        </div>
        <div className="flex items-center gap-[8px]">
          <div className="w-[190px]">
            <Select
              aria-label="Filter by action"
              value={action}
              onChange={(e) => applyFilter(setAction)(e.target.value)}
            >
              <option value="">All actions</option>
              {AUDIT_ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[170px]">
            <Select
              aria-label="Filter by target type"
              value={targetType}
              onChange={(e) => applyFilter(setTargetType)(e.target.value)}
            >
              <option value="">All targets</option>
              {AUDIT_TARGET_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* query states */}
      {isLoading && <Loading label="Loading audit trail…" />}
      {isError && forbidden && (
        <Card className="p-0">
          <EmptyState
            icon={<ShieldAlert size={18} strokeWidth={2} />}
            title="Access required"
            description="The audit trail records account and configuration changes, so it is limited to platform admins."
          />
        </Card>
      )}
      {isError && !forbidden && <LoadError />}

      {/* empty */}
      {!isLoading && !isError && entries.length === 0 && (
        <Card className="p-0">
          <EmptyState
            icon={<ScrollText size={18} strokeWidth={2} />}
            title="No audit events"
            description={
              action || targetType
                ? 'Nothing matches the current filters.'
                : 'Recorded events will appear here as changes are made.'
            }
          />
        </Card>
      )}

      {/* trail */}
      {entries.length > 0 && (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-panel">
                <th className={TH}>Time</th>
                <th className={TH}>Action</th>
                <th className={TH}>Target</th>
                <th className={TH}>Actor</th>
                <th className={cn(TH, 'w-[36px]')} aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>

          {/* pagination footer */}
          <div className="flex items-center justify-between border-t border-border px-[18px] py-[10px]">
            <span className="font-mono text-[11.5px] text-fg-subtle">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-[6px]">
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft size={14} />
                Newer
              </Button>
              <Button
                variant="secondary"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Older
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.before || entry.after || entry.metadata);

  return (
    <Fragment>
      <tr
        className={cn(
          'border-b border-border last:border-0 hover:bg-hover',
          hasDetail && 'cursor-pointer',
        )}
        onClick={hasDetail ? () => setOpen((o) => !o) : undefined}
      >
        <td className="px-[18px] py-[11px] font-mono text-[12px] text-fg-muted">
          {formatDateTime(entry.createdAt)}
        </td>
        <td className="px-[18px] py-[11px]">
          <Badge tone={auditActionTone(entry.action)} className="font-mono">
            {entry.action}
          </Badge>
        </td>
        <td className="px-[18px] py-[11px]">
          <div className="flex flex-col gap-[1px]">
            <span className="text-[12.5px]">{entry.targetType}</span>
            <span className="font-mono text-[11px] text-fg-subtle">
              {entry.targetId}
            </span>
          </div>
        </td>
        <td className="px-[18px] py-[11px]">
          {entry.actor ? (
            <div className="flex flex-col gap-[1px]">
              <span className="text-[12.5px]">{entry.actor.displayName}</span>
              <span className="font-mono text-[11px] text-fg-subtle">
                {entry.actor.email}
              </span>
            </div>
          ) : (
            <Badge tone="neutral">{entry.actorType}</Badge>
          )}
        </td>
        <td className="px-[18px] py-[11px] text-right">
          {hasDetail && (
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={cn(
                'text-fg-subtle transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={5} className="bg-panel px-[18px] py-[12px]">
            <div className="flex flex-wrap gap-[24px]">
              <DetailBlock label="Before" value={entry.before} />
              <DetailBlock label="After" value={entry.after} />
              <DetailBlock label="Metadata" value={entry.metadata} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  if (!value) return null;
  return (
    <div className="flex min-w-[180px] flex-col gap-[4px]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle">
        {label}
      </span>
      <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.5] text-fg-muted">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
