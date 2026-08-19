import type { AgentChatTurn } from '@/lib/api-types';

/**
 * One line of a conversation. Moved out of `assistant.tsx` unchanged in W49
 * `F4` so the dock renders the same bubble rather than a second one that looks
 * almost right — two copies of this would drift the first time either screen
 * was restyled, and nothing would go red.
 *
 * Depth is border + surface tint only (DS-7); the two roles differ by SURFACE
 * (`bg-panel` vs `bg-card`), never by accent. A chat where "mine" was Ricoh red
 * would put an accent on every screen the dock is open on.
 */
export function TurnBubble({ turn }: { turn: AgentChatTurn }) {
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
