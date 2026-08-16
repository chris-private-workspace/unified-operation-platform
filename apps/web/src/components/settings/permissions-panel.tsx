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
//
// The two agent kinds take `purple`, which is the console's existing AI tone
// (DS-8) — not a risk tint. Needing a human decision is what makes a propose
// tool SAFE, so tinting it `warn` would have the table shout at the one row
// whose design is working.
const ACCESS_TONE: Record<AccessKind, BadgeTone> = {
  roles: 'neutral',
  m2m: 'info',
  authenticated: 'warn',
  public: 'warn',
  unguarded: 'danger',
  'agent-read': 'purple',
  'agent-propose': 'purple',
};

const ACCESS_LABEL: Record<AccessKind, string> = {
  roles: 'Role-restricted',
  m2m: 'Machine key',
  authenticated: 'Any signed-in',
  public: 'Public',
  unguarded: 'Unguarded',
  'agent-read': 'Agent read',
  'agent-propose': 'Agent proposal',
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
 * Actor × surface matrix (W28, widened in W46 G2). Read-only by design — the
 * @Roles decorators and the agent tool registry are the single sources of truth
 * (ADR-0009 Decision 8.5 / ADR-0036 D7), so there is nothing to edit here and
 * the view carries no primary action.
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
  // W46 G2 — routes and agent tools are both reachable surfaces, but counting
  // them together would report a number of "endpoints" that is not true of
  // either. Kept apart in the count for the same reason they are kept apart in
  // the matrix.
  const routes = entries.filter((e) => e.actor === 'user');
  const agentTools = entries.filter((e) => e.actor === 'agent');
  const controllerCount = new Set(routes.map((e) => e.controller)).size;
  // The clause disappears rather than reading "plus 0 agent tools": this panel
  // predates the agent, and a deployment with no tools should not be told about
  // an actor it does not have.
  const subtitle =
    `${routes.length} endpoints across ${controllerCount} controllers` +
    (agentTools.length > 0 ? `, plus ${agentTools.length} agent tools` : '') +
    ' · derived live from the backend, not maintained by hand.';

  return (
    <div className="flex flex-col gap-[16px]">
      <Card padded={false} title="Access matrix" subtitle={subtitle}>
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
          {/* G2 — the agent rows are the ones a reader will misjudge, in either
              direction: they are not endpoints, and the agent holds no role at
              all. Both halves are said here rather than left to the badge. */}
          {agentTools.length > 0 && (
            <p className="text-[11.5px] leading-[1.55] text-fg-muted">
              The <strong>agent tools</strong> are not endpoints — an AI agent
              reaches them in-process, and it holds{' '}
              <strong>no role of its own</strong>. A tool marked{' '}
              <em>Agent proposal</em> changes nothing by itself: a person
              approves it first, and the platform’s own checks still run and can
              still refuse. Each one runs under the OpCo scope of whoever
              started the run.
            </p>
          )}
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
