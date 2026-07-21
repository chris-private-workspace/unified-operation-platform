import { useState } from 'react';
import {
  Cable,
  Check,
  Info,
  RefreshCw,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { useIntegrations } from '@/hooks/queries';
import { useTestConnection } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  connectorStateLabel,
  connectorStateTone,
  lastSuccessText,
} from '@/lib/integrations';
import type { ConnectorStatus } from '@/lib/api-types';

/**
 * Connector status + Test connection (W30 / ADR-0010 item 4). Replaces the
 * placeholder EmptyState this tab used to carry.
 *
 * Two things this panel is careful NOT to imply:
 *  - the state badge is deployment shape, not health (a failed probe leaves it
 *    alone — plan §9 Q3);
 *  - the timestamp is when the connector last *worked*, derived from domain
 *    data, not when it was last checked (ADR-0010 D4).
 *
 * Test buttons are `secondary`: the allocation import above is this tab's one
 * primary action (DS-3).
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
  const [error, setError] = useState<string | null>(null);

  const probe = c.lastProbe;

  return (
    <div className="flex flex-wrap items-center justify-between gap-[12px] border-b border-border px-[16px] py-[11px] last:border-0">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex items-center gap-[8px]">
          <span className="text-[13px] font-medium">{c.label}</span>
          <Badge tone={connectorStateTone(c.state)}>
            {connectorStateLabel(c.state)}
          </Badge>
        </div>

        <span className="font-mono text-[11px] text-fg-subtle">
          {lastSuccessText(c.lastSuccessAt, c.lastSuccessNote, formatDateTime)}
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
        {error && (
          <span className="flex items-center gap-[6px] text-[11.5px] text-danger">
            <X size={13} strokeWidth={2} />
            {error}
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

      {c.probeable && (
        <Button
          variant="secondary"
          disabled={test.isPending}
          onClick={() => {
            setError(null);
            test.mutate(c.key, {
              onError: (err) => setError((err as Error).message),
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
  );
}
