import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/lib/api';
import type { AgentRunStatus } from '@/lib/api-types';

/**
 * W46 期二 G6 / ADR-0039 — live updates for a run that is still going.
 *
 * 🔴 The payload is ignored. Every message means "refetch", and the refetch is
 * the existing `useAgentRun` query — so what the card renders comes from the
 * same endpoint whether the update arrived over SSE, from a mutation, or from
 * a page reload. ADR-0039 F10 spells out why the server sends nothing else:
 * a step streamed here and the same step refetched would eventually disagree,
 * and the screen would be holding both.
 *
 * 🔴 A DEAD run opens no connection. Terminal statuses are the majority of what
 * this card shows — every finished run a person scrolls back to — and holding an
 * SSE connection open for each of them would be one socket per historical run.
 */

/**
 * The statuses a run can still move on from.
 *
 * ⚠️ Deliberately written as the LIVE set rather than the terminal set. Both
 * are derivable from the other, but a new status added to `AgentRunStatus` is
 * far more likely to be terminal than live — and this way the unknown case
 * fails closed (no connection) instead of opening one that never closes.
 */
const LIVE_STATUSES: AgentRunStatus[] = [
  'running',
  'awaiting_approval',
  'approved',
];

/**
 * Give up after this many consecutive connection failures.
 *
 * 🔴 `EventSource` reconnects by itself, forever, and it does not expose the
 * status code — so a 404 (run deleted) or a 403 (scope) is indistinguishable
 * from a blip and would be retried until the tab closes. A bounded number of
 * attempts keeps a transient outage self-healing without turning a permanent
 * error into a permanent request loop.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

export function useAgentRunEvents(
  requestId: string | undefined,
  run: { id: string; status: AgentRunStatus } | null | undefined,
): void {
  const qc = useQueryClient();

  const runId = run?.id;
  const isLive = run != null && LIVE_STATUSES.includes(run.status);

  useEffect(() => {
    // `EventSource` is missing in jsdom and in any SSR pass. Absence must mean
    // "no live updates", not a crash on a card that otherwise works.
    if (!requestId || !runId || !isLive) return;
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(`${API_BASE}/agent/runs/${runId}/events`, {
      // Same-origin in every deployment (ADR-0012), so this is belt and braces
      // — but if VITE_API_BASE_URL ever points elsewhere, the session cookie is
      // the only credential this app has (ADR-0028) and it has to ride along.
      withCredentials: true,
    });

    let failures = 0;
    source.onopen = () => {
      failures = 0;
    };
    source.onmessage = () => {
      // The payload is not read. See the file header.
      void qc.invalidateQueries({ queryKey: ['agent', 'runs', requestId] });
    };
    source.onerror = () => {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) source.close();
    };

    return () => source.close();
  }, [requestId, runId, isLive, qc]);
}
