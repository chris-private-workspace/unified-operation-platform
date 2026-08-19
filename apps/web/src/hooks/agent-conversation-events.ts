import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/lib/api';

/**
 * W48 F4 / ADR-0041 D5 — live updates for one conversation.
 *
 * 🔴 The payload is ignored, exactly as `useAgentRunEvents` ignores its own.
 * Every message means "refetch", and the refetch is the existing
 * `useAgentConversation` query — so what the screen renders comes from one
 * endpoint whether the update arrived over SSE, from a mutation, or from a page
 * reload. ADR-0039 F10's reasoning carries over unchanged: a reply streamed
 * here and the same reply refetched would eventually disagree, and the screen
 * would be holding both.
 *
 * 🔴 Chris 2026-08-18 chose turn-level notify over a token stream. What that
 * means HERE is that there is no partial text to render and no cursor to
 * animate — a turn appears whole. The plan's "token-by-token" wording is
 * recorded as a deviation in `plan.md §8`.
 *
 * ⚠️ Unlike the run hook, this connection is NOT gated on a live status. A
 * thread has no terminal state: it is idle between questions, and the next
 * question can come at any time. What bounds it instead is that only the OPEN
 * conversation subscribes — one socket per person looking at a thread, not one
 * per thread that exists.
 */

/**
 * Give up after this many consecutive failures.
 *
 * 🔴 `EventSource` reconnects forever and does not expose the status code, so a
 * 403 (somebody else's thread) is indistinguishable from a blip and would be
 * retried until the tab closes. Same bound, same reason, as the run hook.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface ConversationEventsState {
  /**
   * True once this hook has stopped listening for good.
   *
   * 🔴 W49 `F4-3` / `RISK R35`. The bound above is right, but until now nothing
   * could SEE it fire: the hook returned void, so a thread that had gone silent
   * looked exactly like a thread nobody had written to. That is survivable on
   * `/assistant`, which a person opens deliberately and leaves; the dock is open
   * across a whole session, so it will meet an api restart — one deploy is
   * enough — far more often, and the screen said nothing.
   */
  disconnected: boolean;
  /**
   * Resubscribe after giving up.
   *
   * Before this existed the only cure was remounting the hook — in practice
   * "switch to another thread and switch back", which W48 `F7-5` found by
   * accident and no user would ever guess.
   */
  reconnect: () => void;
}

export function useAgentConversationEvents(
  id: string | undefined,
): ConversationEventsState {
  const qc = useQueryClient();
  const [disconnected, setDisconnected] = useState(false);
  /** Bumping this re-runs the effect, which is what "resubscribe" means here. */
  const [attempt, setAttempt] = useState(0);

  const reconnect = useCallback(() => {
    setDisconnected(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    // Missing in jsdom and in any SSR pass. Absence must mean "no live
    // updates", not a crash on a screen that otherwise works.
    if (!id) return;
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(
      `${API_BASE}/agent/conversations/${id}/events`,
      // The session cookie is the only credential this app has (ADR-0028), and
      // `EventSource` sends no Authorization header.
      { withCredentials: true },
    );

    let failures = 0;
    source.onopen = () => {
      failures = 0;
      setDisconnected(false);
    };
    source.onmessage = () => {
      // The payload is not read. See the file header.
      void qc.invalidateQueries({ queryKey: ['agent', 'conversations', id] });
    };
    source.onerror = () => {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        source.close();
        // ⚠️ Set only when giving up, not on every error. `EventSource` fires
        // `onerror` for ordinary reconnects too, and a banner that flickered on
        // each of those would train people to ignore it.
        setDisconnected(true);
      }
    };

    return () => source.close();
  }, [id, qc, attempt]);

  return { disconnected, reconnect };
}
