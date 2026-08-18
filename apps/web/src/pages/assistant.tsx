import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useAgentConversation, useAgentConversations } from '@/hooks/queries';
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
import type { AgentChatTurn, AgentConversation } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { IconButton } from '@/components/ui/icon-button';
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

  const list = useAgentConversations();
  const thread = useAgentConversation(selected);
  const create = useCreateConversation();
  const archive = useArchiveConversation();
  const send = useAddConversationTurn(selected ?? '');

  useAgentConversationEvents(selected);

  const forbidden =
    (list.error instanceof ApiError && list.error.status === 403) ||
    (thread.error instanceof ApiError && thread.error.status === 403);

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
        <Button
          variant="secondary"
          onClick={() =>
            create.mutate(
              { requestId: null },
              { onSuccess: (row) => setSelected(row.id) },
            )
          }
          disabled={create.isPending}
        >
          <Plus size={14} strokeWidth={2} />
          New conversation
        </Button>
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
                <span className={`${NUM} text-fg-subtle`}>
                  {formatDateTime(open.createdAt)}
                </span>
              </div>

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
function TurnBubble({ turn }: { turn: AgentChatTurn }) {
  const mine = turn.role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-lg border px-[13px] py-[9px] text-[12.5px] leading-[1.55] ${
          mine ? 'border-border bg-panel' : 'border-border bg-card'
        }`}
      >
        {turn.content}
      </div>
    </div>
  );
}
