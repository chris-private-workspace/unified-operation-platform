import { useMemo, useState } from 'react';
import {
  Check,
  Gauge,
  Info,
  KeyRound,
  Layers,
  Pencil,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { Toast } from '@/components/ui/toast';
import { useLedger, useLedgerStats } from '@/hooks/queries';
import { useUpdateLedger } from '@/hooks/mutations';
import {
  assetStatus,
  distinctOpcos,
  evaluateLedgerDraft,
  initLedgerDraft,
  utilizationPct,
  type LedgerEditDraft,
} from '@/lib/ledger';
import type { LedgerRow } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[12px] align-middle';
const NUM_INPUT =
  'ml-auto h-[30px] w-[72px] rounded-md border border-border bg-card px-[8px] text-right font-mono text-[12.5px] text-fg outline-none focus:border-border-strong';

// Data-driven utilization bar: assigned-of-allocated. The width % is DATA (not a
// hardcoded design value), so an inline style is correct here — the prototype's
// bar does the same. Over-allocated rows go danger + full width.
function UtilBar({ row }: { row: LedgerRow }) {
  const pct = utilizationPct(row);
  return (
    <div className="flex items-center gap-[8px]">
      <div className="h-[5px] w-[80px] shrink-0 overflow-hidden rounded-pill bg-hover">
        <div
          className={cn(
            'h-full rounded-pill',
            row.overAllocated ? 'bg-danger' : 'bg-info',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-[34px] font-mono text-[11.5px] text-fg-muted">
        {row.allocatedQuantity > 0 ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

/**
 * One ledger row — read-only display, or the inline edit form (Row edit mode,
 * W23-B / ADR-0007). In edit mode Allocated/Assigned become number inputs, the
 * derived Available/Utilization/Status show '—' (recomputed from the server on
 * save, never front-invented), and Save/Cancel replace the ✎ action.
 */
function LedgerTableRow({
  row,
  editing,
  draft,
  setDraft,
  onEdit,
  onCancel,
  onSave,
  saving,
}: {
  row: LedgerRow;
  editing: boolean;
  draft: LedgerEditDraft;
  setDraft: (d: LedgerEditDraft) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  if (!editing) {
    const status = assetStatus(row);
    return (
      <tr className="border-b border-border last:border-0 hover:bg-hover">
        <td className={cn(TD, 'font-mono text-[12px]')}>{row.opco.code}</td>
        <td className={TD}>
          <div className="flex flex-col leading-[1.3]">
            <span className="font-medium">{row.sku.displayName}</span>
            <span className="font-mono text-[11px] text-fg-subtle">
              {row.sku.skuPartNumber}
            </span>
          </div>
        </td>
        <td className={cn(TD, 'text-right font-mono text-[12.5px]')}>
          {row.allocatedQuantity}
        </td>
        <td className={cn(TD, 'text-right font-mono text-[12.5px] text-info')}>
          {row.assignedQuantity}
        </td>
        <td
          className={cn(
            TD,
            'text-right font-mono text-[12.5px]',
            row.headroom < 0 ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {row.headroom}
        </td>
        <td className={TD}>
          <UtilBar row={row} />
        </td>
        <td className={cn(TD, 'text-center')}>
          <Badge tone={status.tone}>{status.label}</Badge>
        </td>
        <td className={cn(TD, 'text-right')}>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${row.opco.code} ${row.sku.skuPartNumber}`}
            className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            <Pencil size={14} strokeWidth={2} />
          </button>
        </td>
      </tr>
    );
  }

  const evaln = evaluateLedgerDraft(draft, row);
  const canSave = evaln.ok && !saving;
  const invalid = !evaln.ok && evaln.reason === 'invalid';

  return (
    <tr className="border-b border-border bg-panel last:border-0">
      <td className={cn(TD, 'font-mono text-[12px]')}>{row.opco.code}</td>
      <td className={TD}>
        <div className="flex flex-col gap-[6px]">
          <div className="flex flex-col leading-[1.3]">
            <span className="font-medium">{row.sku.displayName}</span>
            <span className="font-mono text-[11px] text-fg-subtle">
              {row.sku.skuPartNumber}
            </span>
          </div>
          <input
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            placeholder="Reason (optional)"
            maxLength={500}
            className="h-[28px] w-full max-w-[240px] rounded-md border border-border bg-card px-[8px] text-[11.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-border-strong"
          />
        </div>
      </td>
      <td className={cn(TD, 'text-right')}>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={draft.allocatedQuantity}
          onChange={(e) =>
            setDraft({ ...draft, allocatedQuantity: e.target.value })
          }
          aria-label="Allocated"
          className={NUM_INPUT}
        />
      </td>
      <td className={cn(TD, 'text-right')}>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={draft.assignedQuantity}
          onChange={(e) =>
            setDraft({ ...draft, assignedQuantity: e.target.value })
          }
          aria-label="Assigned"
          className={NUM_INPUT}
        />
      </td>
      <td className={cn(TD, 'text-right font-mono text-[12px] text-fg-subtle')}>
        —
      </td>
      <td className={cn(TD, 'text-[11px]')}>
        <span className={invalid ? 'text-danger' : 'text-fg-subtle'}>
          {invalid ? 'Enter 0 or more' : 'Recalculated on save'}
        </span>
      </td>
      <td
        className={cn(TD, 'text-center font-mono text-[12px] text-fg-subtle')}
      >
        —
      </td>
      <td className={cn(TD, 'text-right')}>
        <div className="flex items-center justify-end gap-[6px]">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            icon={<X size={13} strokeWidth={2} />}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={!canSave}
            icon={<Check size={13} strokeWidth={2.2} />}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** By-OpCo assets view (W15) — per-(OpCo,SKU) ledger rows, opco-scoped by the API.
 *  Inline manual edit of allocated/assigned (W23-B / ADR-0007). */
export function ByOpcoView() {
  const ledger = useLedger();
  const stats = useLedgerStats();
  const update = useUpdateLedger();
  const [opco, setOpco] = useState<string>('all'); // OpCo code, or 'all'
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  // Row edit mode: one row at a time. draft holds the controlled input strings.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LedgerEditDraft>({
    allocatedQuantity: '',
    assignedQuantity: '',
    reason: '',
  });
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);
  function flash(message: string, tone: 'ok' | 'danger') {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  }

  const rows = ledger.data ?? [];
  // Depend on ledger.data (not `rows`): `?? []` makes a fresh array each render,
  // which would thrash the memo deps (matches the requests.tsx pattern).
  const opcos = useMemo(() => distinctOpcos(ledger.data ?? []), [ledger.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (ledger.data ?? []).filter((r) => {
      if (opco !== 'all' && r.opco.code !== opco) return false;
      if (!needle) return true;
      return (
        r.sku.displayName.toLowerCase().includes(needle) ||
        r.sku.skuPartNumber.toLowerCase().includes(needle)
      );
    });
  }, [ledger.data, opco, q]);

  // In-table grand total (prototype): sum of the CURRENTLY FILTERED rows — real
  // server data aggregated, not invented (H7). Respects the OpCo/search filter;
  // matches the /ledger/stats totals when nothing is filtered.
  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          allocated: acc.allocated + r.allocatedQuantity,
          assigned: acc.assigned + r.assignedQuantity,
          headroom: acc.headroom + r.headroom,
        }),
        { allocated: 0, assigned: 0, headroom: 0 },
      ),
    [filtered],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  // KPI value: never invent a number — '—' while loading / on error (honest-data).
  const kpi = (n: number): string =>
    stats.isLoading || stats.isError ? '—' : String(n);
  const overCount = stats.data?.overAllocatedCount ?? 0;

  function pickOpco(code: string) {
    setOpco(code);
    setPage(0);
    setEditingId(null);
  }

  function startEdit(row: LedgerRow) {
    setEditingId(row.id);
    setDraft(initLedgerDraft(row));
  }

  function saveEdit(row: LedgerRow) {
    const evaln = evaluateLedgerDraft(draft, row);
    if (!evaln.ok) return; // Save is disabled in this state anyway
    update.mutate(
      { id: row.id, body: evaln.body },
      {
        onSuccess: () => {
          flash(`Updated ${row.opco.code} · ${row.sku.skuPartNumber}`, 'ok');
          setEditingId(null);
        },
        onError: (err) => flash((err as Error).message, 'danger'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Stats strip — Owned (tenant total) lives in the Platform view. */}
      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
        <StatCard
          label="Allocated to OpCos"
          value={kpi(stats.data?.totalAllocated ?? 0)}
          tone="info"
          icon={<Layers size={16} strokeWidth={2} />}
          sub={
            stats.data
              ? `${stats.data.skusTracked} SKUs · ${stats.data.opcosTracked} OpCos tracked`
              : ' '
          }
        />
        <StatCard
          label="Assigned to users"
          value={kpi(stats.data?.totalAssigned ?? 0)}
          tone="ok"
          icon={<KeyRound size={16} strokeWidth={2} />}
          sub="in active use"
        />
        <StatCard
          label="Headroom"
          value={kpi(stats.data?.totalHeadroom ?? 0)}
          tone="neutral"
          icon={<Gauge size={16} strokeWidth={2} />}
          sub="allocated − assigned"
        />
      </div>

      {/* Toolbar: OpCo filter pills + SKU search. */}
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <div className="flex flex-wrap items-center gap-[6px]">
          {[{ code: 'all', displayName: 'All OpCos' }, ...opcos].map((o) => {
            const active = opco === o.code;
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => pickOpco(o.code)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-[6px] rounded-pill px-[12px] py-[6px] text-[12.5px] transition-colors',
                  active
                    ? 'bg-fg font-semibold text-bg'
                    : 'font-medium text-fg-muted hover:bg-hover',
                )}
              >
                {o.code === 'all' ? o.displayName : o.code}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Filter SKU…"
            className="h-[32px] w-[190px] rounded-lg border border-border bg-card pl-[30px] pr-[10px] text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-border-strong"
          />
        </div>
      </div>

      <Card
        padded={false}
        title="Ledger by OpCo & SKU"
        subtitle="Owned budget per OpCo vs assigned to users"
        action={
          overCount > 0 ? (
            <Badge tone="danger">
              <TriangleAlert size={12} strokeWidth={2.4} />
              {overCount} {overCount === 1 ? 'SKU' : 'SKUs'} over-allocated
            </Badge>
          ) : undefined
        }
      >
        {ledger.isLoading ? (
          <Loading />
        ) : ledger.isError ? (
          <LoadError description="Couldn't load the ledger. Check the API is running, then retry." />
        ) : rows.length === 0 ? (
          <EmptyState
            tone="neutral"
            icon={<Layers size={18} strokeWidth={2} />}
            title="No allocations tracked yet"
            description="Once OpCo allocations are imported (Settings › Integrations → Import), each OpCo's SKUs appear here."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            tone="ok"
            icon={<Search size={18} strokeWidth={2} />}
            title="Nothing here"
            description="No ledger rows match this filter."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>OpCo</th>
                    <th className={TH}>SKU</th>
                    <th className={cn(TH, 'text-right')}>Allocated</th>
                    <th className={cn(TH, 'text-right')}>Assigned</th>
                    <th className={cn(TH, 'text-right')}>Available</th>
                    <th className={TH}>Utilization</th>
                    <th className={cn(TH, 'text-center')}>Status</th>
                    <th className={cn(TH, 'text-right')}>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Grand total across the filtered ledger (sum of shown rows). */}
                  <tr className="border-b-2 border-border-strong bg-hover">
                    <td
                      colSpan={2}
                      className={cn(
                        TD,
                        'text-[11px] font-bold uppercase tracking-[.04em]',
                      )}
                    >
                      All SKUs · total
                    </td>
                    <td
                      className={cn(
                        TD,
                        'text-right font-mono text-[12.5px] font-bold',
                      )}
                    >
                      {totals.allocated}
                    </td>
                    <td
                      className={cn(
                        TD,
                        'text-right font-mono text-[12.5px] font-bold text-info',
                      )}
                    >
                      {totals.assigned}
                    </td>
                    <td
                      className={cn(
                        TD,
                        'text-right font-mono text-[12.5px] font-bold',
                        totals.headroom < 0 ? 'text-danger' : 'text-fg-muted',
                      )}
                    >
                      {totals.headroom}
                    </td>
                    <td className={TD} />
                    <td className={TD} />
                    <td className={TD} />
                  </tr>
                  {pageRows.map((r) => (
                    <LedgerTableRow
                      key={r.id}
                      row={r}
                      editing={editingId === r.id}
                      draft={draft}
                      setDraft={setDraft}
                      onEdit={() => startEdit(r)}
                      onCancel={() => setEditingId(null)}
                      onSave={() => saveEdit(r)}
                      saving={update.isPending && editingId === r.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-[12px] border-t border-border px-[16px] py-[11px]">
              <span className="text-[11.5px] text-fg-subtle">
                {`${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + pageRows.length} of ${filtered.length}`}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-[6px]">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPage(i);
                        setEditingId(null);
                      }}
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

      {/* Honest scope note (H7): what this view does and does not show. */}
      <p className="flex items-start gap-[7px] text-[11.5px] leading-[1.5] text-fg-subtle">
        <Info size={13} strokeWidth={2} className="mt-[2px] shrink-0" />
        <span>
          Allocations import in bulk from Settings › Integrations → Import; edit
          a row here to correct a single OpCo. The tenant-level owned /
          unallocated view is under Platform.
        </span>
      </p>

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}
