import { useState } from 'react';
import {
  Cable,
  Check,
  Info,
  RefreshCw,
  Settings2,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { useIntegrations } from '@/hooks/queries';
import { useTestConnection, useUpdateConnector } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  connectorStateLabel,
  connectorStateTone,
  lastSuccessText,
} from '@/lib/integrations';
import type { ConnectorField, ConnectorStatus } from '@/lib/api-types';

/**
 * Connector status + Test connection + non-secret config editing
 * (W30 + W34 / ADR-0010 item 4 + ADR-0013 Model C).
 *
 * Three things this panel is careful NOT to imply:
 *  - the state badge is deployment shape, not health (a failed probe leaves it
 *    alone — plan §9 Q3);
 *  - the timestamp is when the connector last *worked*, derived from domain
 *    data, not when it was last checked (ADR-0010 D4);
 *  - a SECRET is never editable and its value is never shown — only whether the
 *    deployment env has one (ADR-0013 D5). Editing is non-secret fields only,
 *    and takes effect on the next API restart (C2).
 *
 * Test / Configure / Save are `secondary`: the allocation import above is this
 * tab's one primary action (DS-3).
 */
export function IntegrationsPanel() {
  const { data, isLoading, isError, error } = useIntegrations();

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-card">
        <Loading label="Loading connectors…" />
      </div>
    );
  }

  if (isError) {
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <div className="rounded-[12px] border border-border bg-card">
        {forbidden ? (
          <EmptyState
            icon={<ShieldAlert size={18} strokeWidth={2} />}
            title="Access required"
            description="Connector status describes how the platform is wired to its vendors, so it is limited to platform admins."
          />
        ) : (
          <LoadError description="Couldn't load connector status. Check the API is running, then retry." />
        )}
      </div>
    );
  }

  const connectors = data ?? [];

  return (
    <Card
      padded={false}
      title="Connectors"
      subtitle="How this platform is wired to its vendors. Times show when a connector last succeeded — not when it was last checked."
    >
      {connectors.length === 0 ? (
        <EmptyState
          icon={<Cable size={18} strokeWidth={2} />}
          title="No connectors reported"
          description="The API returned an empty list."
        />
      ) : (
        <div className="flex flex-col">
          {connectors.map((c) => (
            <ConnectorRow key={c.key} connector={c} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ConnectorRow({ connector: c }: { connector: ConnectorStatus }) {
  const test = useTestConnection();
  const update = useUpdateConnector();
  const [probeError, setProbeError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const probe = c.lastProbe;
  const { editable, secrets } = c.config;
  const hasEditable = editable.length > 0;

  const openEditor = () => {
    // Seed the draft from the effective value (db-or-env); null → empty.
    setDraft(
      Object.fromEntries(editable.map((f) => [f.column, f.value ?? ''])),
    );
    setSaveError(null);
    setEditing(true);
  };

  const save = () => {
    setSaveError(null);
    // Send only fields the operator actually changed; empty clears the override.
    const values: Record<string, string | null> = {};
    for (const f of editable) {
      const next = (draft[f.column] ?? '').trim();
      if (next !== (f.value ?? ''))
        values[f.column] = next === '' ? null : next;
    }
    if (Object.keys(values).length === 0) {
      setEditing(false);
      return;
    }
    update.mutate(
      { key: c.key, values },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setSaveError((err as Error).message),
      },
    );
  };

  return (
    <div className="border-b border-border px-[16px] py-[11px] last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[13px] font-medium">{c.label}</span>
            <Badge tone={connectorStateTone(c.state)}>
              {connectorStateLabel(c.state)}
            </Badge>
          </div>

          <span className="font-mono text-[11px] text-fg-subtle">
            {lastSuccessText(
              c.lastSuccessAt,
              c.lastSuccessNote,
              formatDateTime,
            )}
          </span>

          {/* Probe outcome — this session only; it is not persisted (D4). */}
          {probe && (
            <span
              className={`flex items-center gap-[6px] text-[11.5px] ${
                probe.ok ? 'text-ok' : 'text-danger'
              }`}
            >
              {probe.ok ? (
                <Check size={13} strokeWidth={2} />
              ) : (
                <X size={13} strokeWidth={2} />
              )}
              {probe.message}
            </span>
          )}
          {probeError && (
            <span className="flex items-center gap-[6px] text-[11.5px] text-danger">
              <X size={13} strokeWidth={2} />
              {probeError}
            </span>
          )}

          {/* Why a connector can never be probed — stated, not silently missing. */}
          {!c.probeable && c.probeNote && (
            <span className="flex items-center gap-[6px] text-[11px] text-fg-subtle">
              <Info size={12} strokeWidth={2} />
              {c.probeNote}
            </span>
          )}
        </div>

        <div className="flex items-center gap-[8px]">
          {hasEditable && (
            <Button
              variant="secondary"
              onClick={() => (editing ? setEditing(false) : openEditor())}
              icon={<Settings2 size={14} />}
            >
              Configure
            </Button>
          )}
          {c.probeable && (
            <Button
              variant="secondary"
              disabled={test.isPending}
              onClick={() => {
                setProbeError(null);
                test.mutate(c.key, {
                  onError: (err) => setProbeError((err as Error).message),
                });
              }}
            >
              {/* Spin the circular icon, not the bolt — a rotating lightning bolt
                  reads as a glitch (DS-9: motion stays boring). */}
              {test.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Zap size={14} />
              )}
              Test connection
            </Button>
          )}
        </div>
      </div>

      {/* Non-secret config editor (ADR-0013). Expanded on Configure. */}
      {editing && (
        <div className="mt-[12px] flex flex-col gap-[12px] border-t border-border pt-[12px]">
          <div className="flex flex-col gap-[10px]">
            {editable.map((f) => (
              <label key={f.column} className="flex flex-col gap-[4px]">
                <span className="flex items-center gap-[8px] text-[11.5px]">
                  {f.label}
                  <FieldSourceNote field={f} />
                </span>
                <Input
                  value={draft[f.column] ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, [f.column]: e.target.value })
                  }
                  placeholder={`Set ${f.label.toLowerCase()}…`}
                />
              </label>
            ))}
          </div>

          {/* Secrets are read-only — value is never shown, only its status (D5). */}
          {secrets.length > 0 && (
            <div className="flex flex-col gap-[6px] border-t border-border pt-[10px]">
              <span className="text-[11px] text-fg-subtle">
                Secrets are set in the deployment environment, not here.
              </span>
              {secrets.map((s) => (
                <div
                  key={s.envKey}
                  className="flex items-center justify-between gap-[8px]"
                >
                  <span className="flex items-center gap-[6px] text-[11.5px]">
                    {s.label}
                    <span className="font-mono text-[10.5px] text-fg-subtle">
                      {s.envKey}
                    </span>
                  </span>
                  <Badge tone={s.configured ? 'ok' : 'warn'}>
                    {s.configured ? 'configured via env' : 'not set'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <p className="flex items-center gap-[6px] text-[11px] text-fg-subtle">
            <Info size={12} strokeWidth={2} />
            Changes take effect after the API restarts.
          </p>

          {saveError && (
            <span className="flex items-center gap-[6px] text-[11.5px] text-danger">
              <X size={13} strokeWidth={2} />
              {saveError}
            </span>
          )}

          <div className="flex items-center justify-end gap-[6px]">
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={update.isPending}
              icon={<X size={13} strokeWidth={2} />}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={save}
              disabled={update.isPending}
              icon={<Check size={13} strokeWidth={2.2} />}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Where the field's current value comes from — plain subtle text, no invented tone. */
function FieldSourceNote({ field }: { field: ConnectorField }) {
  const text =
    field.source === 'db'
      ? 'overridden here'
      : field.source === 'env'
        ? 'from environment'
        : 'not set';
  return <span className="text-[10.5px] text-fg-subtle">{text}</span>;
}
