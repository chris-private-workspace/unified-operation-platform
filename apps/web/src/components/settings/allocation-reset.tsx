import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import { useAllocationReset } from '@/hooks/mutations';
import { useOpcos } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import type { AllocationResetResult } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const MAX_ROWS = 8; // dialog preview cap — the count above it is the real figure

/**
 * Allocation reset (CH-016) — the way back out of a bad allocation import.
 *
 * Lives directly under the import panel because it is only ever reached from
 * "I uploaded the wrong thing". The reason it has to exist at all: the import is
 * upsert-only, so a cell that appeared in the bad CSV but NOT in the corrected
 * one keeps its wrong number forever.
 *
 * Deliberately NOT a primary action — the panel's primary is Import (H6). This
 * is `danger`, and it never fires without a dry-run shown first.
 */
export function AllocationResetCard() {
  const [opcoCode, setOpcoCode] = useState(''); // '' = every OpCo
  const [preview, setPreview] = useState<AllocationResetResult | null>(null);
  const [done, setDone] = useState<AllocationResetResult | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const reset = useAllocationReset();
  const opcos = useOpcos();

  // Toast owns no timer of its own (FE-3) — same pattern as the import panel.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const scope = opcoCode || undefined;

  const runPreview = () => {
    setDone(null);
    reset.mutate(
      { dryRun: true, opcoCode: scope },
      {
        onSuccess: (res) => {
          // Nothing to zero is not worth a modal — say so and stop here.
          if (res.affected === 0) {
            setToast({
              message: 'Nothing to reset — every allocation in scope is already 0.',
              tone: 'ok',
            });
            return;
          }
          setPreview(res);
        },
        onError: (err) => setToast({ message: errMessage(err), tone: 'danger' }),
      },
    );
  };

  const runCommit = () => {
    reset.mutate(
      { dryRun: false, opcoCode: scope },
      {
        onSuccess: (res) => {
          setPreview(null);
          setDone(res);
          setToast({
            message: `Reset ${res.affected} allocation ${plural(res.affected, 'cell')} to 0.`,
            tone: 'ok',
          });
        },
        onError: (err) => setToast({ message: errMessage(err), tone: 'danger' }),
      },
    );
  };

  return (
    <div className="rounded-[12px] border border-border bg-card p-[18px]">
      <h3 className="text-[13px] font-semibold text-fg">Reset allocation</h3>
      <p className="mt-[6px] text-[11.5px] leading-[1.5] text-fg-subtle">
        Sets <span className="font-mono text-[11px] text-fg-muted">allocatedQuantity</span>{' '}
        back to 0 so a bad upload can be redone from scratch. Importing a
        corrected file only overwrites the cells that file mentions — anything
        that was in the wrong file but not the new one keeps its old number, and
        this is the only way to clear it.
      </p>

      {/* The reassurance belongs next to the button, not buried in a modal:
          "will this wipe what we have assigned" is the first question anyone
          asks when they see a Reset next to a ledger. */}
      <p className="mt-[8px] text-[11.5px] leading-[1.5] text-fg-subtle">
        The assigned baseline (
        <span className="font-mono text-[11px] text-fg-muted">
          assignedQuantity
        </span>
        ) is never touched and no ledger rows are deleted — drift reconciliation
        and the per-cell edit history stay intact.
      </p>

      <div className="mt-[14px] flex flex-wrap items-end gap-[12px]">
        <label className="flex flex-col gap-[5px]">
          <span className="text-[11.5px] font-medium text-fg-muted">Scope</span>
          <div className="w-full max-w-[240px]">
            <Select
              value={opcoCode}
              onChange={(e) => setOpcoCode(e.target.value)}
              disabled={reset.isPending}
            >
              <option value="">All OpCos</option>
              {(opcos.data ?? []).map((o) => (
                <option key={o.id} value={o.code}>
                  {o.code} — {o.displayName}
                </option>
              ))}
            </Select>
          </div>
        </label>
        <Button
          variant="danger"
          icon={<RotateCcw size={15} strokeWidth={2} />}
          onClick={runPreview}
          disabled={reset.isPending}
        >
          {reset.isPending ? 'Checking…' : 'Reset allocation…'}
        </Button>
      </div>

      {done && (
        <div className="mt-[16px] rounded-[10px] border border-border bg-hover p-[12px]">
          <div className="text-[12px] font-medium text-fg-muted">
            Reset{' '}
            <span className="font-mono text-fg">{done.affected}</span>{' '}
            {plural(done.affected, 'cell')} in scope{' '}
            <span className="font-mono text-fg">{done.scope}</span>
          </div>
          <p className="mt-[7px] text-[11.5px] leading-[1.5] text-fg-subtle">
            {done.warning}
          </p>
          <div className="mt-[12px] flex items-center gap-[7px] text-[11.5px] font-medium text-fg-muted">
            <Upload size={14} strokeWidth={2} className="text-fg-subtle" />
            Next step — import the corrected CSV above.
          </div>
        </div>
      )}

      <Dialog
        open={preview !== null}
        title="Reset allocation to zero?"
        // 460 = the widest value already in use (request-detail's budget
        // override), not a new one invented for this table (DS-2).
        width={460}
        onClose={() => setPreview(null)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPreview(null)}
              disabled={reset.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={runCommit}
              disabled={reset.isPending}
            >
              {reset.isPending
                ? 'Resetting…'
                : `Reset ${preview?.affected ?? 0} ${plural(preview?.affected ?? 0, 'cell')}`}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[12.5px] leading-[1.5] text-fg">
              <span className="font-mono font-semibold">{preview.affected}</span>{' '}
              ledger {plural(preview.affected, 'cell')} in scope{' '}
              <span className="font-mono font-semibold">{preview.scope}</span>{' '}
              will be set to <span className="font-mono font-semibold">0</span>.
            </p>

            {preview.irreversible > 0 && (
              <p className="text-[12.5px] leading-[1.5] text-warn">
                <span className="font-mono font-semibold">
                  {preview.irreversible}
                </span>{' '}
                of them cannot be undone by re-importing — marked{' '}
                <span className="font-medium">inactive</span>{' '}
                below. The import only writes active SKUs, so those cells would
                have to be corrected one by one.
              </p>
            )}

            <div className="overflow-x-auto rounded-[10px] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>OpCo</th>
                    <th className={TH}>SKU</th>
                    <th className={cn(TH, 'text-right')}>Now</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, MAX_ROWS).map((r, i) => (
                    <tr
                      key={`${r.opcoCode}:${r.skuPartNumber}:${i}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className={cn(TD, 'font-mono text-[12px]')}>
                        {r.opcoCode}
                      </td>
                      <td className={cn(TD, 'font-mono text-[12px] text-fg')}>
                        {r.skuPartNumber}
                        {/* §2.5 — marked per row, not just counted below, so
                            the operator can tell WHICH cells they are about to
                            lose for good. */}
                        {!r.skuActive && (
                          <span className="ml-[6px] font-sans text-[10.5px] font-medium text-warn">
                            inactive
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          TD,
                          'text-right font-mono text-[12.5px] text-fg-muted',
                        )}
                      >
                        {r.before}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > MAX_ROWS && (
                <div className="border-t border-border px-[14px] py-[8px] text-[11.5px] text-fg-subtle">
                  +{preview.rows.length - MAX_ROWS} more not shown — all will be
                  reset.
                </div>
              )}
            </div>

            {/* Server-authored, rendered verbatim: the mid-state it describes is
                the actual consequence, and paraphrasing it here would let the
                two drift apart. */}
            <div className="flex gap-[8px] rounded-[10px] border border-border bg-hover p-[12px]">
              <AlertTriangle
                size={15}
                strokeWidth={2}
                className="mt-[1px] shrink-0 text-warn"
              />
              <p className="text-[11.5px] leading-[1.5] text-fg-subtle">
                {preview.warning}
              </p>
            </div>
          </div>
        )}
      </Dialog>

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}

const TH =
  'px-[14px] py-[8px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[14px] py-[9px] align-top';

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function errMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Reset failed — check the API is running and try again.';
}
