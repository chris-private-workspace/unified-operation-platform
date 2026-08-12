import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Toast } from '@/components/ui/toast';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { CatalogImportPanel } from '@/components/catalog/catalog-import';
import { useCatalog } from '@/hooks/queries';
import { useUpdateCatalog } from '@/hooks/mutations';
import { apiPost } from '@/lib/api';
import { buildCatalogCsv } from '@/lib/catalog-export';
import type { CatalogSyncResult, SeatModel, SkuCatalog } from '@/lib/api-types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 8;

// Category → semantic tint (DS-8). Category is a free string; unknown → neutral.
function categoryTone(c: string | null): BadgeTone {
  switch ((c ?? '').toLowerCase()) {
    case 'base':
      return 'info';
    case 'add-on':
      return 'purple';
    case 'power platform':
      return 'ok';
    case 'voice':
      return 'warn';
    default:
      return 'neutral';
  }
}

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[13px] align-middle';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

// Curate alias / category / base-flag / seat model (CH-003, CH-026). skuId /
// part number / display name are system-owned (set by tenant sync), read-only.
function EditSkuDialog({
  sku,
  onClose,
  flash,
}: {
  sku: SkuCatalog;
  onClose: () => void;
  flash: (message: string, tone: 'ok' | 'danger') => void;
}) {
  const update = useUpdateCatalog();
  const [businessAlias, setBusinessAlias] = useState(sku.businessAlias ?? '');
  const [category, setCategory] = useState(sku.category ?? '');
  const [isBase, setIsBase] = useState(sku.isBaseLicense);
  const [seatModel, setSeatModel] = useState<SeatModel>(sku.seatModel);

  const submit = () => {
    update.mutate(
      {
        id: sku.id,
        body: { businessAlias, category, isBaseLicense: isBase, seatModel },
      },
      {
        onSuccess: () => {
          flash(`Updated ${sku.displayName}`, 'ok');
          onClose();
        },
        onError: (e) =>
          flash(
            e instanceof Error ? e.message : 'Could not update SKU',
            'danger',
          ),
      },
    );
  };

  return (
    <Dialog
      open
      title={`Edit ${sku.skuPartNumber}`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={update.isPending}
            onClick={submit}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        {/* system-owned identity — read-only (set by tenant sync) */}
        <div className="flex flex-col gap-[3px] rounded-md border border-border bg-hover px-[12px] py-[9px]">
          <span className="text-[13px] font-medium">{sku.displayName}</span>
          <span className="font-mono text-[11.5px] text-fg-subtle">
            {sku.skuPartNumber} · {sku.skuId}
          </span>
        </div>
        <Field label="Business alias">
          <Input
            value={businessAlias}
            placeholder="e.g. E3 Bundle (old Excel label)"
            onChange={(e) => setBusinessAlias(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Input
            value={category}
            placeholder="e.g. Base, Add-on, Power Platform"
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
        <Field label="License type">
          <SegmentedControl
            options={['Base', 'Add-on'] as const}
            value={isBase ? 'Base' : 'Add-on'}
            onChange={(v) => setIsBase(v === 'Base')}
          />
        </Field>
        {/* ADR-0032 D1 — curated, because whether a SKU is metered is something
            a human knows and the platform cannot infer. */}
        <Field label="Seat model">
          <SegmentedControl
            options={['Prepaid', 'Unlimited'] as const}
            value={seatModel === 'unlimited' ? 'Unlimited' : 'Prepaid'}
            onChange={(v) =>
              setSeatModel(v === 'Unlimited' ? 'unlimited' : 'prepaid')
            }
          />
        </Field>
        <p className="text-[11.5px] leading-[1.5] text-fg-subtle">
          Alias feeds allocation-import matching. Unlimited means the SKU has no
          purchased seat count — it is left out of the owned totals and skips
          the tenant seat check when assigning. Part number &amp; skuId are
          system-owned and can’t be edited.
        </p>
      </div>
    </Dialog>
  );
}

export function Catalog() {
  const catalog = useCatalog();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SkuCatalog | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  // Toast auto-dismisses (~2.6s, design-system.md §1.4). Timer id is local.
  function flash(message: string, tone: 'ok' | 'danger') {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  }

  const sync = useMutation({
    mutationFn: () => apiPost<CatalogSyncResult>('/license/catalog/sync'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['license', 'catalog'] });
      flash(
        `Catalog synced — ${res.created} new, ${res.updated} updated`,
        'ok',
      );
    },
    onError: () => flash('Catalog sync failed', 'danger'),
  });

  const rows = catalog.data ?? [];
  const lastSynced = useMemo(
    () =>
      (catalog.data ?? [])
        .map((r) => r.lastSyncedAt)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1) ?? null,
    [catalog.data],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  // CH-018 — the whole catalog in one file, because the table shows 8 rows at a
  // time with no search: finding which aliases exist for an allocation import
  // otherwise means paging through ~12 screens.
  const downloadCatalog = () => {
    const { csv, fileName, skuCount } = buildCatalogCsv(rows);
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    // "active" is stated on every export, not just documented once: the read
    // endpoint filters inactive SKUs out entirely (spec §2.4), so this file is
    // never the full catalog and nobody should have to remember that.
    flash(
      `Exported ${skuCount} active ${skuCount === 1 ? 'SKU' : 'SKUs'} to ${fileName}`,
      'ok',
    );
  };

  return (
    <div className="flex flex-col gap-[16px]">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-[16px]">
        <span className="text-[12.5px] text-fg-subtle">
          {catalog.data
            ? `${rows.length} ${rows.length === 1 ? 'SKU' : 'SKUs'} · synced from tenant ${formatDateTime(lastSynced)}`
            : ' '}
        </span>
        {/* Export / Import are `secondary`: this view's one primary stays Sync (H6). */}
        <div className="flex items-center gap-[10px]">
          <Button
            variant="secondary"
            size="md"
            disabled={rows.length === 0}
            onClick={downloadCatalog}
            icon={<Download size={15} strokeWidth={2} />}
          >
            Export CSV
          </Button>
          {/* CH-019 — the other half of the round trip. Hidden while open so the
              panel is the only way back out, and so its own Cancel is the single
              obvious exit. */}
          {!importing && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => setImporting(true)}
              icon={<Upload size={15} strokeWidth={2} />}
            >
              Import CSV
            </Button>
          )}
          {/* While the import panel is open it owns the view's single primary
              (its Preview / Apply); Sync steps down rather than competing (H6). */}
          <Button
            variant={importing ? 'secondary' : 'primary'}
            size="md"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
            icon={
              <RefreshCw
                size={15}
                strokeWidth={2}
                className={cn(sync.isPending && 'animate-spin')}
              />
            }
          >
            Sync catalog from tenant
          </Button>
        </div>
      </div>

      {/* Between toolbar and table: a hundred-row preview should not sit below
          eight rows of table you have to scroll past to reach it. */}
      {importing && (
        <CatalogImportPanel
          onClose={() => setImporting(false)}
          onCommitted={(message) => flash(message, 'ok')}
        />
      )}

      <Card padded={false}>
        {catalog.isLoading ? (
          <Loading />
        ) : catalog.isError ? (
          <LoadError description="Couldn't load the SKU catalog. Check the API is running, then retry." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>Display name</th>
                    <th className={TH}>Part number</th>
                    <th className={TH}>SkuId</th>
                    <th className={TH}>Alias</th>
                    <th className={TH}>Category</th>
                    <th className={TH}>Base</th>
                    <th className={TH}>Seats</th>
                    <th className={cn(TH, 'text-center')}>Active</th>
                    <th className={cn(TH, 'text-right')}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s: SkuCatalog) => (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className={cn(TD, 'font-medium')}>{s.displayName}</td>
                      <td className={cn(TD, 'font-mono text-[12px]')}>
                        {s.skuPartNumber}
                      </td>
                      <td
                        className={cn(
                          TD,
                          'font-mono text-[11.5px] text-fg-subtle',
                        )}
                      >
                        {s.skuId}
                      </td>
                      <td className={TD}>
                        {s.businessAlias ? (
                          <span className="text-fg-muted">
                            {s.businessAlias}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className={TD}>
                        {s.category ? (
                          <Badge tone={categoryTone(s.category)}>
                            {s.category}
                          </Badge>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className={TD}>
                        {s.isBaseLicense ? (
                          <Badge tone="info">BASE</Badge>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      {/* Both values are real answers, so neither gets an
                          em-dash: "—" means "no answer" everywhere else in
                          this table (ADR-0032 D3 makes the same point about
                          Unalloc. on the Platform view). */}
                      <td className={TD}>
                        {s.seatModel === 'unlimited' ? (
                          <Badge tone="neutral">UNLIMITED</Badge>
                        ) : (
                          <span className="text-fg-subtle">Prepaid</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-center')}>
                        <span
                          title={s.active ? 'Active' : 'Inactive'}
                          className={cn(
                            'inline-block h-[8px] w-[8px] rounded-full',
                            s.active ? 'bg-ok' : 'bg-neutral',
                          )}
                        />
                      </td>
                      <td className={cn(TD, 'text-right')}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditing(s)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* footer: range + note + pager */}
            <div className="flex items-center justify-between gap-[12px] border-t border-border px-[16px] py-[11px]">
              <span className="text-[11.5px] text-fg-subtle">
                {rows.length === 0
                  ? 'No SKUs'
                  : `${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + pageRows.length} of ${rows.length}`}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-[6px]">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                    icon={<ChevronLeft size={14} strokeWidth={2} />}
                    aria-label="Previous page"
                  />
                  {Array.from({ length: pageCount }, (_, i) => (
                    <Button
                      key={i}
                      variant={i === safePage ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setPage(i)}
                    >
                      {i + 1}
                    </Button>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                    icon={<ChevronRight size={14} strokeWidth={2} />}
                    aria-label="Next page"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <p className="flex items-start gap-[7px] text-[11.5px] leading-[1.5] text-fg-subtle">
        <Info size={13} strokeWidth={2} className="mt-[2px] shrink-0" />
        <span>
          Part number &amp; skuId are system-owned. Only alias, category and
          base-flag are editable. Export CSV gives you every{' '}
          <span className="font-medium">active</span> SKU; edit those three
          columns and Import CSV applies them in one pass, matching on skuId.
          Deactivated SKUs are not listed here at all, so they can be neither
          exported nor imported.
        </span>
      </p>

      {editing && (
        <EditSkuDialog
          sku={editing}
          onClose={() => setEditing(null)}
          flash={flash}
        />
      )}

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}
