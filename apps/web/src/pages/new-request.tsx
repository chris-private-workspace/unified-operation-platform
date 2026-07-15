import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { Toast } from '@/components/ui/toast';
import { useCatalog, useMe, useOpcos } from '@/hooks/queries';
import { useCreateRequest } from '@/hooks/mutations';
import {
  emptyNewRequest,
  validateNewRequest,
  type NewRequestForm,
} from '@/lib/new-request';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] text-fg-muted">{label}</label>
      {children}
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </div>
  );
}

/**
 * Phase 乙 — IT opens a standalone license request. Creates a ServiceNow ticket
 * (backend provider) + a local mirror. IT operator action (ADR-0008 D1), not an
 * end-user self-service form. OPCO_IT is locked to its own OpCo; the backend
 * re-enforces scope + SKU validity and surfaces its error via toast.
 */
export function NewRequest() {
  const navigate = useNavigate();
  const me = useMe();
  const catalog = useCatalog();
  const opcos = useOpcos();
  const create = useCreateRequest();

  const isOpcoIt = me.data?.role === 'OPCO_IT';
  const lockedOpco = isOpcoIt ? (me.data?.opcoScope?.code ?? '') : '';

  const [form, setForm] = useState<NewRequestForm>(() =>
    emptyNewRequest(lockedOpco),
  );
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const set = (patch: Partial<NewRequestForm>) =>
    setForm((f) => ({ ...f, ...patch }));
  const setLine = (
    i: number,
    patch: Partial<NewRequestForm['lineItems'][number]>,
  ) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((l, idx) =>
        idx === i ? { ...l, ...patch } : l,
      ),
    }));
  const addLine = () =>
    setForm((f) => ({
      ...f,
      lineItems: [...f.lineItems, { skuId: '', quantity: 1 }],
    }));
  const removeLine = (i: number) =>
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.filter((_, idx) => idx !== i),
    }));

  // OPCO_IT: the OpCo is fixed to their scope (backend also enforces it).
  const effectiveOpco = isOpcoIt ? lockedOpco : form.opcoCode;
  const error = validateNewRequest({ ...form, opcoCode: effectiveOpco });

  const activeSkus = useMemo(
    () => (catalog.data ?? []).filter((s) => s.active),
    [catalog.data],
  );

  const submit = () => {
    if (error) return;
    create.mutate(
      {
        targetUpn: form.targetUpn.trim(),
        targetDisplayName: form.targetDisplayName.trim() || undefined,
        opcoCode: effectiveOpco,
        requesterEmail: form.requesterEmail.trim() || undefined,
        remark: form.remark.trim() || undefined,
        lineItems: form.lineItems.map((l) => ({
          skuId: l.skuId,
          quantity: l.quantity,
        })),
      },
      {
        onSuccess: (req) => navigate(`/requests/${req.id}`),
        onError: (e) =>
          setToast({
            message:
              e instanceof Error ? e.message : 'Could not create the request',
            tone: 'danger',
          }),
      },
    );
  };

  if (catalog.isLoading || opcos.isLoading) return <Loading />;
  if (catalog.isError || opcos.isError) {
    return (
      <LoadError description="Couldn't load SKU / OpCo options. Check the API is running, then retry." />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-[16px]">
      <div className="flex flex-col gap-[3px]">
        <h2 className="text-[15px] font-semibold text-fg">
          New license request
        </h2>
        <p className="text-[12.5px] text-fg-muted">
          Opens a ServiceNow ticket and a local record — for a standalone
          (non-onboarding) M365/D365 license request.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-[14px]">
          <Field label="Target user (UPN)">
            <Input
              value={form.targetUpn}
              placeholder="new.user@rapo.com.hk"
              onChange={(e) => set({ targetUpn: e.target.value })}
            />
          </Field>
          <Field label="Display name (optional)">
            <Input
              value={form.targetDisplayName}
              placeholder="New User"
              onChange={(e) => set({ targetDisplayName: e.target.value })}
            />
          </Field>
          <Field
            label="OpCo"
            hint={isOpcoIt ? 'Locked to your OpCo.' : undefined}
          >
            {isOpcoIt ? (
              <Input value={lockedOpco || '—'} disabled />
            ) : (
              <Select
                value={form.opcoCode}
                onChange={(e) => set({ opcoCode: e.target.value })}
              >
                <option value="">Select an OpCo…</option>
                {(opcos.data ?? []).map((o) => (
                  <option key={o.id} value={o.code}>
                    {o.code} — {o.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Requester email (optional)">
            <Input
              type="email"
              value={form.requesterEmail}
              placeholder="requester@rapo.com.hk"
              onChange={(e) => set({ requesterEmail: e.target.value })}
            />
          </Field>
          <Field
            label="Remark (optional)"
            hint="Free-text — becomes the ServiceNow request comment."
          >
            <Input
              value={form.remark}
              placeholder="Context for this request"
              onChange={(e) => set({ remark: e.target.value })}
            />
          </Field>

          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between">
              <label className="text-[12px] text-fg-muted">Licenses</label>
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus size={14} strokeWidth={2} />}
                onClick={addLine}
              >
                Add line
              </Button>
            </div>
            <div className="flex flex-col gap-[8px]">
              {form.lineItems.map((line, i) => (
                <div key={i} className="flex items-center gap-[8px]">
                  <div className="flex-1">
                    <Select
                      value={line.skuId}
                      onChange={(e) => setLine(i, { skuId: e.target.value })}
                    >
                      <option value="">Select a SKU…</option>
                      {activeSkus.map((s) => (
                        <option key={s.skuId} value={s.skuId}>
                          {s.displayName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-[84px]">
                    <Input
                      type="number"
                      min={1}
                      value={String(line.quantity)}
                      onChange={(e) =>
                        setLine(i, {
                          quantity: Math.max(
                            1,
                            Math.floor(Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </div>
                  {form.lineItems.length > 1 && (
                    <IconButton
                      title="Remove line"
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-[12px]">
        {error ? (
          <span className="text-[11.5px] text-fg-subtle">{error}</span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-[8px]">
          <Button variant="ghost" onClick={() => navigate('/requests')}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={Boolean(error) || create.isPending}
            onClick={submit}
          >
            {create.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </div>
      </div>

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}
