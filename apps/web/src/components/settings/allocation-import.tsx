import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import { useAllocationImport } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import type { LedgerImportResult } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const MAX_ROWS = 100; // preview table cap — long imports note the remainder

// Allocation import (ADR-0004 / W13). Regional IT uploads the O365 List sheet as
// CSV; the panel previews the server's classified dry-run (mapped changes +
// skipped rows) before an explicit commit. allocatedQuantity only — the backend
// never touches the assigned baseline. token-only, light + dark (H6).
export function AllocationImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<LedgerImportResult | null>(null);
  const [committed, setCommitted] = useState<LedgerImportResult | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const imp = useAllocationImport();

  // Auto-dismiss the toast (Toast itself has no timer — caller owns it, FE-3).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const reset = () => {
    setFileName(null);
    setCsv(null);
    setPreview(null);
    setCommitted(null);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setPreview(null);
    setCommitted(null);
  };

  const runPreview = () => {
    if (!csv) return;
    imp.mutate(
      { csv, dryRun: true },
      {
        onSuccess: (res) => setPreview(res),
        onError: (err) =>
          setToast({ message: errMessage(err), tone: 'danger' }),
      },
    );
  };

  const runCommit = () => {
    if (!csv) return;
    imp.mutate(
      { csv, dryRun: false },
      {
        onSuccess: (res) => {
          setCommitted(res);
          setToast({
            message: `Imported ${res.committed} allocation ${plural(res.committed, 'change')}.`,
            tone: 'ok',
          });
        },
        onError: (err) =>
          setToast({ message: errMessage(err), tone: 'danger' }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onPick}
        className="hidden"
      />

      {/* Upload card */}
      <div className="rounded-[12px] border border-border bg-card p-[18px]">
        <h3 className="text-[13px] font-semibold text-fg">
          License allocation import
        </h3>
        <p className="mt-[6px] text-[11.5px] leading-[1.5] text-fg-subtle">
          Upload the O365 license summary exported as CSV. Each SKU row maps to
          a catalog entry by its business alias; only curated M365 SKUs are
          imported — D365 and other rows are listed as skipped. You’ll preview
          every change before it’s written.
        </p>

        <div className="mt-[14px] flex items-center gap-[12px]">
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
        </div>

        {csv && !preview && !committed && (
          <div className="mt-[16px]">
            <Button
              variant="primary"
              icon={<ArrowRight size={15} strokeWidth={2} />}
              onClick={runPreview}
              disabled={imp.isPending}
            >
              {imp.isPending ? 'Previewing…' : 'Preview import'}
            </Button>
          </div>
        )}
      </div>

      {/* Preview (dry-run) — shown until committed */}
      {preview && !committed && (
        <div className="rounded-[12px] border border-border bg-card p-[18px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <Chip label="OpCo columns" value={preview.summary.opcoColumns} />
            <Chip label="SKUs mapped" value={preview.summary.mappedSkuRows} />
            <Chip label="Changes" value={preview.summary.changes} accent />
            <Chip
              label="Skipped SKUs"
              value={preview.skippedSkuLabels.length}
            />
          </div>

          {preview.changes.length > 0 ? (
            <div className="mt-[16px] overflow-x-auto rounded-[10px] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>OpCo</th>
                    <th className={TH}>SKU</th>
                    <th className={cn(TH, 'text-right')}>Before</th>
                    <th className={cn(TH, 'text-right')}>After</th>
                    <th className={cn(TH, 'text-right')}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.slice(0, MAX_ROWS).map((c, i) => (
                    <tr
                      key={`${c.opcoCode}:${c.skuPartNumber}:${i}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className={cn(TD, 'font-mono text-[12px]')}>
                        {c.opcoCode}
                      </td>
                      <td className={TD}>
                        <div className="text-[12.5px] text-fg">
                          {c.skuBusinessAlias}
                        </div>
                        <div className="font-mono text-[11px] text-fg-subtle">
                          {c.skuPartNumber}
                        </div>
                      </td>
                      <td
                        className={cn(
                          TD,
                          'text-right font-mono text-[12.5px] text-fg-muted',
                        )}
                      >
                        {c.before}
                      </td>
                      <td
                        className={cn(
                          TD,
                          'text-right font-mono text-[12.5px] text-fg',
                        )}
                      >
                        {c.target}
                      </td>
                      <td
                        className={cn(
                          TD,
                          'text-right font-mono text-[12.5px]',
                          c.delta > 0 ? 'text-ok' : 'text-warn',
                        )}
                      >
                        {c.delta > 0 ? `+${c.delta}` : c.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.changes.length > MAX_ROWS && (
                <div className="border-t border-border px-[16px] py-[9px] text-[11.5px] text-fg-subtle">
                  +{preview.changes.length - MAX_ROWS} more{' '}
                  {plural(preview.changes.length - MAX_ROWS, 'change')} not
                  shown — all will be committed.
                </div>
              )}
            </div>
          ) : (
            <p className="mt-[14px] text-[12px] text-fg-muted">
              No allocation changes — the ledger already matches this file.
            </p>
          )}

          {preview.skippedSkuLabels.length > 0 && (
            <SkippedNote
              title={`${preview.skippedSkuLabels.length} SKU ${plural(
                preview.skippedSkuLabels.length,
                'row',
              )} skipped (not curated / out of scope)`}
              items={preview.skippedSkuLabels}
            />
          )}
          {preview.unknownOpcoHeaders.length > 0 && (
            <SkippedNote
              title={`${preview.unknownOpcoHeaders.length} unrecognised column ${plural(
                preview.unknownOpcoHeaders.length,
                'header',
              )}`}
              items={preview.unknownOpcoHeaders}
            />
          )}

          <div className="mt-[18px] flex items-center gap-[10px]">
            <Button
              variant="primary"
              icon={<Check size={15} strokeWidth={2} />}
              onClick={runCommit}
              disabled={imp.isPending || preview.changes.length === 0}
            >
              {imp.isPending
                ? 'Importing…'
                : `Commit ${preview.changes.length} ${plural(preview.changes.length, 'change')}`}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={imp.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Committed */}
      {committed && (
        <div className="rounded-[12px] border border-border bg-card p-[18px]">
          <div className="flex items-center gap-[9px]">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ok-soft text-ok">
              <Check size={14} strokeWidth={2.5} />
            </span>
            <h3 className="text-[13px] font-semibold text-fg">
              Imported {committed.committed} allocation{' '}
              {plural(committed.committed, 'change')}
            </h3>
          </div>
          <p className="mt-[8px] text-[11.5px] text-fg-subtle">
            allocatedQuantity updated across {committed.summary.mappedSkuRows}{' '}
            SKUs. The assigned baseline was not touched.
          </p>
          <div className="mt-[14px]">
            <Button
              variant="secondary"
              icon={<Upload size={15} strokeWidth={2} />}
              onClick={reset}
            >
              Import another file
            </Button>
          </div>
        </div>
      )}

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}

const TH =
  'px-[16px] py-[9px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[10px] align-top';

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

function SkippedNote({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-[14px] rounded-[10px] border border-border bg-hover p-[12px]">
      <div className="flex items-center gap-[7px] text-[12px] font-medium text-fg-muted">
        <AlertTriangle size={14} strokeWidth={2} className="text-warn" />
        {title}
      </div>
      <div className="mt-[7px] flex flex-col gap-[3px]">
        {items.map((it) => (
          <span key={it} className="text-[11.5px] text-fg-subtle">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function errMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Import failed — check the API is running and try again.';
}
