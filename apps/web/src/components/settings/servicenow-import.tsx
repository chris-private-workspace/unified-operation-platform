import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import { useServiceNowImport, useServiceNowLookup } from '@/hooks/mutations';
import { useCatalog, useOpcos } from '@/hooks/queries';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { ApiError } from '@/lib/api';
import type { ServiceNowLookupResult } from '@/lib/api-types';

/**
 * CH-013 / ADR-0021 — import a real ServiceNow REQ as a platform request.
 *
 * Two steps, because the operator cannot answer step two before seeing step
 * one: type a REQ number → the server walks it down to its RITMs and their
 * active catalog task counts → pick a SKU per RITM and import.
 *
 * 🔴 The licence code is NEVER guessed. A RITM title ("Create a new O365 user
 * license maintenance request") has no mechanical relationship to a platform
 * skuPartNumber ("SPE_E5"), so there is nothing honest to prefill (ADR-0021 D4).
 *
 * ADMIN only, and hidden rather than disabled for anyone else (D3) — a control
 * you can see but never use is just a question you cannot answer.
 */

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

export function ServiceNowImportPanel() {
  const { role } = useCurrentUser();

  const [reqNumber, setReqNumber] = useState('');
  const [result, setResult] = useState<ServiceNowLookupResult | null>(null);
  /** RITM number → chosen SkuCatalog.skuId (GUID). Absent = not selected. */
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [opcoCode, setOpcoCode] = useState('');
  const [targetUpn, setTargetUpn] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const lookup = useServiceNowLookup();
  const importReq = useServiceNowImport();
  const opcos = useOpcos();
  const catalog = useCatalog();

  const skuOptions = useMemo(
    () => (catalog.data ?? []).filter((s) => s.active),
    [catalog.data],
  );

  // Toast owns no timer of its own (FE-3) — the caller dismisses it.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (role !== 'ADMIN') return null;

  const reset = () => {
    setResult(null);
    setPicks({});
  };

  const runLookup = () => {
    const req = reqNumber.trim();
    if (!req) return;
    reset();
    lookup.mutate(req, {
      onSuccess: (data) => setResult(data),
      onError: (err) =>
        setToast({
          message:
            err instanceof ApiError
              ? err.message
              : 'Could not reach ServiceNow.',
          tone: 'danger',
        }),
    });
  };

  const selected = result
    ? result.items.filter((i) => i.importable && picks[i.number])
    : [];

  const runImport = () => {
    if (!result) return;
    importReq.mutate(
      {
        reqNumber: result.number,
        opcoCode,
        targetUpn: targetUpn.trim(),
        items: selected.map((i) => ({
          ritmNumber: i.number,
          skuId: picks[i.number],
        })),
      },
      {
        onSuccess: (created) => {
          setToast({
            message: `${result.number} imported — request ${created.serviceNowNumber ?? created.id} is now in the platform.`,
            tone: 'ok',
          });
          setReqNumber('');
          setTargetUpn('');
          reset();
        },
        onError: (err) =>
          setToast({
            message: err instanceof ApiError ? err.message : 'Import failed.',
            tone: 'danger',
          }),
      },
    );
  };

  const canImport =
    selected.length > 0 &&
    opcoCode !== '' &&
    targetUpn.trim() !== '' &&
    !importReq.isPending;

  return (
    <Card title="Import request from ServiceNow">
      <div className="flex flex-col gap-[14px]">
        <p className="text-[11.5px] leading-[1.5] text-fg-subtle">
          Turn a real ServiceNow request into a platform request. Used when n8n
          did not deliver one — a missed push, a failed run, or a ticket that
          needs re-sending. The licence is not guessed: pick it per item below.
        </p>

        {/* Step 1 — the REQ number is all the operator has. */}
        <div className="flex items-end gap-[10px]">
          <div className="flex-1">
            <Field label="ServiceNow request number">
              <Input
                value={reqNumber}
                placeholder="REQ0044038"
                className="font-mono"
                onChange={(e) => setReqNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runLookup();
                }}
              />
            </Field>
          </div>
          <Button
            variant="secondary"
            icon={<Search size={15} strokeWidth={2} />}
            onClick={runLookup}
            disabled={!reqNumber.trim() || lookup.isPending}
          >
            {lookup.isPending ? 'Looking up…' : 'Look up'}
          </Button>
        </div>

        {result && (
          <>
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center gap-[8px]">
                <span className="font-mono text-[13px] text-fg">
                  {result.number}
                </span>
                <span className="font-mono text-[11.5px] text-fg-subtle">
                  {result.openedAt}
                </span>
              </div>
              {result.shortDescription && (
                <span className="text-[12px] text-fg-muted">
                  {result.shortDescription}
                </span>
              )}
            </div>

            {result.items.length === 0 ? (
              <p className="text-[12px] text-fg-muted">
                This request has no items, so there is nothing to import.
              </p>
            ) : (
              <div className="flex flex-col gap-[10px]">
                {result.items.map((item) => (
                  <div
                    key={item.number}
                    className="flex flex-col gap-[8px] rounded-[10px] border border-border p-[12px]"
                  >
                    <div className="flex items-start justify-between gap-[10px]">
                      <div className="flex flex-col gap-[2px]">
                        <span className="font-mono text-[12.5px] text-fg">
                          {item.number}
                        </span>
                        <span className="text-[12px] text-fg-muted">
                          {item.title || '(no description)'}
                        </span>
                      </div>
                      <Badge tone={item.importable ? 'ok' : 'danger'}>
                        {item.activeTaskCount} active task
                        {item.activeTaskCount === 1 ? '' : 's'}
                      </Badge>
                    </div>

                    {item.importable ? (
                      <Field label="Licence to fulfil">
                        <Select
                          value={picks[item.number] ?? ''}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [item.number]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select a SKU…</option>
                          {skuOptions.map((s) => (
                            <option key={s.id} value={s.skuId}>
                              {s.businessAlias
                                ? `${s.businessAlias} — ${s.skuPartNumber}`
                                : s.skuPartNumber}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      // Why it cannot be imported, in the server's own words —
                      // the same rule that would otherwise fail one assign later.
                      <div className="flex items-start gap-[6px] text-[11.5px] leading-[1.5] text-fg-muted">
                        <AlertTriangle
                          size={14}
                          strokeWidth={2}
                          className="mt-[1px] shrink-0 text-danger"
                        />
                        <span>{item.blockedReason}</span>
                      </div>
                    )}

                    {item.tasks.length > 0 && (
                      <div className="flex flex-wrap gap-[6px]">
                        {item.tasks.map((t) => (
                          <span
                            key={t.number}
                            className="font-mono text-[11px] text-fg-subtle"
                          >
                            {t.number} · state {t.state}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Step 2 — what ServiceNow cannot tell us. */}
            <div className="grid grid-cols-2 gap-[10px]">
              <Field label="OpCo">
                <Select
                  value={opcoCode}
                  onChange={(e) => setOpcoCode(e.target.value)}
                >
                  <option value="">Select an OpCo…</option>
                  {/* GET /opcos is the picker projection (code + name only);
                      the backend is what validates the chosen code. */}
                  {(opcos.data ?? []).map((o) => (
                    <option key={o.id} value={o.code}>
                      {o.code} — {o.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Target user (UPN)">
                <Input
                  value={targetUpn}
                  placeholder="new.hire@rapo.com.hk"
                  className="font-mono"
                  onChange={(e) => setTargetUpn(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex items-center gap-[10px]">
              <Button
                variant="primary"
                icon={
                  importReq.isPending ? (
                    <ArrowRight size={15} strokeWidth={2} />
                  ) : (
                    <Check size={15} strokeWidth={2} />
                  )
                }
                onClick={runImport}
                disabled={!canImport}
              >
                {importReq.isPending
                  ? 'Importing…'
                  : `Import ${selected.length} item${selected.length === 1 ? '' : 's'}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  setReqNumber('');
                }}
                disabled={importReq.isPending}
              >
                Cancel
              </Button>
              <span className="text-[11.5px] text-fg-subtle">
                The sync gate stays closed — assignment still waits for Entra.
              </span>
            </div>
          </>
        )}
      </div>

      {/* Toast carries no timer of its own — the effect above owns dismissal. */}
      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </Card>
  );
}
