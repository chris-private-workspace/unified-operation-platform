import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import {
  useAgentConversation,
  useAgentConversations,
  useAgentProfileOptions,
} from '@/hooks/queries';
import {
  useAddConversationTurn,
  useArchiveConversation,
  useCreateConversation,
} from '@/hooks/mutations';
import { useAgentConversationEvents } from '@/hooks/agent-conversation-events';
import { ApiError } from '@/lib/api';
import {
  TURN_MAX_LENGTH,
  isThinking,
  runAwaitingDecision,
} from '@/lib/assistant';
import { formatDateTime } from '@/lib/format';
import type { AgentConversation } from '@/lib/api-types';
import { TurnBubble } from '@/components/agent/turn-bubble';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { IconButton } from '@/components/ui/icon-button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const NUM = 'font-mono text-[12px]'; // DS-5 — identifiers and figures are mono

/**
 * Assistant (W48 F5 / Tier 2 `T2-c`) — a conversation with AI-Assist.
 *
 * 🔴 **One primary action on the whole view** (DS-3): "Send". Starting a new
 * thread is secondary — this screen exists to talk, and a person who has just
 * opened it is far more often continuing than starting over.
 *
 * 🔴 **No approve button anywhere on this screen** (`F5-4` / ADR-0041 D8). When
 * a run parks on a proposal, the thread LINKS to the request it belongs to and
 * the decision happens there, with the request in front of the person. A chat
 * makes asking for something feel light, and the human-in-the-loop gate is the
 * whole of Tier 1's safety argument — softening it because the UI felt smoother
 * is exactly what D8 forbids in writing.
 *
 * 🔴 A thread with NO request context says so, out loud. "The agent cannot see
 * your requests" and "the agent found nothing" produce the same-looking answer,
 * and only one of them is a structural fact the person can act on (D3).
 *
 * ADMIN + REGIONAL: the sidebar hides the entry (`canUseAgent`) and opening the
 * URL directly degrades to a restricted state. The server's 403 is the real
 * authority — and which THREADS are readable is a row-level fact (a thread
 * belongs to whoever started it) that no role gate can express.
 *
 * ⚠️ Deliberately not a `Drawer`. The site-wide dock is `T2-d`; this is one
 * screen, enough to prove the interaction model works.
 */
export function Assistant() {
  const [selected, setSelected] = useState<string | undefined>();
  const [draft, setDraft] = useState('');

  const [pickedProfile, setPickedProfile] = useState<string | undefined>();

  /**
   * W49 `F3` — the request the dock was looking at, handed over in the URL.
   *
   * 🔴 Read straight off the query string with no validation, and that is the
   * point: this is a HINT (`D-CTX`). Anyone can edit it, so nothing here may
   * treat it as permission. `POST /agent/conversations` looks the request up and
   * runs `assertOpcoScope` before a thread exists, and a bad id 404s.
   *
   * ⚠️ Kept out of component state deliberately: state would go stale the moment
   * somebody navigated, and the URL already IS the state.
   */
  const [searchParams] = useSearchParams();
  const contextRequestId = searchParams.get('requestId');

  const list = useAgentConversations();
  const thread = useAgentConversation(selected);
  const profiles = useAgentProfileOptions();
  const create = useCreateConversation();
  const archive = useArchiveConversation();
  const send = useAddConversationTurn(selected ?? '');

  const events = useAgentConversationEvents(selected);

  /**
   * 🔴 CH-032 `D1` — `profiles.error` belongs here for the same reason the other
   * two do.
   *
   * It was missing, and the failure was silent rather than loud: a 403 on the
   * profile list fell through to `profiles.data ?? []`, so the screen said "No
   * agent is switched on" — a sentence about the PLATFORM's state — when the
   * real answer was about THIS PERSON's permissions. Same root as `A` below:
   * three queries, two treated as first-class and one treated as "empty if
   * absent".
   */
  const forbidden =
    (list.error instanceof ApiError && list.error.status === 403) ||
    (thread.error instanceof ApiError && thread.error.status === 403) ||
    (profiles.error instanceof ApiError && profiles.error.status === 403);

  if (forbidden) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<ShieldAlert size={18} strokeWidth={2} />}
          title="Access required"
          description="Talking to AI-Assist is limited to regional and platform admins."
        />
      </Card>
    );
  }

  const conversations = list.data ?? [];
  const open = thread.data;

  /**
   * 🔴 `F5-8` — which agent a new thread runs on, sent EXPLICITLY.
   *
   * There is deliberately no default profile (W47 `OQ-A`): with more than one
   * active and none named, the server refuses and says how many there are. Live
   * on 2026-08-18 that produced a screen where every new conversation failed at
   * its first turn with nothing to click. So the picker names one, always — and
   * when there is only one to name it stays off screen, because a choice of one
   * is not a choice.
   */
  const agents = profiles.data ?? [];
  const agentId = pickedProfile ?? agents[0]?.id;
  const agentName = (id: string) =>
    agents.find((a) => a.id === id)?.name ??
    // Not "unknown": a thread pinned to a switched-off profile still runs, and
    // saying nothing would be the silent-default problem in another costume.
    (profiles.isLoading ? null : 'Retired agent');
  const thinking = isThinking(open?.runs);
  const awaiting = runAwaitingDecision(open?.runs);
  const tooLong = draft.length > TURN_MAX_LENGTH;

  const submit = () => {
    const content = draft.trim();
    if (!selected || !content || tooLong || send.isPending) return;
    send.mutate(content, { onSuccess: () => setDraft('') });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="flex flex-wrap items-center justify-between gap-[14px] p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[15px] font-semibold tracking-[-.02em]">
            Assistant
          </h1>
          <p className="text-[12.5px] text-fg-muted">
            Ask AI-Assist about licences. Anything it proposes still goes to a
            person on the request itself.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[10px]">
          {/* Only when there is a choice to make. One agent needs no picker. */}
          {agents.length > 1 && (
            <div className="w-[190px]">
              <Select
                value={agentId ?? ''}
                onChange={(e) => setPickedProfile(e.target.value)}
                /* 🔴 `F5-12` — not just "Agent". This picker chooses what the
                   NEXT thread runs on, while the badge in the thread header
                   says what the OPEN one runs on. Live on 2026-08-19 the two
                   sat one card apart showing different names, which reads as a
                   contradiction rather than as two different questions. */
                aria-label="Agent for new conversations"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {/*
           * 🔴 CH-032 `A` — two situations, two sentences.
           *
           * One sentence used to cover both, and one of the two readings was a
           * lie: `agents` comes from `profiles.data ?? []`, so a FAILED request
           * (500, a dropped network) produced the same "No agent is switched
           * on." as an empty list. The platform does not know whether an agent
           * is switched on at that moment — it could not read the list.
           *
           * 🔴 Found the expensive way. On DEV 2026-08-19 all three profiles
           * were `active: false`, and this sentence was TRUE — but it reads as
           * the only possible explanation, and even the person debugging it
           * nearly stopped at "there are no profiles" rather than asking
           * `?includeInactive=true`.
           *
           * ⚠️ Wording is copied WORD FOR WORD from the dock (`D2`), including
           * the second half about who can fix it, which this screen never said.
           * `assistant.test.tsx` compares the two files rather than trusting
           * that they will be edited together.
           */}
          {profiles.isError && (
            <span className="text-[12.5px] text-danger">
              Could not load the agent list. Try again in a moment.
            </span>
          )}
          {!profiles.isError && !profiles.isLoading && agents.length === 0 && (
            <span className="text-[12.5px] text-fg-muted">
              No agent is switched on. An admin can turn one on under Agent.
            </span>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              create.mutate(
                { requestId: contextRequestId, profileId: agentId },
                { onSuccess: (row) => setSelected(row.id) },
              )
            }
            disabled={create.isPending || agents.length === 0}
          >
            <Plus size={14} strokeWidth={2} />
            {/*
             * W49 `F3` — the label changes because the ACTION changes: a thread
             * pinned to a request is a different thing from a loose one, and
             * `OQ-D`'s live check in W48 showed the difference is real (with
             * context the agent called `list_pending_requests`; without it, it
             * answered "with the available tools" and made zero tool calls).
             * Somebody who arrives here from the dock should be able to see
             * which one they are about to get.
             */}
            {contextRequestId ? 'Ask about this request' : 'New conversation'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-[18px] lg:grid-cols-[260px_1fr]">
        {/* ── threads ── */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-[14px] py-[11px]">
            <h2 className="text-[13px] font-semibold">Conversations</h2>
          </div>

          {list.isLoading && <Loading label="Loading conversations…" />}
          {list.isError && !forbidden && <LoadError />}
          {!list.isLoading && !list.isError && conversations.length === 0 && (
            <EmptyState
              icon={<MessageSquare size={18} strokeWidth={2} />}
              title="No conversations yet"
              description="Start one to ask AI-Assist about a licence request."
            />
          )}

          {conversations.length > 0 && (
            <ul className="flex flex-col">
              {conversations.map((row) => (
                <ThreadRow
                  key={row.id}
                  row={row}
                  active={row.id === selected}
                  onOpen={() => setSelected(row.id)}
                  onArchive={() => {
                    archive.mutate(row.id);
                    if (row.id === selected) setSelected(undefined);
                  }}
                />
              ))}
            </ul>
          )}
        </Card>

        {/* ── the open thread ── */}
        <Card className="flex min-h-[420px] flex-col overflow-hidden p-0">
          {!selected && (
            <EmptyState
              icon={<MessageSquare size={18} strokeWidth={2} />}
              title="Nothing open"
              description="Pick a conversation, or start a new one."
            />
          )}

          {selected && thread.isLoading && <Loading label="Loading…" />}
          {selected && thread.isError && !forbidden && <LoadError />}

          {open && (
            <>
              <div className="flex flex-wrap items-center gap-[8px] border-b border-border px-[18px] py-[13px]">
                <h2 className="text-[13px] font-semibold">Conversation</h2>
                {/* 🔴 D3, made visible. Without this line, "no request context"
                    is indistinguishable from an agent that simply found
                    nothing. */}
                {open.requestId ? (
                  <Badge tone="info">On a request</Badge>
                ) : (
                  <Badge tone="neutral">No request context</Badge>
                )}
                {/* 🔴 Which agent this thread runs on. `OQ-A` refused a default
                    nobody can see; a thread that never says who answered it is
                    the same blind spot one step later. */}
                {open.profileId && agentName(open.profileId) && (
                  <Badge tone="purple">{agentName(open.profileId)}</Badge>
                )}
                <span className={`${NUM} text-fg-subtle`}>
                  {formatDateTime(open.createdAt)}
                </span>
              </div>

              {/*
               * 🔴 CH-032 `B` / `RISK R35` — the same banner the dock has.
               *
               * `useAgentConversationEvents` has returned `{ disconnected,
               * reconnect }` since W49 `F4-3`; this screen threw the value away,
               * so a thread whose live connection had died looked exactly like a
               * thread nobody had answered yet. The dock is open all day and
               * meets this far more often, which is why it was fixed there
               * first — but the failure is not rarer here, only less frequent.
               *
               * 🔴 Deliberately OUTSIDE the scrolling transcript (`D3`). It is a
               * state of the screen, not a message in the conversation, and a
               * status that scrolls out of view is one nobody sees at the moment
               * it starts mattering.
               *
               * ⚠️ `Reconnect` is an underline link, not a `Button` — "Send" is
               * this view's one primary (DS-3), and the fix for a stalled
               * connection must not out-shout the thing the person came to do.
               */}
              {events.disconnected && (
                <div className="mx-[18px] mt-[14px] flex items-start gap-[8px] rounded-lg border border-border bg-panel px-[11px] py-[9px]">
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

              <div className="flex flex-1 flex-col gap-[12px] overflow-y-auto px-[18px] py-[16px]">
                {(open.turns ?? []).length === 0 && (
                  <p className="text-[12.5px] text-fg-muted">
                    {open.requestId
                      ? 'Ask about this request — what it needs, or what is blocking it.'
                      : 'This conversation has no request attached, so the agent cannot read your requests. It can still search the licence catalogue and read allocation figures.'}
                  </p>
                )}
                {(open.turns ?? []).map((turn) => (
                  <TurnBubble key={turn.id} turn={turn} />
                ))}
                {thinking && (
                  <div className="flex items-center gap-[7px] text-[12.5px] text-fg-muted">
                    <Loader2
                      size={14}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                    Thinking…
                  </div>
                )}
                {awaiting && (
                  <div className="rounded-lg border border-border bg-panel px-[13px] py-[11px] text-[12.5px]">
                    <p className="text-fg-muted">
                      AI-Assist has proposed something. Decisions happen on the
                      request, where the platform&apos;s own checks run.
                    </p>
                    {open.requestId && (
                      <Link
                        to={`/requests/${open.requestId}`}
                        className="mt-[6px] inline-block text-accent hover:underline"
                      >
                        Open the request
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-[8px] border-t border-border px-[18px] py-[14px]">
                <Textarea
                  rows={3}
                  maxLength={TURN_MAX_LENGTH}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about a licence request…"
                  aria-label="Message"
                />
                <div className="flex items-center justify-between gap-[10px]">
                  <span className={`${NUM} text-fg-subtle`}>
                    {TURN_MAX_LENGTH - draft.length} left
                  </span>
                  <Button
                    variant="primary"
                    onClick={submit}
                    disabled={!draft.trim() || tooLong || send.isPending}
                  >
                    <Send size={14} strokeWidth={2} />
                    Send
                  </Button>
                </div>
                {send.isError && (
                  <p className="text-[12.5px] text-danger">
                    {send.error instanceof ApiError
                      ? send.error.message
                      : 'That could not be sent.'}
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ThreadRow({
  row,
  active,
  onOpen,
  onArchive,
}: {
  row: AgentConversation;
  active: boolean;
  onOpen: () => void;
  onArchive: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-[8px] border-b border-border px-[14px] py-[10px] ${
        active ? 'bg-panel' : ''
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col items-start gap-[3px] text-left"
      >
        <span className="text-[12.5px] font-medium">
          {row.requestId ? 'On a request' : 'No request context'}
        </span>
        <span className={`${NUM} text-fg-subtle`}>
          {formatDateTime(row.updatedAt)}
        </span>
      </button>
      <IconButton
        aria-label="Archive conversation"
        title="Archive"
        onClick={onArchive}
      >
        <Archive size={14} strokeWidth={2} />
      </IconButton>
    </li>
  );
}

/**
 * One line of the dialogue.
 *
 * ⚠️ Built from `Card`-level tokens rather than a new `ChatBubble` primitive.
 * The handoff has no chat screen, and `design-system.md §5` allows composing
 * existing primitives freely while a NEW primitive needs owner approval — so
 * the cheaper, reversible option is the correct one until a second surface
 * (`T2-d`'s dock) proves the shape is worth naming.
 *
 * Depth comes from a 1px border and a surface tint, never a shadow or a
 * gradient (DS-7).
 */
