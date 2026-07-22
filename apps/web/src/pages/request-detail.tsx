import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ExternalLink,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Stepper } from '@/components/ui/stepper';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { Loading } from '@/components/ui/feedback-states';
import { useCatalog, useRequest } from '@/hooks/queries';
import {
  useAddLineItem,
  useAdvanceStage,
  useAssignLineItem,
  useMarkSynced,
  useRemoveLineItem,
  useUpdateRequest,
} from '@/hooks/mutations';
// Shared with the Overview feed (CH-006) so the same event cannot read as
// routine on one screen and notable on the other.
import { EVENT_TONE } from '@/lib/activity';
import {
  canAddLine,
  canEditUpn,
  canRemoveLine,
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
  const update = useUpdateRequest(id ?? '');
  const addLine = useAddLineItem(id ?? '');
  const removeLine = useRemoveLineItem(id ?? '');
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);
  // CH-007 header edit: null = not editing; object = the working form.
  const [form, setForm] = useState<{
    targetUpn: string;
    targetDisplayName: string;
    requesterEmail: string;
    rawRequestText: string;
  } | null>(null);
  // CH-007 add-line: null = closed; object = the working new line.
  const [newLine, setNewLine] = useState<{
    skuCatalogId: string;
    qty: number;
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
  const pending =
    advance.isPending ||
    assign.isPending ||
    markSynced.isPending ||
    update.isPending ||
    addLine.isPending ||
    removeLine.isPending;

  function startEdit() {
    setForm({
      targetUpn: req.targetUpn,
      targetDisplayName: req.targetDisplayName ?? '',
      requesterEmail: req.requesterEmail ?? '',
      rawRequestText: req.rawRequestText ?? '',
    });
  }

  function saveHeader() {
    if (!form) return;
    // Send only what changed; the backend ignores no-ops but this also keeps a
    // sync-locked UPN out of the payload entirely (belt and braces with D2).
    const body: Record<string, string> = {};
    if (canEditUpn(req) && form.targetUpn !== req.targetUpn)
      body.targetUpn = form.targetUpn;
    if (form.targetDisplayName !== (req.targetDisplayName ?? ''))
      body.targetDisplayName = form.targetDisplayName;
    if (form.requesterEmail !== (req.requesterEmail ?? ''))
      body.requesterEmail = form.requesterEmail;
    if (form.rawRequestText !== (req.rawRequestText ?? ''))
      body.rawRequestText = form.rawRequestText;
    update.mutate(body, {
      onSuccess: () => {
        flash('Request updated', 'ok');
        setForm(null);
      },
      onError,
    });
  }

  function addLineItem() {
    if (!newLine?.skuCatalogId) return;
    addLine.mutate(
      { skuCatalogId: newLine.skuCatalogId, quantity: newLine.qty },
      {
        onSuccess: () => {
          flash('Line item added', 'ok');
          setNewLine(null);
        },
        onError,
      },
    );
  }

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
          <div className="flex shrink-0 flex-col items-end gap-[8px]">
            {req.serviceNowNumber && (
              // Sync key — read-only always (D4). This is the field that must
              // never change, so it is deliberately not part of edit mode.
              <span className="flex items-center gap-[6px] rounded-md border border-border bg-card px-[10px] py-[6px] text-[11.5px] text-fg-muted">
                ServiceNow{' '}
                <span className="font-mono text-fg">
                  {req.serviceNowNumber}
                </span>
                <ExternalLink
                  size={13}
                  strokeWidth={2}
                  className="text-fg-subtle"
                />
              </span>
            )}
            {!form ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={startEdit}
                disabled={pending}
              >
                <Pencil size={13} strokeWidth={2} /> Edit
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm(null)}
                disabled={pending}
              >
                <X size={13} strokeWidth={2} /> Cancel
              </Button>
            )}
          </div>
        </div>

        {form && (
          <div className="mt-[16px] flex flex-col gap-[12px] rounded-[10px] border border-border bg-hover px-[14px] py-[14px]">
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
              <EditField label="Display name">
                <Input
                  value={form.targetDisplayName}
                  onChange={(e) =>
                    setForm({ ...form, targetDisplayName: e.target.value })
                  }
                  placeholder="New User"
                />
              </EditField>
              <EditField
                label="Target UPN"
                hint={
                  !canEditUpn(req)
                    ? 'Locked — the account has synced; UPN is the assignment key'
                    : undefined
                }
              >
                <Input
                  value={form.targetUpn}
                  onChange={(e) =>
                    setForm({ ...form, targetUpn: e.target.value })
                  }
                  disabled={!canEditUpn(req)}
                  className="font-mono"
                />
              </EditField>
              <EditField label="Requester email">
                <Input
                  type="email"
                  value={form.requesterEmail}
                  onChange={(e) =>
                    setForm({ ...form, requesterEmail: e.target.value })
                  }
                  placeholder="requester@rapo.com.hk"
                />
              </EditField>
              <EditField label="Remark">
                <Input
                  value={form.rawRequestText}
                  onChange={(e) =>
                    setForm({ ...form, rawRequestText: e.target.value })
                  }
                  placeholder="Context for this request"
                />
              </EditField>
            </div>
            <div className="flex justify-end gap-[8px]">
              <Button
                variant="secondary"
                size="sm"
                onClick={saveHeader}
                disabled={pending}
              >
                <Check size={13} strokeWidth={2} /> Save changes
              </Button>
            </div>
          </div>
        )}

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
              <div className="flex items-center gap-[10px]">
                <span className="text-[11.5px] text-fg-subtle">
                  {req.lineItems.length} SKUs
                </span>
                {/* Add only on intake requests — platform-created is already
                    fully in ServiceNow (CH-007 D6). canAddLine mirrors the
                    backend gate; the server still 409s if this drifts. */}
                {canAddLine(req) && !newLine && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setNewLine({ skuCatalogId: '', qty: 1 })}
                  >
                    <Plus size={13} strokeWidth={2} /> Add line item
                  </Button>
                )}
              </div>
            }
          >
            {newLine && (
              <div className="flex flex-wrap items-end gap-[10px] border-b border-border bg-hover px-[16px] py-[12px]">
                <div className="flex min-w-[200px] flex-1 flex-col gap-[4px]">
                  <label className="text-[11.5px] text-fg-muted">SKU</label>
                  <Select
                    value={newLine.skuCatalogId}
                    onChange={(e) =>
                      setNewLine({ ...newLine, skuCatalogId: e.target.value })
                    }
                  >
                    <option value="">Select a SKU…</option>
                    {(catalog.data ?? [])
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="flex w-[84px] flex-col gap-[4px]">
                  <label className="text-[11.5px] text-fg-muted">Qty</label>
                  <Input
                    type="number"
                    min={1}
                    value={newLine.qty}
                    onChange={(e) =>
                      setNewLine({
                        ...newLine,
                        qty: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="font-mono"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending || !newLine.skuCatalogId}
                  onClick={addLineItem}
                >
                  <Check size={13} strokeWidth={2} /> Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setNewLine(null)}
                >
                  <X size={13} strokeWidth={2} /> Cancel
                </Button>
              </div>
            )}
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
                          {/* Remove only an unsent REQUESTED line (D5). Locked
                              lines show NO trash at all — not a disabled one —
                              so the UI never implies the lock can be undone. */}
                          {canRemoveLine(item) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              title="Remove this line item"
                              onClick={() =>
                                removeLine.mutate(item.id, {
                                  onSuccess: () =>
                                    flash('Line item removed', 'ok'),
                                  onError,
                                })
                              }
                            >
                              <Trash2
                                size={13}
                                strokeWidth={2}
                                className="text-danger"
                              />
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
              <div className="flex flex-col">
                {req.events.map((ev, i) => (
                  <div key={ev.id} className="flex gap-[11px]">
                    {/* dot + vertical connector to the next event (prototype) */}
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full',
                          DOT[EVENT_TONE[ev.type]],
                        )}
                      />
                      {i < req.events.length - 1 && (
                        <span className="w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col pb-[14px] leading-[1.35]">
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

/** One labelled field in the header edit panel (CH-007). */
function EditField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[4px]">
      <label className="text-[11.5px] text-fg-muted">{label}</label>
      {children}
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
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
