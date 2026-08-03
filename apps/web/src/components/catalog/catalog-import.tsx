import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCatalogImport } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import type {
  CatalogImportChange,
  CatalogImportErrorDetail,
  CatalogImportResult,
} from '@/lib/api-types';
import { cn } from '@/lib/utils';

const MAX_ROWS = 60; // preview cap — the remainder is counted, never hidden silently
const MAX_LIST = 10;

// Bulk SKU curation (CH-019 / ADR-0023). The operator downloads the catalog
// export, edits alias / category / base in a spreadsheet and uploads it back;
// this panel previews the server's dry-run before an explicit commit.
//
// An inline panel rather than a Dialog on purpose: Dialog's body has no
// max-height and its wrapper is overflow-hidden (dialog.tsx:47,60), so a
// hundred-row preview would be clipped. Widening a shared primitive for one
// screen is the wrong trade — this follows the allocation import panel instead.
//
// Two things this file must never do: decide whether a collision is acceptable,
// or commit a clear on the operator's behalf. Both gates live in the backend
// (ADR-0023 D5 / D6); the panel's whole job is to make them legible.
export function CatalogImportPanel({
  onClose,
  onCommitted,
}: {
  onClose: () => void;
  onCommitted: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [confirmClears, setConfirmClears] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const imp = useCatalogImport();

  // A new file invalidates everything the previous one produced — leaving a
  // stale preview on screen next to a new filename is how you commit the wrong
  // file. Confirmation resets too: it was given for a different set of clears.
  const resetForNewFile = () => {
    setPreview(null);
    setConfirmClears(false);
    setError(null);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    resetForNewFile();
  };

  const run = (dryRun: boolean) => {
    if (!csv) return;
    setError(null);
    imp.mutate(
      { csv, dryRun, ...(dryRun ? {} : { confirmClears }) },
      {
        onSuccess: (res) => {
          if (res.dryRun) {
            setPreview(res);
            return;
          }
          onCommitted(
            `Updated ${res.committed} ${res.committed === 1 ? 'SKU' : 'SKUs'}`,
          );
          onClose();
        },
        onError: (err) =>
          setError(
            err instanceof ApiError
              ? err
              : new ApiError(0, 'Import failed — check the API is running.'),
          ),
      },
    );
  };

  const clears = preview?.summary.aliasClears ?? 0;
  const blockedByClears = clears > 0 && !confirmClears;

  return (
    <div className="rounded-[12px] border border-border bg-card p-[18px]">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onPick}
        className="hidden"
      />

      <div className="flex items-start justify-between gap-[16px]">
        <div>
          <h3 className="text-[13px] font-semibold text-fg">
            Bulk curation import
          </h3>
          <p className="mt-[6px] text-[11.5px] leading-[1.5] text-fg-subtle">
            Export the catalog, edit{' '}
            <span className="text-fg-muted">Business alias</span>,{' '}
            <span className="text-fg-muted">Category</span> and{' '}
            <span className="text-fg-muted">Base licence</span> in a
            spreadsheet, then upload it back. SKUs are matched on{' '}
            <span className="font-mono text-[11px] text-fg-muted">SkuId</span> —
            other columns are ignored, and no SKU is ever created. You’ll
            preview every change before anything is written.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close import"
          className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-hover"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="mt-[14px] flex flex-wrap items-center gap-[12px]">
        <Button
          variant="secondary"
          icon={<Upload size={15} strokeWidth={2} />}
          onClick={() => fileRef.current?.click()}
        >
          {fileName ? 'Choose a different file' : 'Choose CSV file'}
        </Button>
        {fileName && (
          <span className="flex items-center gap-[6px] text-[12px] text-fg-muted">
            <FileText size={14} strokeWidth={2} className="text-fg-subtle" />
            <span className="font-mono text-[11.5px]">{fileName}</span>
          </span>
        )}
        {csv && !preview && (
          <Button
            variant="primary"
            icon={<ArrowRight size={15} strokeWidth={2} />}
            onClick={() => run(true)}
            disabled={imp.isPending}
          >
            {imp.isPending ? 'Previewing…' : 'Preview import'}
          </Button>
        )}
      </div>

      {error && <ImportError error={error} />}

      {preview && (
        <>
          <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
            <Chip label="rows read" value={preview.summary.rows} />
            <Chip label="SKUs matched" value={preview.summary.matched} />
            <Chip label="changes" value={preview.summary.changes} accent />
            {preview.skippedSkuIds.length > 0 && (
              <Chip label="skipped" value={preview.skippedSkuIds.length} />
            )}
          </div>

          {preview.summary.changes === 0 ? (
            <p className="mt-[14px] text-[12px] text-fg-muted">
              No changes — the catalog already matches this file.
            </p>
          ) : (
            <ChangeTable
              rows={preview.changes.filter((c) => !c.clearsAlias)}
              title="Changes"
            />
          )}

          {clears > 0 && (
            <ClearsSection
              rows={preview.changes.filter((c) => c.clearsAlias)}
              confirmed={confirmClears}
              onToggle={setConfirmClears}
            />
          )}

          {preview.skippedSkuIds.length > 0 && (
            <Note
              title={`${preview.skippedSkuIds.length} row${preview.skippedSkuIds.length === 1 ? '' : 's'} skipped — no active SKU with that SkuId`}
              items={preview.skippedSkuIds}
              mono
            />
          )}

          {preview.unknownColumns.length > 0 && (
            <p className="mt-[10px] text-[11.5px] leading-[1.5] text-fg-subtle">
              Ignored columns (system-owned):{' '}
              <span className="font-mono text-[11px]">
                {preview.unknownColumns.join(', ')}
              </span>
            </p>
          )}

          <div className="mt-[18px] flex items-center gap-[10px]">
            <Button
              variant="primary"
              icon={<Check size={15} strokeWidth={2} />}
              onClick={() => run(false)}
              disabled={
                imp.isPending ||
                preview.summary.changes === 0 ||
                blockedByClears
              }
            >
              {imp.isPending
                ? 'Applying…'
                : `Apply ${preview.summary.changes} change${preview.summary.changes === 1 ? '' : 's'}`}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={imp.isPending}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Same cell metrics as the allocation import's preview table — two preview
// tables in the same console must not drift apart (DS-11).
const TH =
  'px-[16px] py-[9px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[10px] align-top';

function ChangeTable({
  rows,
  title,
}: {
  rows: CatalogImportChange[];
  title: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-[16px]">
      <div className="mb-[7px] text-[11.5px] font-medium text-fg-muted">
        {title}
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>SKU</th>
              <th className={TH}>Field</th>
              <th className={TH}>Before</th>
              <th className={TH}>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).flatMap((row) =>
              fieldsOf(row).map(([field, before, after], i) => (
                <tr
                  key={`${row.skuId}:${field}`}
                  className="border-b border-border last:border-0"
                >
                  <td className={TD}>
                    {i === 0 && (
                      <>
                        <div className="text-[12.5px] text-fg">
                          {row.displayName}
                        </div>
                        <div className="font-mono text-[11px] text-fg-subtle">
                          {row.skuPartNumber}
                        </div>
                      </>
                    )}
                  </td>
                  <td className={cn(TD, 'text-[12px] text-fg-muted')}>
                    {field}
                  </td>
                  <td className={cn(TD, 'text-[12px] text-fg-subtle')}>
                    {before}
                  </td>
                  <td className={cn(TD, 'text-[12px] text-fg')}>{after}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {rows.length > MAX_ROWS && (
          <div className="border-t border-border px-[16px] py-[9px] text-[11.5px] text-fg-subtle">
            +{rows.length - MAX_ROWS} more not shown — all will be applied.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Clearing an alias is separated out because its consequence is the one thing
 * this screen cannot show: the SKU leaves import scope, but whatever allocation
 * it already has stays in the ledger, frozen, and every later import skips it.
 */
function ClearsSection({
  rows,
  confirmed,
  onToggle,
}: {
  rows: CatalogImportChange[];
  confirmed: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="mt-[16px] rounded-[10px] border border-border bg-hover p-[12px]">
      <div className="flex items-center gap-[7px] text-[12px] font-medium text-fg">
        <AlertTriangle size={14} strokeWidth={2} className="text-warn" />
        {rows.length} business {rows.length === 1 ? 'alias' : 'aliases'} will be
        cleared
      </div>
      <p className="mt-[7px] text-[11.5px] leading-[1.5] text-fg-muted">
        Those SKUs leave allocation-import scope: future imports will skip them.
        Their existing allocated quantity is{' '}
        <span className="font-medium">not</span> removed — it stays in the
        ledger at its current value and nothing will update it again.
      </p>
      <div className="mt-[9px] flex flex-col gap-[3px]">
        {rows.slice(0, MAX_LIST).map((r) => (
          <span key={r.skuId} className="text-[11.5px] text-fg-muted">
            <span className="font-mono text-[11px]">{r.skuPartNumber}</span>
            {' — was '}
            <span className="font-mono text-[11px]">{r.alias?.before}</span>
          </span>
        ))}
        {rows.length > MAX_LIST && (
          <span className="text-[11.5px] text-fg-subtle">
            +{rows.length - MAX_LIST} more
          </span>
        )}
      </div>
      <div className="mt-[14px]">
        <Checkbox
          checked={confirmed}
          onChange={(e) => onToggle(e.target.checked)}
          label="I understand these SKUs will stop being imported"
        />
      </div>
    </div>
  );
}

/**
 * A 400 here is usually a refusal with a list attached, not a sentence: which
 * aliases clash, which SkuIds repeat. Toasting the message alone would leave the
 * operator with a file they cannot fix.
 */
function ImportError({ error }: { error: ApiError }) {
  const detail = (error.detail ?? {}) as CatalogImportErrorDetail;
  return (
    <div className="mt-[14px] rounded-[10px] border border-border bg-hover p-[12px]">
      <div className="flex items-start gap-[7px] text-[12px] font-medium text-fg">
        <AlertTriangle
          size={14}
          strokeWidth={2}
          className="mt-[2px] shrink-0 text-danger"
        />
        <span>{error.message}</span>
      </div>
      {detail.collisions && (
        <div className="mt-[9px] flex flex-col gap-[3px]">
          {detail.collisions.map((c) => (
            <span key={c.alias} className="text-[11.5px] text-fg-muted">
              <span className="font-mono text-[11px]">{c.alias}</span>
              {' → '}
              <span className="font-mono text-[11px]">
                {c.skuPartNumbers.join(', ')}
              </span>
            </span>
          ))}
        </div>
      )}
      {detail.duplicateSkuIds && <ItemList items={detail.duplicateSkuIds} />}
      {detail.duplicateColumns && <ItemList items={detail.duplicateColumns} />}
      {detail.invalidBaseValues && (
        <ItemList
          items={detail.invalidBaseValues.map(
            (v) => `line ${v.line}: "${v.value}"`,
          )}
        />
      )}
      {detail.foundColumns && (
        <p className="mt-[9px] text-[11.5px] text-fg-muted">
          Columns found:{' '}
          <span className="font-mono text-[11px]">
            {detail.foundColumns.join(', ')}
          </span>
        </p>
      )}
    </div>
  );
}

function ItemList({ items }: { items: string[] }) {
  return (
    <div className="mt-[9px] flex flex-col gap-[3px]">
      {items.slice(0, MAX_LIST).map((it) => (
        <span key={it} className="font-mono text-[11px] text-fg-muted">
          {it}
        </span>
      ))}
      {items.length > MAX_LIST && (
        <span className="text-[11.5px] text-fg-subtle">
          +{items.length - MAX_LIST} more
        </span>
      )}
    </div>
  );
}

function Note({
  title,
  items,
  mono,
}: {
  title: string;
  items: string[];
  mono?: boolean;
}) {
  return (
    <div className="mt-[14px] rounded-[10px] border border-border bg-hover p-[12px]">
      <div className="flex items-center gap-[7px] text-[12px] font-medium text-fg-muted">
        <AlertTriangle size={14} strokeWidth={2} className="text-warn" />
        {title}
      </div>
      <div className="mt-[7px] flex flex-col gap-[3px]">
        {items.slice(0, MAX_LIST).map((it) => (
          <span
            key={it}
            className={cn(
              'text-[11.5px] text-fg-subtle',
              mono && 'font-mono text-[11px]',
            )}
          >
            {it}
          </span>
        ))}
        {items.length > MAX_LIST && (
          <span className="text-[11.5px] text-fg-subtle">
            +{items.length - MAX_LIST} more not shown
          </span>
        )}
      </div>
    </div>
  );
}

/** The changed fields of one SKU as [label, before, after] display triples. */
function fieldsOf(row: CatalogImportChange): [string, string, string][] {
  const out: [string, string, string][] = [];
  if (row.alias)
    out.push(['Alias', text(row.alias.before), text(row.alias.after)]);
  if (row.category)
    out.push(['Category', text(row.category.before), text(row.category.after)]);
  if (row.isBaseLicense)
    out.push([
      'Base licence',
      row.isBaseLicense.before ? 'Yes' : 'No',
      row.isBaseLicense.after ? 'Yes' : 'No',
    ]);
  return out;
}

/** Empty reads as an em-dash here — this is a screen, not the exported file. */
function text(v: string | null): string {
  return v === null || v === '' ? '—' : v;
}

function Chip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[4px] text-[11.5px]',
        accent
          ? 'border-transparent bg-accent-soft text-accent'
          : 'border-border text-fg-muted',
      )}
    >
      <span className="font-mono font-semibold">{value}</span>
      {label}
    </span>
  );
}
