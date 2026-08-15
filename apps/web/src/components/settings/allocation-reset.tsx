import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import { useAllocationReset, useLedgerFullReset } from '@/hooks/mutations';
import { useOpcos } from '@/hooks/queries';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { canFullResetLedger } from '@/lib/roles';
import { ApiError } from '@/lib/api';
import type {
  AllocationResetResult,
  LedgerFullResetResult,
} from '@/lib/api-types';
import { cn } from '@/lib/utils';

const MAX_ROWS = 8; // dialog preview cap — the count above it is the real figure

type ResetMode = 'allocation' | 'full';

/**
 * Discriminated rather than merged, because the two results answer different
 * questions and a shared shape would invite the UI to describe one using the
 * other's wording — precisely the confusion ADR-0022 flags as R4.
 */
type ResetOutcome =
  | { mode: 'allocation'; data: AllocationResetResult }
  | { mode: 'full'; data: LedgerFullResetResult };

/**
 * Ledger reset (CH-016 allocation-only + CH-017 full).
 *
 * Lives directly under the import panel because it is only ever reached from
 * "I uploaded the wrong thing". Two modes rather than two buttons (ADR-0022
 * Consequences): the endpoints are near-identically named and one of them wipes
 * a baseline no import can rebuild, so the choice has to be made in one place,
 * on purpose, before anything else is filled in.
 *
 * Deliberately NOT a primary action — the panel's primary is Import (H6). Both
 * modes are `danger`, and neither fires without a dry-run shown first.
 */
export function AllocationResetCard() {
  const [mode, setMode] = useState<ResetMode>('allocation');
  const [opcoCode, setOpcoCode] = useState(''); // '' = every OpCo
  const [preview, setPreview] = useState<ResetOutcome | null>(null);
  const [done, setDone] = useState<ResetOutcome | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const allocationReset = useAllocationReset();
  const fullReset = useLedgerFullReset();
  const opcos = useOpcos();
  const { role } = useCurrentUser();

  const canFull = canFullResetLedger(role);
  const isFull = mode === 'full';
  const isPending = allocationReset.isPending || fullReset.isPending;
  const scope = opcoCode || undefined;
  /** What the operator must retype to commit a full reset (ADR-0022 D6). */
  const expectedConfirm = opcoCode || 'ALL';

  // Toast owns no timer of its own (FE-3) — same pattern as the import panel.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fail = (err: unknown) =>
    setToast({ message: errMessage(err), tone: 'danger' });

  const runPreview = () => {
    setDone(null);
    setConfirmText('');

    // Nothing to clear is not worth a modal — say so and stop here.
    const nothing = () =>
      setToast({
        message: isFull
          ? 'Nothing to reset — every cell in scope is already 0 / 0.'
          : 'Nothing to reset — every allocation in scope is already 0.',
        tone: 'ok',
      });

    if (isFull) {
      fullReset.mutate(
        { dryRun: true, opcoCode: scope },
        {
          onSuccess: (data) =>
            data.affected === 0
              ? nothing()
              : setPreview({ mode: 'full', data }),
          onError: fail,
        },
      );
      return;
    }
    allocationReset.mutate(
      { dryRun: true, opcoCode: scope },
      {
        onSuccess: (data) =>
          data.affected === 0
            ? nothing()
            : setPreview({ mode: 'allocation', data }),
        onError: fail,
      },
    );
  };

  const runCommit = () => {
    const finish = (outcome: ResetOutcome) => {
      setPreview(null);
      setDone(outcome);
      setConfirmText('');
      setToast({
        message:
          outcome.mode === 'full'
            ? `Reset ${outcome.data.affected} ledger ${plural(outcome.data.affected, 'cell')} to 0 / 0.`
            : `Reset ${outcome.data.affected} allocation ${plural(outcome.data.affected, 'cell')} to 0.`,
        tone: 'ok',
      });
    };

    if (isFull) {
      fullReset.mutate(
        { dryRun: false, opcoCode: scope, confirm: confirmText },
        {
          onSuccess: (data) => finish({ mode: 'full', data }),
          onError: fail,
        },
      );
      return;
    }
    allocationReset.mutate(
      { dryRun: false, opcoCode: scope },
      {
        onSuccess: (data) => finish({ mode: 'allocation', data }),
        onError: fail,
      },
    );
  };

  const commitBlocked =
    isPending || (preview?.mode === 'full' && confirmText !== expectedConfirm);

  return (
    <div className="rounded-[12px] border border-border bg-card p-[18px]">
      <h3 className="text-[13px] font-semibold text-fg">Reset ledger</h3>
      <p className="mt-[6px] text-[11.5px] leading-[1.5] text-fg-subtle">
        Sets the ledger back to 0 so a bad upload can be redone from scratch.
        Importing a corrected file only overwrites the cells that file mentions
        — anything that was in the wrong file but not the new one keeps its old
        number, and this is the only way to clear it.
      </p>

      {/* The reassurance (or the lack of it) belongs next to the button, not
          buried in a modal: "will this wipe what we have assigned" is the first
          question anyone asks on seeing a Reset next to a ledger. In full mode
          the honest answer is yes, so the sentence flips rather than staying
          quietly wrong. */}
      {isFull ? (
        <p className="mt-[8px] text-[11.5px] leading-[1.5] text-warn">
          Full reset also clears the assigned baseline (
          <span className="font-mono text-[11px]">assignedQuantity</span>) — and
          no import can restore it, because the allocation import never writes
          that column. Reloading it is a separate ops step. No ledger rows are
          deleted, and the per-cell edit history is kept.
        </p>
      ) : (
        <p className="mt-[8px] text-[11.5px] leading-[1.5] text-fg-subtle">
          The assigned baseline (
          <span className="font-mono text-[11px] text-fg-muted">
            assignedQuantity
          </span>
          ) is never touched and no ledger rows are deleted — drift
          reconciliation and the per-cell edit history stay intact.
        </p>
      )}

      <div className="mt-[14px] flex flex-wrap items-end gap-[12px]">
        <label className="flex flex-col gap-[5px]">
          <span className="text-[11.5px] font-medium text-fg-muted">
            What to clear
          </span>
          {/* 240 = the width the scope select next to it already uses (DS-2),
              not a new number picked to fit this option's longer label. */}
          <div className="w-full max-w-[240px]">
            <Select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as ResetMode);
                setPreview(null);
                setDone(null);
              }}
              disabled={isPending}
            >
              <option value="allocation">Allocation only</option>
              {/* Backend is the real gate (403); this only avoids offering a
                  control that would refuse them. */}
              <option value="full" disabled={!canFull}>
                Allocation + assigned — full reset
                {canFull ? '' : ' (admin only)'}
              </option>
            </Select>
          </div>
        </label>
        <label className="flex flex-col gap-[5px]">
          <span className="text-[11.5px] font-medium text-fg-muted">Scope</span>
          <div className="w-full max-w-[240px]">
            <Select
              value={opcoCode}
              onChange={(e) => setOpcoCode(e.target.value)}
              disabled={isPending}
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
          disabled={isPending}
        >
          {isPending
            ? 'Checking…'
            : isFull
              ? 'Full reset…'
              : 'Reset allocation…'}
        </Button>
      </div>

      {done && (
        <div className="mt-[16px] rounded-[10px] border border-border bg-hover p-[12px]">
          <div className="text-[12px] font-medium text-fg-muted">
            Reset{' '}
            <span className="font-mono text-fg">{done.data.affected}</span>{' '}
            {plural(done.data.affected, 'cell')} in scope{' '}
            <span className="font-mono text-fg">{done.data.scope}</span>
          </div>
          <p className="mt-[7px] text-[11.5px] leading-[1.5] text-fg-subtle">
            {done.data.warning}
          </p>
          <div className="mt-[12px] flex items-center gap-[7px] text-[11.5px] font-medium text-fg-muted">
            <Upload size={14} strokeWidth={2} className="text-fg-subtle" />
            Next step — import the corrected CSV above.
          </div>
        </div>
      )}

      <Dialog
        open={preview !== null}
        title={
          preview?.mode === 'full'
            ? 'Reset allocation AND assigned to zero?'
            : 'Reset allocation to zero?'
        }
        // 460 = the widest value already in use (request-detail's budget
        // override), not a new one invented for this table (DS-2).
        width={460}
        onClose={() => {
          setPreview(null);
          setConfirmText('');
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setConfirmText('');
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={runCommit}
              disabled={commitBlocked}
            >
              {isPending
                ? 'Resetting…'
                : `Reset ${preview?.data.affected ?? 0} ${plural(preview?.data.affected ?? 0, 'cell')}`}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[12.5px] leading-[1.5] text-fg">
              <span className="font-mono font-semibold">
                {preview.data.affected}
              </span>{' '}
              ledger {plural(preview.data.affected, 'cell')} in scope{' '}
              <span className="font-mono font-semibold">
                {preview.data.scope}
              </span>{' '}
              will be set to{' '}
              <span className="font-mono font-semibold">
                {preview.mode === 'full' ? '0 / 0' : '0'}
              </span>
              .
            </p>

            {/* The count that makes a full reset different in kind: these cells
                lose a figure NO import can put back. */}
            {preview.mode === 'full' && preview.data.assignedCells > 0 && (
              <p className="text-[12.5px] leading-[1.5] text-warn">
                <span className="font-mono font-semibold">
                  {preview.data.assignedCells}
                </span>{' '}
                of them lose their{' '}
                <span className="font-medium">assigned baseline</span>, which
                re-importing cannot restore — reloading it is a separate ops
                step, and drift reconciliation has no baseline until then.
              </p>
            )}

            {inactiveCount(preview) > 0 && (
              <p className="text-[12.5px] leading-[1.5] text-warn">
                <span className="font-mono font-semibold">
                  {inactiveCount(preview)}
                </span>{' '}
                {/* In full mode "cannot be undone by re-importing" would be
                    true of every row, so it would stop distinguishing these
                    ones. What is special about them is that not even the
                    ALLOCATION half comes back. */}
                {preview.mode === 'full'
                  ? 'cannot have even their allocation re-imported'
                  : 'of them cannot be undone by re-importing'}{' '}
                — marked <span className="font-medium">inactive</span> below.
                The import only writes active SKUs, so those cells would have to
                be corrected one by one.
              </p>
            )}

            <div className="overflow-x-auto rounded-[10px] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className={TH}>OpCo</th>
                    <th className={TH}>SKU</th>
                    <th className={cn(TH, 'text-right')}>
                      {preview.mode === 'full' ? 'Allocated' : 'Now'}
                    </th>
                    {preview.mode === 'full' && (
                      <th className={cn(TH, 'text-right')}>Assigned</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows(preview)
                    .slice(0, MAX_ROWS)
                    .map((r, i) => (
                      <tr
                        key={`${r.opcoCode}:${r.skuPartNumber}:${i}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className={cn(TD, 'font-mono text-[12px]')}>
                          {r.opcoCode}
                        </td>
                        <td className={cn(TD, 'font-mono text-[12px] text-fg')}>
                          {r.skuPartNumber}
                          {/* Marked per row, not just counted above, so the
                              operator can tell WHICH cells they are about to
                              lose for good. */}
                          {!r.skuActive && (
                            <span className="ml-[6px] font-sans text-[10.5px] font-medium text-warn">
                              inactive
                            </span>
                          )}
                        </td>
                        <td className={cn(TD, NUM)}>{r.allocatedBefore}</td>
                        {preview.mode === 'full' && (
                          <td className={cn(TD, NUM)}>{r.assignedBefore}</td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
              {previewRows(preview).length > MAX_ROWS && (
                <div className="border-t border-border px-[14px] py-[8px] text-[11.5px] text-fg-subtle">
                  +{previewRows(preview).length - MAX_ROWS} more not shown — all
                  will be reset.
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
                {preview.data.warning}
              </p>
            </div>

            {/* ADR-0022 D6 — dry-run stops an accidental commit; retyping the
                scope stops a deliberate commit aimed at the wrong one. Only the
                full reset asks, because only it is unrecoverable. */}
            {preview.mode === 'full' && (
              <label className="flex flex-col gap-[6px]">
                <span className="text-[11.5px] leading-[1.5] text-fg-muted">
                  Type{' '}
                  <span className="font-mono font-semibold text-fg">
                    {expectedConfirm}
                  </span>{' '}
                  to confirm this scope.
                </span>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={expectedConfirm}
                  disabled={isPending}
                  aria-label="Confirm reset scope"
                />
              </label>
            )}
          </div>
        )}
      </Dialog>

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}

/** One preview row, normalised so the table body does not branch per column. */
interface PreviewRow {
  opcoCode: string;
  skuPartNumber: string;
  allocatedBefore: number;
  assignedBefore: number;
  skuActive: boolean;
}

function previewRows(outcome: ResetOutcome): PreviewRow[] {
  if (outcome.mode === 'full') return outcome.data.rows;
  // CH-016 rows carry one number (`before` = allocated) and no assigned figure;
  // the column is not rendered in that mode, so 0 is never displayed.
  return outcome.data.rows.map((r) => ({
    opcoCode: r.opcoCode,
    skuPartNumber: r.skuPartNumber,
    allocatedBefore: r.before,
    assignedBefore: 0,
    skuActive: r.skuActive,
  }));
}

/** Cells whose ALLOCATION cannot be re-imported (inactive SKU) — both modes. */
function inactiveCount(outcome: ResetOutcome): number {
  return outcome.mode === 'full'
    ? outcome.data.irreversibleAllocated
    : outcome.data.irreversible;
}

const TH =
  'px-[14px] py-[8px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[14px] py-[9px] align-top';
const NUM = 'text-right font-mono text-[12.5px] text-fg-muted';

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function errMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Reset failed — check the API is running and try again.';
}
