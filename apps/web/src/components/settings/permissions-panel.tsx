import { Fragment } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { usePermissions } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { roleLabel } from '@/lib/user-admin';
import type { AccessKind, PermissionEntry } from '@/lib/api-types';

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[11px] align-middle';

// Semantic tint per access kind (DS-8) — all from the token palette, no new
// accent. `roles` is the normal case so it stays neutral; anything that widens
// reach is tinted so it reads as something to look at.
const ACCESS_TONE: Record<AccessKind, BadgeTone> = {
  roles: 'neutral',
  m2m: 'info',
  authenticated: 'warn',
  public: 'warn',
  unguarded: 'danger',
};

const ACCESS_LABEL: Record<AccessKind, string> = {
  roles: 'Role-restricted',
  m2m: 'Machine key',
  authenticated: 'Any signed-in',
  public: 'Public',
  unguarded: 'Unguarded',
};

/** Group by controller, keeping the backend's path ordering within each group. */
function groupByController(entries: PermissionEntry[]) {
  const groups = new Map<string, PermissionEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.controller);
    if (bucket) bucket.push(entry);
    else groups.set(entry.controller, [entry]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function Row({ entry }: { entry: PermissionEntry }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className={TD}>
        <span className="font-mono text-[11.5px] font-semibold text-fg-muted">
          {entry.method}
        </span>
      </td>
      <td className={TD}>
        <span className="font-mono text-[12.5px]">{entry.path}</span>
      </td>
      <td className={TD}>
        <Badge tone={ACCESS_TONE[entry.access]}>
          {ACCESS_LABEL[entry.access]}
        </Badge>
      </td>
      <td className={TD}>
        {entry.roles.length > 0 ? (
          <span className="text-[12.5px]">
            {entry.roles.map(roleLabel).join(' · ')}
          </span>
        ) : (
          <span className="text-[12.5px] text-fg-subtle">
            {entry.guards.length > 0 ? entry.guards.join(', ') : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * Role × endpoint matrix (W28). Read-only by design — the @Roles decorators in
 * the backend are the single source of truth (ADR-0009 Decision 8.5), so there
 * is nothing to edit here and the view carries no primary action.
 * ADMIN-only at the backend; a non-admin caller 403s into a restricted state.
 */
export function PermissionsPanel() {
  const permissions = usePermissions();

  if (permissions.isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-card">
        <Loading />
      </div>
    );
  }

  if (permissions.isError) {
    const forbidden =
      permissions.error instanceof ApiError && permissions.error.status === 403;
    return (
      <div className="rounded-[12px] border border-border bg-card">
        {forbidden ? (
          <EmptyState
            icon={<ShieldAlert size={18} strokeWidth={2} />}
            title="Access required"
            description="The permission matrix lists every endpoint in the platform, so it is limited to platform admins."
          />
        ) : (
          <LoadError description="Couldn't load the permission matrix. Check the API is running, then retry." />
        )}
      </div>
    );
  }

  const entries = permissions.data ?? [];
  const groups = groupByController(entries);
  const unguarded = entries.filter((e) => e.access === 'unguarded');

  return (
    <div className="flex flex-col gap-[16px]">
      <Card
        padded={false}
        title="Role &amp; endpoint matrix"
        subtitle={`${entries.length} endpoints across ${groups.length} controllers · derived live from the backend, not maintained by hand.`}
      >
        <div className="flex flex-col gap-[12px] px-[16px] pb-[4px] pt-[14px]">
          {/* R4 — the single most misread thing about this table. Endpoint access
              and row-level scope are different questions; say so on the page so
              nobody reads "OPCO_IT can call it" as "OPCO_IT sees everything". */}
          <p className="text-[11.5px] leading-[1.55] text-fg-muted">
            This answers <strong>which role may call an endpoint</strong>. It
            does not show <strong>row-level scope</strong> — an OpCo IT user is
            additionally limited to their own OpCo by the backend, which an
            endpoint-level matrix can’t express.
          </p>
          {unguarded.length > 0 && (
            <p className="text-[11.5px] leading-[1.55] text-danger">
              {unguarded.length} endpoint(s) carry no role restriction and are
              not on the reviewed allow-list — reachable by any signed-in user.
            </p>
          )}
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={18} strokeWidth={2} />}
            title="No endpoints reported"
            description="The API returned an empty matrix."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Method</th>
                  <th className={TH}>Endpoint</th>
                  <th className={TH}>Access</th>
                  <th className={TH}>Roles / guard</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([controller, rows]) => (
                  <Fragment key={controller}>
                    <tr className="border-b border-border">
                      <td
                        className="bg-hover px-[16px] py-[7px] text-[11px] font-semibold uppercase tracking-[.06em] text-fg-subtle"
                        colSpan={4}
                      >
                        {controller}
                      </td>
                    </tr>
                    {rows.map((entry) => (
                      <Row
                        key={`${entry.method} ${entry.path}`}
                        entry={entry}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
