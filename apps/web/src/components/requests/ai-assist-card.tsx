import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading } from '@/components/ui/feedback-states';
import { useAgentRun } from '@/hooks/queries';
import {
  useAbortAgentRun,
  useDecideProposal,
  useStartAgentRun,
} from '@/hooks/mutations';
import { STEP_LABEL } from './ai-assist-labels';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  AgentMessage,
  AgentProposal,
  AgentRunStatus,
  AgentStep,
} from '@/lib/api-types';

/**
 * W46 F8 / ADR-0036 — the AI Assist card, replacing the "Coming soon" placeholder.
 *
 * 🔴 The one thing this screen exists to keep visible is D4: an agent's OWN
 * account of itself and the platform's record of what ran are DIFFERENT KINDS
 * OF FACT, and INC-001 is what happens when a reader stops being able to tell
 * them apart. So they are two blocks, labelled, in that order — steps first,
 * because those are the evidence.
 *
 * Reuses the `AssignResultDialog` step idiom (ADR-0029: the keys are the
 * contract, and `AgentStep` copies the shape deliberately) rather than
 * inventing a second way to read a step list.
 */

const RUN_TONE: Record<AgentRunStatus, BadgeTone> = {
  running: 'info',
  // The one state a person has to act on — the same tone the request stages use
  // for "waiting on someone" (DS-8).
  awaiting_approval: 'warn',
  approved: 'info',
  rejected: 'neutral',
  completed: 'ok',
  failed: 'danger',
  aborted: 'neutral',
};

const RUN_LABEL: Record<AgentRunStatus, string> = {
  running: 'Running',
  awaiting_approval: 'Waiting for you',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Done',
  failed: 'Failed',
  aborted: 'Stopped',
};

const STEP_ICON: Record<AgentStep['status'], LucideIcon> = {
  ok: CircleCheck,
  failed: CircleAlert,
  skipped: CircleMinus,
};

const STEP_COLOR: Record<AgentStep['status'], string> = {
  ok: 'text-ok',
  failed: 'text-danger',
  skipped: 'text-neutral',
};

/**
 * 🔴 `STEP_LABEL` lives in `ai-assist-labels.ts`, not here, and it has a test
 * that reads the API's tool registry. `MESSAGE_LABEL` below needs neither:
 * `AgentMessage['role']` is a union, so leaving a role out does not compile.
 * The two maps used to sit side by side looking identical — only one of them
 * was ever protected.
 */
const MESSAGE_LABEL: Record<AgentMessage['role'], string> = {
  user: 'Asked',
  assistant: 'Said',
  thinking: 'Reasoning',
  tool_call: 'Called',
  tool_result: 'Got back',
  unknown: 'Unrecognised',
};

function StepRow({ step }: { step: AgentStep }) {
  const Icon = STEP_ICON[step.status];
  return (
    <div className="flex items-start gap-[11px] border-b border-border py-[9px] last:border-0">
      <Icon
        size={15}
        strokeWidth={2}
        className={cn('mt-[2px] shrink-0', STEP_COLOR[step.status])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[12px] font-medium text-fg">
          {STEP_LABEL[step.key] ?? step.key}
        </span>
        {step.detail && (
          <span className="break-words text-[11.5px] leading-[1.45] text-fg-subtle">
            {step.detail}
          </span>
        )}
      </div>
      {/* DS-5 — timestamps are mono, like every other identifier on this page. */}
      <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
        {formatDateTime(step.createdAt)}
      </span>
    </div>
  );
}

/** The proposed SKUs, read out of the model's own payload. */
function ProposalSummary({ payload }: { payload: unknown }) {
  const items = (payload as { items?: { skuId: string; quantity: number }[] })
    ?.items;
  const reasoning = (payload as { reasoning?: string })?.reasoning;

  return (
    <div className="flex flex-col gap-[7px]">
      {reasoning && (
        <span className="text-[11.5px] leading-[1.5] text-fg-muted">
          {reasoning}
        </span>
      )}
      {items?.length ? (
        <div className="flex flex-col gap-[3px]">
          {items.map((item) => (
            // DS-5 — a skuId is a GUID, so it is mono. It is also the ONLY way
            // this proposal names a SKU (plan §3.4): the agent is never allowed
            // to name one by product name, because the catalogue carries more
            // than one E5.
            <span key={item.skuId} className="font-mono text-[11.5px] text-fg">
              {item.skuId}{' '}
              <span className="text-fg-subtle">×{item.quantity}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[11.5px] text-fg-subtle">Nothing proposed.</span>
      )}
    </div>
  );
}

export interface AiAssistCardProps {
  requestId: string;
}

export function AiAssistCard({ requestId }: AiAssistCardProps) {
  const { data: run, isLoading } = useAgentRun(requestId);
  const start = useStartAgentRun(requestId);
  const abort = useAbortAgentRun(requestId);
  const decide = useDecideProposal(requestId);

  const [showTranscript, setShowTranscript] = useState(false);
  const [rejecting, setRejecting] = useState<AgentProposal | null>(null);
  const [reason, setReason] = useState('');

  const pending = start.isPending || abort.isPending || decide.isPending;
  const open =
    run != null &&
    ['running', 'awaiting_approval', 'approved'].includes(run.status);
  const waiting = run?.proposals.filter((p) => p.status === 'pending') ?? [];

  const header = (
    <span className="flex items-center gap-[8px]">
      <Sparkles size={16} strokeWidth={2} className="text-purple" />
      AI Assist
    </span>
  );

  if (isLoading) {
    return (
      <Card title={header}>
        <Loading />
      </Card>
    );
  }

  if (!run) {
    return (
      <Card title={header} action={<Badge tone="purple">Preview</Badge>}>
        <EmptyState
          icon={<Sparkles size={18} strokeWidth={2} />}
          title="No run yet"
          description="The agent reads the free-text remark and proposes licence line items. It creates nothing on its own — you decide."
          action={
            /* DS-3 — secondary, not primary. The page's primary belongs to the
               request itself (sync check / assign); an assistive surface does
               not compete for it. */
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => start.mutate()}
            >
              Run AI Assist
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title={header}
      action={
        <span className="flex items-center gap-[8px]">
          <Badge tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</Badge>
          {open && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => abort.mutate(run.id)}
            >
              Stop
            </Button>
          )}
        </span>
      }
    >
      <div className="flex flex-col gap-[14px]">
        {(start.error || abort.error || decide.error) && (
          <div className="rounded-lg bg-danger-soft px-[12px] py-[10px] text-[11.5px] leading-[1.45] text-danger">
            {(start.error ?? abort.error ?? decide.error)?.message}
          </div>
        )}

        {/* ── proposals ─────────────────────────────────────── */}
        {waiting.map((proposal) => (
          <div
            key={proposal.id}
            className="flex flex-col gap-[10px] rounded-lg border border-border bg-hover px-[12px] py-[11px]"
          >
            <span className="text-[12px] font-semibold text-fg">
              Proposed line items
            </span>
            <ProposalSummary payload={proposal.payload} />
            {/* 🔴 F8-3 / ADR-0036 D3 — the counter-intuitive half, said out
                loud. Approving decides that this SHOULD happen; it does not
                decide that it MAY. The platform's own checks run afterwards and
                can still refuse. */}
            <span className="text-[11px] leading-[1.45] text-fg-subtle">
              Approving runs the platform's normal checks — they can still
              refuse.
            </span>
            <div className="flex items-center gap-[7px]">
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => decide.mutate({ proposalId: proposal.id })}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setReason('');
                  setRejecting(proposal);
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}

        {/* ── the action ledger ─────────────────────────────── */}
        <div className="flex flex-col">
          <span className="pb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            What ran
          </span>
          {run.steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>

        {/* ── the transcript ────────────────────────────────── */}
        {run.messages.length > 0 && (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              aria-expanded={showTranscript}
              className="flex cursor-pointer items-center gap-[7px] py-[6px] text-left hover:bg-hover"
            >
              {showTranscript ? (
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
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                Transcript
              </span>
              <span className="font-mono text-[11px] text-fg-subtle">
                {run.messages.length}
              </span>
            </button>
            {showTranscript && (
              <div className="flex flex-col gap-[8px] pl-[22px] pt-[4px]">
                {/* 🔴 D4 in one sentence. The steps above are what the platform
                    saw; this is what the agent SAID, and the two are not the
                    same kind of fact. */}
                <span className="text-[11px] leading-[1.45] text-fg-subtle">
                  What the agent said. A record of its reasoning — not evidence
                  that anything happened.
                </span>
                {run.messages.map((message) => (
                  <div key={message.id} className="flex flex-col gap-[2px]">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                      {MESSAGE_LABEL[message.role]}
                    </span>
                    <span className="whitespace-pre-wrap break-words text-[11.5px] leading-[1.5] text-fg-muted">
                      {message.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {rejecting && (
        <Dialog
          open
          title="Reject proposal"
          width={460}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <Button
                variant="secondary"
                size="md"
                disabled={pending}
                onClick={() => setRejecting(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                disabled={pending || reason.trim().length < 5}
                onClick={() => {
                  decide.mutate({
                    proposalId: rejecting.id,
                    reason: reason.trim(),
                  });
                  setRejecting(null);
                }}
              >
                Reject
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-[9px]">
            {/* The reason is required for TWO readers, which is why it is not
                optional: it is stored on the proposal, and it is sent back to
                the agent so it can react instead of proposing the same list. */}
            <span className="text-[12px] leading-[1.5] text-fg-muted">
              Why? This is kept with the proposal, and the agent is told so it
              can try something else.
            </span>
            <Input
              value={reason}
              autoFocus
              placeholder="These are add-ons; the request only asks for the base licence."
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </Dialog>
      )}
    </Card>
  );
}
