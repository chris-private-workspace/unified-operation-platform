import { useState } from 'react';
import { Building2, Plus, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { Toast } from '@/components/ui/toast';
import { useManageOpcos } from '@/hooks/queries';
import { useCreateOpco, useUpdateOpco } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Opco } from '@/lib/api-types';

type Flash = (message: string, tone: 'ok' | 'danger') => void;

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

// Add / Edit OpCo. code is the stable business key: set on Add, read-only on
// Edit (D3). company + costCenter are the real data-model split; status toggles
// deactivate (never a hard delete — OpCo is referenced by ledger / requests).
function OpcoDialog({
  opco,
  onClose,
  flash,
}: {
  opco: Opco | null; // null = add mode
  onClose: () => void;
  flash: Flash;
}) {
  const create = useCreateOpco();
  const update = useUpdateOpco();
  const [code, setCode] = useState(opco?.code ?? '');
  const [displayName, setDisplayName] = useState(opco?.displayName ?? '');
  const [company, setCompany] = useState(opco?.company ?? '');
  const [costCenter, setCostCenter] = useState(opco?.costCenter ?? '');
  const [active, setActive] = useState(opco?.active ?? true);

  const isEdit = opco !== null;
  const pending = create.isPending || update.isPending;
  const invalid =
    !displayName.trim() || !company.trim() || (!isEdit && !code.trim());

  const submit = () => {
    if (invalid) return;
    const onSuccess = (label: string) => () => {
      flash(label, 'ok');
      onClose();
    };
    const onError = (e: unknown) =>
      flash(e instanceof Error ? e.message : 'Could not save OpCo', 'danger');

    if (isEdit) {
      update.mutate(
        { id: opco.id, body: { displayName, company, costCenter, active } },
        { onSuccess: onSuccess(`Updated ${opco.code}`), onError },
      );
    } else {
      create.mutate(
        { code, displayName, company, costCenter },
        { onSuccess: onSuccess(`Created ${code.trim()}`), onError },
      );
    }
  };

  return (
    <Dialog
      open
      title={isEdit ? `Edit ${opco.code}` : 'Add OpCo'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={invalid || pending}
            onClick={submit}
          >
            {isEdit ? 'Save changes' : 'Add OpCo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        {isEdit ? (
          // code is system-owned (business key) — read-only on edit.
          <div className="flex flex-col gap-[3px] rounded-md border border-border bg-hover px-[12px] py-[9px]">
            <span className="font-mono text-[13px] font-medium">
              {opco.code}
            </span>
            <span className="text-[11.5px] text-fg-subtle">
              Code is the OpCo’s stable key and can’t be changed.
            </span>
          </div>
        ) : (
          <Field label="Code">
            <Input
              value={code}
              placeholder="e.g. RAPO/IT"
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        )}
        <Field label="Display name">
          <Input
            value={displayName}
            placeholder="e.g. RAPO — IT"
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="Company">
          <Input
            value={company}
            placeholder="e.g. RAPO"
            onChange={(e) => setCompany(e.target.value)}
          />
        </Field>
        <Field label="Cost center">
          <Input
            value={costCenter}
            placeholder="e.g. IT (optional)"
            onChange={(e) => setCostCenter(e.target.value)}
          />
        </Field>
        {isEdit && (
          <Field label="Status">
            <SegmentedControl
              options={['Active', 'Disabled'] as const}
              value={active ? 'Active' : 'Disabled'}
              onChange={(v) => setActive(v === 'Active')}
            />
          </Field>
        )}
        <p className="text-[11.5px] leading-[1.5] text-fg-subtle">
          {isEdit
            ? 'Disabling an OpCo hides it from pickers and asset views; its history is kept.'
            : 'New OpCos appear across License Assets automatically. The code can’t be changed later.'}
        </p>
      </div>
    </Dialog>
  );
}

// Operating companies (CH-004) — the OpCo management console. ADMIN / REGIONAL at
// the backend; a non-privileged caller 403s and sees a restricted state (honest,
// no fabricated rows — same pattern as Users & roles / Assets Platform mode).
export function OpcosPanel() {
  const opcosQuery = useManageOpcos();
  const [dialog, setDialog] = useState<'add' | { edit: Opco } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const flash: Flash = (message, tone) => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  if (opcosQuery.isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-card">
        <Loading />
      </div>
    );
  }

  if (opcosQuery.isError) {
    const forbidden =
      opcosQuery.error instanceof ApiError && opcosQuery.error.status === 403;
    return (
      <div className="rounded-[12px] border border-border bg-card">
        {forbidden ? (
          <EmptyState
            icon={<ShieldAlert size={18} strokeWidth={2} />}
            title="Access required"
            description="Managing operating companies is limited to platform admins and regional operators."
          />
        ) : (
          <LoadError description="Couldn't load OpCos. Check the API is running, then retry." />
        )}
      </div>
    );
  }

  const rows = opcosQuery.data ?? [];
  const activeCount = rows.filter((o) => o.active).length;

  return (
    <div className="flex flex-col gap-[16px]">
      <Card
        padded={false}
        title="Operating companies"
        subtitle={`${activeCount} active · shared tenant. New OpCos appear across License Assets automatically.`}
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={15} strokeWidth={2} />}
            onClick={() => setDialog('add')}
          >
            Add OpCo
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 size={18} strokeWidth={2} />}
            title="No OpCos yet"
            description="Add the first operating company to get started."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Code</th>
                  <th className={TH}>Display name</th>
                  <th className={TH}>Company</th>
                  <th className={TH}>Cost center</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className={cn(TD, 'font-mono text-[12px] font-medium')}>
                      {o.code}
                    </td>
                    <td className={cn(TD, 'font-medium')}>{o.displayName}</td>
                    <td className={cn(TD, 'text-fg-muted')}>{o.company}</td>
                    <td className={TD}>
                      {o.costCenter ? (
                        <span className="font-mono text-[12px] text-fg-muted">
                          {o.costCenter}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className={TD}>
                      <Badge tone={o.active ? 'ok' : 'neutral'} dot>
                        {o.active ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDialog({ edit: o })}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog === 'add' && (
        <OpcoDialog opco={null} onClose={() => setDialog(null)} flash={flash} />
      )}
      {dialog && dialog !== 'add' && (
        <OpcoDialog
          opco={dialog.edit}
          onClose={() => setDialog(null)}
          flash={flash}
        />
      )}

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}
