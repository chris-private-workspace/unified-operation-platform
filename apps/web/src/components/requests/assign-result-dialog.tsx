import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  AssignResult,
  AssignStep,
  AssignStepKey,
  AssignStepOwner,
  AssignStepStatus,
} from '@/lib/api-types';

/**
 * W45 / ADR-0029 — what an assign actually did, step by step.
 *
 * Rebuilt from the prototype's assign modal (`IT Ops Platform.dc.html:1102-1158`)
 * as a spec, not copied. Three deliberate departures from it, each already
 * decided elsewhere rather than invented here:
 *
 *  1. **No live progress.** The prototype animates each step as it "runs";
 *     ADR-0029 A2 rejected SSE, so the breakdown arrives WITH the response.
 *     Faking a run would be inventing a timeline the server never reported.
 *  2. **No Retry button.** W45 plan §2.2 puts retry out of scope, and DS-3
 *     allows one primary action — which is Done.
 *  3. **Ten steps, not five, and `budget` / `seats` stay apart.** The
 *     prototype folds them into one `precheck`; 2026-08-07 on DEV hit both
 *     layers on real traffic and the remedies do not overlap (raise the OpCo
 *     allocation vs. buy tenant seats). Folding them produces a screen that
 *     cannot say which limit stopped you — W45 plan §3.1.
 *
 * The seven gates ARE collapsed for reading (plan §3.2) — one summary line that
 * expands. That is a display choice; the API still reports all ten separately.
 */

/** Plan §3, verbatim. Operator-facing, so no key ever reaches the screen raw. */
const STEP_LABEL: Record<AssignStepKey, string> = {
  stage: 'Line item is ready',
  'sync-azure': 'Account synced to Azure AD',
  'sync-servicenow': 'Target user known to ServiceNow',
  directory: 'User found in directory',
  'usage-location': 'Usage location set',
  budget: 'OpCo allocation',
  seats: 'Tenant seat available',
  assign: 'Licence applied via provider',
  ledger: 'Ledger updated',
  ticket: 'ServiceNow updated',
};

/**
 * ADR-0029 D2 — say who unblocks it. `operator` gets no line: those messages
 * already say what to do ("provide a usage location"), and "you fix it" adds
 * nothing.
 */
const WHO_FIXES: Partial<Record<AssignStepOwner, string>> = {
  admin: 'An admin can override this or raise the allocation.',
  identity: 'Chased through Entra Connect / directory sync.',
  servicenow: 'Chased through the ServiceNow user import.',
  procurement: 'More tenant seats have to be bought.',
  platform: 'This one is ours — raise it with the platform team.',
};

const STATUS_ICON: Record<AssignStepStatus, LucideIcon> = {
  ok: CircleCheck,
  failed: CircleAlert,
  skipped: CircleMinus,
  overridden: ShieldAlert,
};

// The six semantic tints only (DS-5) — no per-status colour is invented here.
const STATUS_COLOR: Record<AssignStepStatus, string> = {
  ok: 'text-ok',
  failed: 'text-danger',
  skipped: 'text-neutral',
  overridden: 'text-warn',
};

const GATE_KEYS: AssignStepKey[] = [
  'stage',
  'sync-azure',
  'sync-servicenow',
  'directory',
  'usage-location',
  'budget',
  'seats',
];

const isGate = (s: AssignStep) => GATE_KEYS.includes(s.key);

function StepRow({ step }: { step: AssignStep }) {
  const Icon = STATUS_ICON[step.status];
  const hint = step.whoFixes ? WHO_FIXES[step.whoFixes] : undefined;
  return (
    <div className="flex items-start gap-[11px] border-b border-border py-[11px] last:border-0">
      <Icon
        size={16}
        strokeWidth={2}
        className={cn('mt-[1px] shrink-0', STATUS_COLOR[step.status])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[12.5px] font-medium text-fg">
          {STEP_LABEL[step.key]}
        </span>
        {step.detail && (
          <span className="break-words text-[11.5px] leading-[1.45] text-fg-subtle">
            {step.detail}
          </span>
        )}
        {hint && (
          <span
            className={cn(
              'text-[11.5px] leading-[1.45]',
              STATUS_COLOR[step.status],
            )}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

export interface AssignResultDialogProps {
  result: AssignResult & { skuLabel: string; targetUpn: string };
  onClose: () => void;
}

export function AssignResultDialog({
  result,
  onClose,
}: AssignResultDialogProps) {
  const gates = result.steps.filter(isGate);
  const effects = result.steps.filter((s) => !isGate(s));
  const failedGate = gates.find((s) => s.status === 'failed');
  // Expanded by default when the pre-flight is where it stopped: the collapsed
  // summary would otherwise hide the one line the operator opened this for.
  const [expanded, setExpanded] = useState(Boolean(failedGate));

  const overridden = gates.find((s) => s.status === 'overridden');
  const groupStatus: AssignStepStatus = failedGate
    ? 'failed'
    : overridden
      ? 'overridden'
      : 'ok';
  const GroupIcon = STATUS_ICON[groupStatus];
  // DS-5 — the count is mono even inside a sans sentence, the same way the line
  // item's "Step 2/3" and the OpCo budget figures already are.
  // CH-026 — a skipped gate is not a passed one (assign-step.ts says so in as
  // many words), and an unlimited SKU now skips `seats`. Counting it as passed
  // would be the collapsed summary claiming a check that never ran.
  const skippedGates = gates.filter((s) => s.status === 'skipped').length;
  const groupSummary = failedGate ? (
    <>Stopped at {STEP_LABEL[failedGate.key].toLowerCase()}</>
  ) : (
    <>
      <span className="font-mono">{gates.length - skippedGates}</span>
      {overridden ? ' checks · OpCo allocation overridden' : ' checks passed'}
      {skippedGates > 0 && (
        <>
          {' · '}
          <span className="font-mono">{skippedGates}</span> skipped
        </>
      )}
    </>
  );

  const stopped = result.failedAt
    ? result.steps.find((s) => s.key === result.failedAt)
    : undefined;

  return (
    <Dialog
      open
      title="Assign license"
      width={560}
      onClose={onClose}
      footer={
        <Button variant="primary" size="md" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <span className="text-[12px] text-fg-muted">
          <span className="font-semibold text-fg">{result.skuLabel}</span> →{' '}
          {/* DS-5: identifiers are always mono. */}
          <span className="font-mono">{result.targetUpn}</span>
        </span>

        {/* Scrolls on its own so the subject line and the outcome banner stay
            put — ten expanded steps outrun a laptop viewport. Dialog itself is
            overflow-hidden and is left alone (shared primitive). */}
        <div className="flex max-h-[46vh] flex-col overflow-y-auto">
          {/* Pre-flight — collapsed by default (plan §3.2). The API still
              reports all seven; folding is a reading aid, not a loss. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full cursor-pointer items-center gap-[11px] border-b border-border py-[11px] text-left hover:bg-hover"
          >
            <GroupIcon
              size={16}
              strokeWidth={2}
              className={cn('shrink-0', STATUS_COLOR[groupStatus])}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="text-[12.5px] font-medium text-fg">
                Pre-flight
              </span>
              <span className="text-[11.5px] text-fg-subtle">
                {groupSummary}
              </span>
            </span>
            {expanded ? (
              <ChevronDown
                size={15}
                strokeWidth={2}
                className="text-fg-muted"
              />
            ) : (
              <ChevronRight
                size={15}
                strokeWidth={2}
                className="text-fg-muted"
              />
            )}
          </button>
          {expanded && (
            <div className="flex flex-col pl-[27px]">
              {gates.map((s) => (
                <StepRow key={s.key} step={s} />
              ))}
            </div>
          )}

          {/* 🔴 Only the effects that actually ran are listed. Steps after a
              refusal are ABSENT from the response, not reported as skipped —
              they were never evaluated, and drawing a placeholder row for them
              would claim otherwise. */}
          {effects.map((s) => (
            <StepRow key={s.key} step={s} />
          ))}
        </div>

        {result.outcome === 'assigned' ? (
          <div className="flex items-start gap-[9px] rounded-lg bg-ok-soft px-[12px] py-[11px]">
            <CircleCheck
              size={16}
              strokeWidth={2}
              className="mt-[1px] shrink-0 text-ok"
            />
            <span className="text-[12px] leading-[1.45] text-ok">
              License assigned · ledger updated
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-[9px] rounded-lg bg-danger-soft px-[12px] py-[11px]">
            <CircleAlert
              size={16}
              strokeWidth={2}
              className="mt-[1px] shrink-0 text-danger"
            />
            <span className="text-[12px] leading-[1.45] text-danger">
              {/* `blocked` and `failed` are not the same statement, and the
                  operator acts on the difference: nothing was attempted vs.
                  something broke partway through. */}
              {result.outcome === 'blocked'
                ? 'Nothing was assigned — a check refused before anything was attempted.'
                : 'The assign did not complete.'}
              {stopped?.detail ? ` ${stopped.detail}` : ''}
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
