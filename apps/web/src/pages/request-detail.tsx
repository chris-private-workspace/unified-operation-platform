import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ExternalLink, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Stepper } from '@/components/ui/stepper';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { Loading } from '@/components/ui/feedback-states';
import { useCatalog, useRequest } from '@/hooks/queries';
import {
  useAdvanceStage,
  useAssignLineItem,
  useMarkSynced,
} from '@/hooks/mutations';
import type { EventType } from '@/lib/api-types';
import {
  deriveStatus,
  nextStage,
  STAGE_LABEL,
  STAGE_TONE,
  stepsFor,
} from '@/lib/requests';
import { formatDateTime } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const EVENT_TONE: Record<EventType, BadgeTone> = {
  STAGE_CHANGE: 'info',
  ASSIGN: 'ok',
  SYNC: 'info',
  RECONCILE: 'warn',
  NOTE: 'neutral',
};
const DOT: Record<BadgeTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  info: 'bg-info',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  purple: 'bg-purple',
};

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detail = useRequest(id);
  const catalog = useCatalog();
  const advance = useAdvanceStage(id ?? '');
  const assign = useAssignLineItem(id ?? '');
  const markSynced = useMarkSynced(id ?? '');
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  function flash(message: string, tone: 'ok' | 'danger') {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  }
  const onError = (e: unknown) =>
    flash(e instanceof ApiError ? e.message : 'Something went wrong', 'danger');

  const baseBySkuId = useMemo(
    () => new Map((catalog.data ?? []).map((s) => [s.skuId, s.isBaseLicense])),
    [catalog.data],
  );

  if (detail.isLoading) return <Loading label="Loading request…" />;
  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        tone="danger"
        title="Request not found"
        description="This request could not be loaded. It may have been removed."
        action={
          <Button size="sm" onClick={() => navigate('/requests')}>
            Back to requests
          </Button>
        }
      />
    );
  }

  const req = detail.data;
  const status = deriveStatus(req);
  const synced = Boolean(req.azureSyncedAt);
  const pending = advance.isPending || assign.isPending || markSynced.isPending;

  return (
    <div className="flex flex-col gap-[16px]">
      <button
        onClick={() => navigate('/requests')}
        className="flex w-fit items-center gap-[5px] text-[12.5px] font-medium text-fg-muted hover:text-fg"
      >
        <ChevronLeft size={15} strokeWidth={2} /> Requests
      </button>

      {/* Header + sync gate */}
      <Card>
        <div className="flex items-start justify-between gap-[16px]">
          <div className="flex gap-[14px]">
            <Avatar
              name={req.targetDisplayName ?? req.targetUpn}
              size={44}
              variant="brand"
            />
            <div className="flex flex-col gap-[3px]">
              <div className="flex items-center gap-[10px]">
                <h1 className="text-[18px] font-semibold">
                  {req.targetDisplayName ?? req.targetUpn}
                </h1>
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </div>
              <div className="font-mono text-[12.5px] text-fg-muted">
                {req.targetUpn}
              </div>
              <div className="mt-[4px] flex flex-wrap gap-x-[16px] gap-y-[2px] text-[11.5px] text-fg-subtle">
                <span>
                  OpCo{' '}
                  <span className="font-mono text-fg-muted">
                    {req.opco?.code ?? '—'}
                  </span>
                </span>
                <span>
                  Handler{' '}
                  <span className="text-fg-muted">
                    {req.handledById ? 'Assigned' : 'Unassigned'}
                  </span>
                </span>
                <span>
                  Request{' '}
                  <span className="font-mono text-fg-muted">
                    {req.serviceNowNumber ?? `#${req.id.slice(-6)}`}
                  </span>
                </span>
              </div>
            </div>
          </div>
          {req.serviceNowNumber && (
            <span className="flex items-center gap-[6px] rounded-md border border-border bg-card px-[10px] py-[6px] text-[11.5px] text-fg-muted">
              ServiceNow{' '}
              <span className="font-mono text-fg">{req.serviceNowNumber}</span>
              <ExternalLink
                size={13}
                strokeWidth={2}
                className="text-fg-subtle"
              />
            </span>
          )}
        </div>

        <div className="mt-[16px] flex items-center gap-[14px] rounded-[10px] border border-border bg-hover px-[14px] py-[12px]">
          <SyncStep
            done={Boolean(req.accountCreatedAt)}
            title="Account created"
            sub="in shared tenant"
          />
          <div className="h-[2px] w-[60px] shrink-0 rounded bg-border-strong" />
          <SyncStep
            done={synced}
            title="Synced to Azure AD"
            sub="directory replication"
          />
          <div className="ml-auto">
            {synced ? (
              <span className="text-[12.5px] font-medium text-ok">
                Ready to assign
              </span>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  markSynced.mutate(undefined, {
                    onSuccess: () => flash('Marked as synced', 'ok'),
                    onError,
                  })
                }
              >
                Mark synced
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-3">
        <div className="flex flex-col gap-[16px] lg:col-span-2">
          {req.rawRequestText && (
            <Card
              title="Request remark"
              action={
                <span className="text-[11px] text-fg-subtle">
                  from ServiceNow · free text
                </span>
              }
            >
              <blockquote className="rounded-r-[8px] border-l-[3px] border-accent-line bg-hover px-[14px] py-[12px] text-[13px] italic text-fg-muted">
                “{req.rawRequestText}”
              </blockquote>
            </Card>
          )}

          <Card
            title="Line items"
            padded={false}
            action={
              <span className="text-[11.5px] text-fg-subtle">
                {req.lineItems.length} SKUs
              </span>
            }
          >
            {req.lineItems.length === 0 ? (
              <EmptyState
                title="No line items"
                description="Nothing has been added to this request yet."
              />
            ) : (
              req.lineItems.map((item) => {
                const steps = stepsFor(item);
                const stepNo = steps.indexOf(item.stage) + 1;
                const next = nextStage(item);
                const cancelled = item.stage === 'CANCELLED';
                const isReady = item.stage === 'READY';
                const canAssign = isReady && synced;
                const isBase = item.sku
                  ? baseBySkuId.get(item.sku.skuId)
                  : false;
                const pathLabel = item.procurementRequired
                  ? `Procurement path${item.quoteRef ? ` · ref ${item.quoteRef}` : ''}`
                  : 'Short path · no quote/PO';
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-[12px] border-b border-border px-[16px] py-[14px] last:border-0"
                  >
                    <div className="flex min-w-0 flex-col gap-[8px]">
                      <div className="flex items-center gap-[8px]">
                        <span className="font-semibold">
                          {item.sku?.displayName ?? item.skuCatalogId}
                        </span>
                        {isBase && <Badge tone="info">BASE</Badge>}
                        <span className="font-mono text-[11.5px] text-fg-subtle">
                          ×{item.quantity}
                        </span>
                      </div>
                      <span className="text-[11.5px] text-fg-subtle">
                        {pathLabel}
                      </span>
                      {!cancelled && (
                        <div className="mt-[2px] flex items-center gap-[10px]">
                          <Stepper steps={steps} current={item.stage} />
                          <span className="font-mono text-[11px] text-fg-subtle">
                            Step {stepNo}/{steps.length}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-[8px]">
                      <Badge tone={STAGE_TONE[item.stage]}>
                        {cap(STAGE_LABEL[item.stage])}
                      </Badge>
                      {!cancelled && (
                        <div className="flex items-center gap-[8px]">
                          {next && !isReady && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                advance.mutate(
                                  { lineItemId: item.id, toStage: next },
                                  {
                                    onSuccess: () =>
                                      flash(
                                        `Advanced to ${STAGE_LABEL[next]}`,
                                        'ok',
                                      ),
                                    onError,
                                  },
                                )
                              }
                            >
                              Advance stage
                            </Button>
                          )}
                          {isReady && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!canAssign || pending}
                              title={
                                !synced
                                  ? 'Blocked — account not synced to Azure AD'
                                  : undefined
                              }
                              onClick={() =>
                                assign.mutate(
                                  { lineItemId: item.id },
                                  {
                                    onSuccess: () =>
                                      flash('License assigned', 'ok'),
                                    onError,
                                  },
                                )
                              }
                            >
                              {synced ? 'Assign now' : 'Blocked · sync'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[16px]">
          <Card
            title={
              <span className="flex items-center gap-[8px]">
                <Sparkles size={16} strokeWidth={2} className="text-purple" />
                AI Assist
              </span>
            }
            action={<Badge tone="purple">Preview</Badge>}
          >
            <EmptyState
              icon={<Sparkles size={18} strokeWidth={2} />}
              title="Coming soon"
              description="Parsing the free-text remark into SKU suggestions is a planned AI feature — not yet available."
            />
          </Card>

          <Card title="Operational history">
            {req.events.length === 0 ? (
              <EmptyState
                title="No history yet"
                description="Events appear as this request progresses."
              />
            ) : (
              <div className="flex flex-col gap-[14px]">
                {req.events.map((ev) => (
                  <div key={ev.id} className="flex gap-[10px]">
                    <span
                      className={cn(
                        'mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full',
                        DOT[EVENT_TONE[ev.type]],
                      )}
                    />
                    <div className="flex min-w-0 flex-col leading-[1.35]">
                      <span className="text-[12.5px]">
                        {ev.message ??
                          (ev.fromStage && ev.toStage
                            ? `${ev.fromStage} → ${ev.toStage}`
                            : ev.type)}
                      </span>
                      <span className="font-mono text-[11px] text-fg-subtle">
                        {formatDateTime(ev.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}

function SyncStep({
  done,
  title,
  sub,
}: {
  done: boolean;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-[10px]">
      <span
        className={cn(
          'flex h-[22px] w-[22px] items-center justify-center rounded-full border',
          done
            ? 'border-ok bg-ok-soft text-ok'
            : 'border-border-strong text-fg-subtle',
        )}
      >
        {done && <Check size={13} strokeWidth={2.5} />}
      </span>
      <div className="flex flex-col leading-[1.25]">
        <span className="text-[12.5px] font-medium">{title}</span>
        <span className="text-[11px] text-fg-subtle">{sub}</span>
      </div>
    </div>
  );
}
