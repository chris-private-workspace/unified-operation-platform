import { useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useCatalog, useDrift } from '@/hooks/queries';
import { useReconcile } from '@/hooks/mutations';
import type { DriftAlert } from '@/lib/api-types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { Toast } from '@/components/ui/toast';
import { formatDateTime, signed } from '@/lib/format';
import { cn } from '@/lib/utils';

// Total-level drift only (方案甲 / DESIGN §5): every alert is a tenant-total
// mismatch, so Scope is always "Tenant" (no per-OpCo attribution). `note` is not
// written by reconcile yet, so it is not shown. Resolve is automatic on the next
// reconcile — there is no manual dismiss endpoint, hence no per-row action.
const COLUMNS = [
  'SKU',
  'Scope',
  'Ledger sum',
  'Tenant used',
  'Delta',
  'Detected',
] as const;

export function Drift() {
  const { data, isLoading, isError } = useDrift();
  const catalog = useCatalog();
  const reconcile = useReconcile();

  const alerts = data ?? [];
  const skuCount = catalog.data?.length ?? 0;

  // Toast auto-dismisses (~2.6s, design-system.md §1.4) — same pattern as
  // catalog.tsx. reconcile success shows the run summary; failure surfaces the
  // backend 503 message (Graph unavailable) via apiPost.
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);
  function flash(message: string, tone: 'ok' | 'danger') {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  }

  const runButton = (variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      onClick={() =>
        reconcile.mutate(undefined, {
          onSuccess: (res) =>
            flash(
              `Reconciliation complete · checked ${res.checked} · opened ${res.opened} · resolved ${res.resolved}`,
              'ok',
            ),
          onError: (err) => flash((err as Error).message, 'danger'),
        })
      }
      disabled={reconcile.isPending}
    >
      <RefreshCw
        size={14}
        className={reconcile.isPending ? 'animate-spin' : ''}
      />
      Run reconciliation now
    </Button>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Reconciliation header card — the view's single primary action (DS-3) */}
      <Card className="flex items-center justify-between gap-[16px] p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[15px] font-semibold tracking-[-.02em]">
            Reconciliation
          </h1>
          <p className="text-[12.5px] text-fg-muted">
            Total-level check — tenant consumption vs the ledger.{' '}
            <span className="font-mono">{alerts.length}</span> open{' '}
            {alerts.length === 1 ? 'alert' : 'alerts'} ·{' '}
            <span className="font-mono">{skuCount}</span> active SKUs
          </p>
        </div>
        {runButton('primary')}
      </Card>

      {/* query states */}
      {isLoading && <Loading label="Loading drift alerts…" />}
      {isError && <LoadError />}

      {/* all-clear */}
      {!isLoading && !isError && alerts.length === 0 && (
        <Card className="p-0">
          <EmptyState
            tone="ok"
            icon={<CheckCircle2 size={18} strokeWidth={2} />}
            title="No open drift alerts"
            description="The ledger matches tenant consumption across every checked SKU."
            action={runButton('secondary')}
          />
        </Card>
      )}

      {/* drift table */}
      {alerts.length > 0 && (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-panel">
                {COLUMNS.map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-[18px] py-[11px] text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle',
                      // Ledger sum / Tenant used / Delta are numeric → right
                      i >= 2 && i <= 4 ? 'text-right' : 'text-left',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <DriftRow key={alert.id} alert={alert} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}

function DriftRow({ alert }: { alert: DriftAlert }) {
  // delta = tenantConsumed − ledgerAssignedSum. > 0 → tenant used seats the
  // ledger never recorded (danger); < 0 → ledger ahead of the tenant (warn).
  const overConsumed = alert.delta > 0;
  return (
    <tr className="border-b border-border last:border-0 hover:bg-hover">
      <td className="px-[18px] py-[11px]">
        <div className="flex flex-col gap-[1px]">
          <span className="text-[13px] font-medium">
            {alert.sku.displayName}
          </span>
          <span className="font-mono text-[11px] text-fg-subtle">
            {alert.sku.skuPartNumber}
          </span>
        </div>
      </td>
      <td className="px-[18px] py-[11px]">
        <Badge tone="neutral">Tenant</Badge>
      </td>
      <td className="px-[18px] py-[11px] text-right font-mono text-[12.5px]">
        {alert.ledgerAssignedSum}
      </td>
      <td className="px-[18px] py-[11px] text-right font-mono text-[12.5px]">
        {alert.tenantConsumed}
      </td>
      <td className="px-[18px] py-[11px] text-right">
        <Badge tone={overConsumed ? 'danger' : 'warn'} className="font-mono">
          {signed(alert.delta)}
        </Badge>
      </td>
      <td className="px-[18px] py-[11px] font-mono text-[12px] text-fg-muted">
        {formatDateTime(alert.detectedAt)}
      </td>
    </tr>
  );
}
