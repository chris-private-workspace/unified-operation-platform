import type { ReactNode } from 'react';
import { ScrollText } from 'lucide-react';
import { useAuditLog } from '@/hooks/queries';
import { activityIcon, activitySummary, activityTone } from '@/lib/activity';
import { relativeTime } from '@/lib/format';
import { TONE_SOFT } from '@/lib/tones';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { cn } from '@/lib/utils';

/**
 * Overview activity feed (CH-005). Rendered ONLY for ADMIN — GET /admin/audit
 * returns P-B whitelisted PII and stays ADMIN-only (ADR-0009 Decision 7), so
 * the caller gates on role rather than this component degrading to a restricted
 * state: on the daily landing screen a permanent "you can't see this" tile is
 * noise, unlike the /audit page someone navigates to on purpose.
 *
 * The layout follows the prototype's activity stream, but the CONTENT is the
 * audit trail — configuration and account changes, not the licence-operations
 * flow the prototype mocked up (that lives in RequestEvent, which has no read
 * surface). Wording stays in audit voice; see activity.test.ts.
 */
export function ActivityFeed({ action }: { action?: ReactNode }) {
  const { data, isLoading, isError } = useAuditLog({ limit: FEED_LIMIT });
  const entries = data?.entries ?? [];

  return (
    <Card
      title="Recent activity"
      padded={false}
      // Nothing to link to while the trail is empty or unreachable.
      action={entries.length > 0 ? action : undefined}
    >
      {isLoading && <Loading label="Loading activity…" />}
      {isError && <LoadError />}
      {!isLoading && !isError && entries.length === 0 && (
        <EmptyState
          icon={<ScrollText size={18} strokeWidth={2} />}
          title="No activity yet"
          description="Account, OpCo and catalog changes appear here as they are recorded."
        />
      )}
      {entries.map((entry) => {
        const { text, ref } = activitySummary(entry);
        const Icon = activityIcon(entry.action);
        return (
          <div
            key={entry.id}
            className="flex items-start gap-[12px] border-b border-border px-[16px] py-[9px] last:border-0"
          >
            {/* 6px chip radius = --radius-sm (spacing.css:28) */}
            <span
              className={cn(
                'flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px]',
                TONE_SOFT[activityTone(entry.action)],
              )}
            >
              <Icon size={13} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 text-[12.5px] leading-[1.4]">
              {text}{' '}
              {/* mono: ref carries a record identifier (DS-5), as on /audit */}
              <span className="font-mono text-[11.5px] text-fg-subtle">
                {ref}
              </span>
            </div>
            <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-fg-subtle">
              {relativeTime(entry.createdAt)}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

/** Overview shows the tail only — /audit is where the full trail is browsed. */
const FEED_LIMIT = 6;
