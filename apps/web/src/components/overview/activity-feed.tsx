import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import { useActivity } from '@/hooks/queries';
import { eventIcon, eventSummary, eventTone } from '@/lib/activity';
import { relativeTime } from '@/lib/format';
import { TONE_SOFT } from '@/lib/tones';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { cn } from '@/lib/utils';

/**
 * Overview activity feed (CH-006). Shows what happened to REQUESTS — the
 * operational stream the prototype depicted — read from GET /fulfilment/activity.
 *
 * Visible to every role: the endpoint is opco-scoped server-side, so an OPCO_IT
 * operator sees its own OpCo's events rather than nothing. That is deliberately
 * the opposite of CH-005, whose audit source stays ADMIN-only (ADR-0009
 * Decision 7) — the fix for "non-admins see no feed" was a separate scoped
 * surface, never a widening of that guard.
 */
export function ActivityFeed({ action }: { action?: ReactNode }) {
  const { data, isLoading, isError } = useActivity(FEED_LIMIT);
  const events = data ?? [];

  return (
    <Card
      title="Recent activity"
      padded={false}
      // Nothing to link to while the feed is empty or unreachable.
      action={events.length > 0 ? action : undefined}
    >
      {isLoading && <Loading label="Loading activity…" />}
      {isError && <LoadError />}
      {!isLoading && !isError && events.length === 0 && (
        <EmptyState
          icon={<Activity size={18} strokeWidth={2} />}
          title="No activity yet"
          description="Assignments and stage changes appear here as requests move."
        />
      )}
      {events.map((event) => {
        const { text, ref } = eventSummary(event);
        const Icon = eventIcon(event.type);
        return (
          <div
            key={event.id}
            className="flex items-start gap-[12px] border-b border-border px-[16px] py-[9px] last:border-0"
          >
            {/* 6px chip radius = --radius-sm (spacing.css:28) */}
            <span
              className={cn(
                'flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px]',
                TONE_SOFT[eventTone(event.type)],
              )}
            >
              <Icon size={13} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 text-[12.5px] leading-[1.4]">
              {text}{' '}
              {/* mono: ref is a request identifier (DS-5), as on /requests */}
              <span className="font-mono text-[11.5px] text-fg-subtle">
                {ref}
              </span>
            </div>
            <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-fg-subtle">
              {relativeTime(event.createdAt)}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

/** Overview shows the tail only — /requests is where history is browsed. */
const FEED_LIMIT = 6;
