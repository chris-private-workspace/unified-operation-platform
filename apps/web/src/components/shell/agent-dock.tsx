import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, MessageSquare, Plus, Send, WifiOff } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TurnBubble } from '@/components/agent/turn-bubble';
import { useUiStore } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import {
  useAgentConversation,
  useAgentProfileOptions,
  useRequest,
} from '@/hooks/queries';
import {
  useAddConversationTurn,
  useCreateConversation,
} from '@/hooks/mutations';
import { useAgentConversationEvents } from '@/hooks/agent-conversation-events';
import { ApiError } from '@/lib/api';
import {
  TURN_MAX_LENGTH,
  isThinking,
  runAwaitingDecision,
} from '@/lib/assistant';
import { canUseAgent } from '@/lib/roles';
import { routeContext, type RouteContext } from '@/lib/route-context';

/**
 * W49 `F2` — the site-wide agent dock (Tier 2 `T2-d`).
 *
 * Two exports because the two halves live in different places in the layout: the
 * launcher is a control inside `TopBar`, the panel is `fixed` and mounts once in
 * `AppShell`. Neither is mounted per page — a dock each screen mounted for itself
 * is a dock that closes when you navigate, and drifts.
 */

/**
 * 🔴 `R5` — ONE predicate, used by both halves.
 *
 * The obvious shape is to hide the launcher and let the panel follow, but that
 * makes the gate a property of the button rather than of the feature: `F3` opens
 * this panel from a route, and by then "only reachable through the launcher"
 * would be a claim nobody has checked. Both halves ask the same question, and
 * `agent-dock.test.tsx` scans this file to keep it that way rather than trusting
 * a reviewer to notice a third export appearing without it.
 *
 * ⚠️ Hiding is not the authority — the server's `@Roles` is (the same wording
 * `canUseAgent` itself carries). This only stops offering an entry that would
 * 403.
 */
function useDockVisible(): boolean {
  const { role } = useCurrentUser();
  return canUseAgent(role);
}

/** Lives in `TopBar`, beside the theme toggle. */
export function AgentDockLauncher() {
  const visible = useDockVisible();
  const dockOpen = useUiStore((s) => s.dockOpen);
  const toggleDock = useUiStore((s) => s.toggleDock);

  if (!visible) return null;

  return (
    // `IconButton`, not a `Button` — DS-3 says one primary per view, and the
    // dock is chrome available on every screen. A red action bolted onto the
    // top bar would be a second primary on all of them at once.
    <IconButton
      title="Assistant"
      aria-label="Assistant"
      aria-expanded={dockOpen}
      active={dockOpen}
      onClick={toggleDock}
    >
      <MessageSquare size={16} strokeWidth={2} />
    </IconButton>
  );
}

/** Mounts once in `AppShell`; renders nothing until somebody opens it. */
export function AgentDock() {
  const visible = useDockVisible();
  const dockOpen = useUiStore((s) => s.dockOpen);
  const setDockOpen = useUiStore((s) => s.setDockOpen);

  /**
   * W49 `F3` — the context, derived from the route and nothing else (`OQ-B` ①).
   *
   * ⚠️ `useRequest` is here to NAME the request on screen, not to decide
   * anything. It is the same query key the request detail screen uses, so on the
   * one screen where this fires it is a cache hit and costs no request;
   * everywhere else `ctx` is null and the query is disabled.
   */
  const { pathname } = useLocation();
  const ctx = routeContext(pathname);
  const request = useRequest(ctx?.id);

  /**
   * W49 `F4` — the thread this dock is holding.
   *
   * 🔴 Local state, and that is not a shortcut: `AgentDock` mounts once in
   * `AppShell`, which does NOT remount when the route changes (only `<Outlet />`
   * does). So this survives navigation for the same reason `dockOpen` does —
   * whereas a per-page dock would lose the thread on every click.
   *
   * ⚠️ Only the ID is local. Every piece of CONTENT comes from the same TanStack
   * queries `/assistant` uses (`R4`), so a turn sent here shows up there and the
   * other way round; two local copies of a conversation would be two answers to
   * "what was said".
   */
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const profiles = useAgentProfileOptions();
  const create = useCreateConversation();
  const thread = useAgentConversation(threadId ?? undefined);
  const send = useAddConversationTurn(threadId ?? '');
  const events = useAgentConversationEvents(threadId ?? undefined);

  if (!visible) return null;

  /**
   * 🔴 The link carries the id as a QUERY PARAMETER, which is the honest shape:
   * it is a hint the next screen may use, sitting somewhere anyone can read and
   * edit. It is not a token and it grants nothing — `agent-conversation.service`
   * looks the request up and runs `assertOpcoScope` before a thread exists
   * (`agent-conversation.scope.spec.ts` holds that up).
   */
  const assistantHref = ctx ? `/assistant?requestId=${ctx.id}` : '/assistant';

  const agents = profiles.data ?? [];
  const open = thread.data;
  const thinking = isThinking(open?.runs);
  const awaiting = runAwaitingDecision(open?.runs);
  const tooLong = draft.length > TURN_MAX_LENGTH;

  const submit = () => {
    const content = draft.trim();
    if (!threadId || !content || tooLong || send.isPending) return;
    send.mutate(content, { onSuccess: () => setDraft('') });
  };

  return (
    <Drawer
      open={dockOpen}
      title="Assistant"
      onClose={() => setDockOpen(false)}
    >
      {/*
       * Before a thread exists the panel is about the PAGE; once one exists it
       * is about the THREAD. Deliberately never both — W48 `F5-12` shipped a
       * picker and a badge one card apart naming different agents, and it read
       * as a contradiction rather than as two different questions.
       */}
      {!threadId ? (
        <DockStart
          ctx={ctx}
          assistantHref={assistantHref}
          onNavigateAway={() => setDockOpen(false)}
          requestNumber={request.data?.serviceNowNumber ?? null}
          agentCount={agents.length}
          agentsFailed={profiles.isError}
          agentsLoading={profiles.isLoading}
          pending={create.isPending}
          error={create.error}
          onStart={() =>
            create.mutate(
              { requestId: ctx?.id ?? null, profileId: agents[0]?.id },
              { onSuccess: (row) => setThreadId(row.id) },
            )
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-[10px]">
          {/*
           * 🔴 `F4-3` / `R35`. The bound that closes this connection is correct;
           * what was missing is that nothing ever SAID so. A dock stays open all
           * day, so it meets an api restart — one deploy — far more often than a
           * screen somebody opens on purpose, and until now the only cure was
           * "switch thread and switch back", which nobody would guess.
           */}
          {events.disconnected && (
            <div className="flex items-start gap-[8px] rounded-lg border border-border bg-panel px-[11px] py-[9px]">
              <WifiOff
                size={14}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-fg-subtle"
              />
              <div className="text-[12px] leading-[1.5] text-fg-muted">
                Live updates stopped. Replies may not appear on their own.
                <button
                  type="button"
                  onClick={events.reconnect}
                  className="ml-[5px] cursor-pointer font-medium text-fg underline underline-offset-2"
                >
                  Reconnect
                </button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto">
            {(open?.turns ?? []).length === 0 && !thinking && (
              <p className="text-[12.5px] leading-[1.55] text-fg-muted">
                {open?.requestId
                  ? 'Ask about this request — what it needs, or what is blocking it.'
                  : 'No request is attached, so the agent cannot read your requests. It can still search the catalogue.'}
              </p>
            )}
            {(open?.turns ?? []).map((turn) => (
              <TurnBubble key={turn.id} turn={turn} />
            ))}
            {thinking && (
              <div className="flex items-center gap-[7px] text-[12.5px] text-fg-muted">
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                Thinking…
              </div>
            )}
            {/*
             * 🔴 `ADR-0041 D8` — a proposal is shown, never decided. There is no
             * approve control here and there is no mutation this file could call
             * even if somebody added one; `agent-dock.test.tsx` scans for both.
             */}
            {awaiting && (
              <div className="rounded-lg border border-border bg-panel px-[11px] py-[9px] text-[12px] leading-[1.5] text-fg-muted">
                AI-Assist has proposed something. Decisions happen on the
                request, where the platform&apos;s own checks run.
                {open?.requestId && (
                  <Link
                    to={`/requests/${open.requestId}`}
                    onClick={() => setDockOpen(false)}
                    className="ml-[4px] font-medium text-fg underline underline-offset-2"
                  >
                    Open the request
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[7px] border-t border-border pt-[10px]">
            <Textarea
              rows={3}
              maxLength={TURN_MAX_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about a licence request…"
              aria-label="Message"
            />
            <div className="flex items-center justify-between gap-[8px]">
              <Link
                to={assistantHref}
                onClick={() => setDockOpen(false)}
                className="text-[11.5px] text-fg-subtle underline underline-offset-2 hover:text-fg"
              >
                Open in Assistant
              </Link>
              {/*
               * 🔴 `secondary`, NOT `primary`. `/assistant` uses a primary Send
               * and is right to — it is one screen with one job. The dock is on
               * EVERY screen, so a primary here is a second primary everywhere
               * at once (DS-3, and `design-system.md §2`'s seventh constraint).
               */}
              <Button
                variant="secondary"
                onClick={submit}
                disabled={!draft.trim() || tooLong || send.isPending}
              >
                <Send size={14} strokeWidth={2} />
                Send
              </Button>
            </div>
            {send.isError && (
              <p className="text-[12px] text-danger">
                {send.error instanceof ApiError
                  ? send.error.message
                  : 'That could not be sent.'}
              </p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/**
 * The panel before a thread exists: what this dock is about, and one way in.
 *
 * 🔴 Kept a separate (non-exported) component so the `R5` source scan above
 * still describes exactly the two entry points — a third export would be a
 * third thing needing the gate, and this is not one.
 */
function DockStart({
  ctx,
  assistantHref,
  onNavigateAway,
  requestNumber,
  agentCount,
  agentsFailed,
  agentsLoading,
  pending,
  error,
  onStart,
}: {
  ctx: RouteContext | null;
  assistantHref: string;
  onNavigateAway: () => void;
  requestNumber: string | null;
  agentCount: number;
  agentsFailed: boolean;
  agentsLoading: boolean;
  pending: boolean;
  error: unknown;
  onStart: () => void;
}) {
  return (
    <>
      {ctx && (
        <div className="mb-[14px] rounded-lg border border-border bg-panel px-[12px] py-[10px]">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-fg-subtle">
            About
          </div>
          {/*
           * An identifier, so mono (DS-5). Falls back to the raw id while the
           * request is loading or on a screen whose data this session has not
           * fetched — showing the id is honest, and showing nothing would make
           * the panel look like it had lost the context it is about to send.
           */}
          <div className="mt-[3px] font-mono text-[12.5px] text-fg">
            {requestNumber ?? ctx.id}
          </div>
        </div>
      )}

      <p className="text-[12.5px] leading-[1.6] text-fg-muted">
        {ctx
          ? 'Ask AI-Assist about this request. Anything it proposes still goes to a person on the request itself.'
          : 'Ask AI-Assist about licences. Anything it proposes still goes to a person on the request itself.'}
      </p>

      <div className="mt-[12px] flex flex-col gap-[8px]">
        <Button
          variant="secondary"
          onClick={onStart}
          disabled={pending || agentsLoading || agentCount === 0}
        >
          <Plus size={14} strokeWidth={2} />
          {ctx ? 'Ask about this request' : 'New conversation'}
        </Button>

        {/*
         * 🔴 Two different sentences for two different situations, and this is
         * here because of a live incident: on DEV 2026-08-19 every profile was
         * switched off, `/assistant` said "No agent is switched on." — which was
         * true — but that screen says the SAME sentence when the request FAILS,
         * where it would be a lie. The dock separates them.
         *
         * ⚠️ `/assistant` still has the merged version; not touched here because
         * it is not this phase's file (logged instead).
         */}
        {agentsFailed && (
          <p className="text-[12px] text-danger">
            Could not load the agent list. Try again in a moment.
          </p>
        )}
        {!agentsFailed && !agentsLoading && agentCount === 0 && (
          <p className="text-[12px] text-fg-muted">
            No agent is switched on. An admin can turn one on under Agent.
          </p>
        )}
        {error != null && (
          <p className="text-[12px] text-danger">
            {error instanceof ApiError
              ? error.message
              : 'That could not be started.'}
          </p>
        )}

        {/*
         * 🔴 W49 `F3-1`'s handover, and it has to live in BOTH dock states. It
         * briefly existed only once a thread was open — which is the half where
         * you least need it, since by then the context has already been sent.
         *
         * ⚠️ NOT `text-accent`: the dock is on every screen, so an accent link
         * here is a second accent on all of them (DS-3 / `design-system.md §2`).
         */}
        <Link
          to={assistantHref}
          onClick={onNavigateAway}
          className="text-[11.5px] text-fg-subtle underline underline-offset-2 hover:text-fg"
        >
          {ctx ? 'Ask in the full Assistant' : 'Open the Assistant'}
        </Link>
      </div>
    </>
  );
}
