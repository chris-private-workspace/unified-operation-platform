import { Fragment, useMemo, useState } from 'react';
import {
  Boxes,
  Info,
  KeyRound,
  Layers,
  Lock,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { useCatalog, useTenantSkus, useTenantSkuStats } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import {
  groupByCategory,
  hasGraceSeats,
  ownedBreakdownText,
  platformStatus,
} from '@/lib/tenant-skus';
import type { TenantSkuRow } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[11px] align-middle';
const NUM = 'text-right font-mono text-[12.5px]';

const numOr = (n: number | null): string => (n === null ? '—' : String(n));

// Dual-segment bar of owned (prototype): assigned-to-users (info) + allocated-
// not-yet-assigned (border-strong). Over-allocated → the second segment goes
// danger and fills the remainder. owned null/0 → an empty track. Widths are DATA
// (not design values), so inline style is correct here.
function OwnedBar({ row }: { row: TenantSkuRow }) {
  // ADR-0032 — no bar for an unlimited SKU. The bar reads "how much of what we
  // own is spoken for", and there is no denominator; drawing it against the
  // Graph sentinel would render a permanently empty track that looks like
  // "nothing assigned" while thousands of people are using the licence.
  if (row.seatModel === 'unlimited') return null;
  const owned = row.owned && row.owned > 0 ? row.owned : 0;
  const assignedPct = owned
    ? Math.min(100, (row.assignedToUsers / owned) * 100)
    : 0;
  const allocExtraPct = owned
    ? Math.min(
        100 - assignedPct,
        (Math.max(0, row.allocatedToOpcos - row.assignedToUsers) / owned) * 100,
      )
    : 0;
  return (
    <div
      data-testid="owned-bar"
      className="flex h-[5px] w-[130px] overflow-hidden rounded-[4px] bg-hover"
    >
      <div className="h-full bg-info" style={{ width: `${assignedPct}%` }} />
      <div
        className={cn(
          'h-full',
          row.overAllocated ? 'bg-danger' : 'bg-border-strong',
        )}
        style={{
          width: row.overAllocated
            ? `${100 - assignedPct}%`
            : `${allocExtraPct}%`,
        }}
      />
    </div>
  );
}

/** Platform assets view (W17) — tenant three-layer owned/allocated/assigned per SKU. */
export function PlatformView() {
  const tenant = useTenantSkus(true);
  const stats = useTenantSkuStats(true);
  const catalog = useCatalog();
  const [q, setQ] = useState('');

  // 403 = OPCO_IT hitting a tenant-admin surface (OD1: graceful, not a crash).
  const restricted =
    tenant.error instanceof ApiError && tenant.error.status === 403;

  const baseBySkuId = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const s of catalog.data ?? []) m.set(s.skuId, s.isBaseLicense);
    return m;
  }, [catalog.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tenant.data ?? []).filter(
      (r) =>
        !needle ||
        r.sku.displayName.toLowerCase().includes(needle) ||
        r.sku.skuPartNumber.toLowerCase().includes(needle),
    );
  }, [tenant.data, q]);

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const overCount = stats.data?.skusOverAllocated ?? 0;
  const kpi = (n: number): string =>
    stats.isLoading || stats.isError ? '—' : String(n);

  if (restricted) {
    return (
      <Card>
        <EmptyState
          tone="neutral"
          icon={<Lock size={18} strokeWidth={2} />}
          title="Platform view restricted"
          description="Tenant-wide owned / allocated figures are available to platform admins (ADMIN / REGIONAL). Your per-OpCo view is under By OpCo."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Reconciliation tiles (M365 owned → allocated → assigned). */}
      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
        {/* ADR-0032 D3 / OQ-4 — renamed from "Owned in M365". A total that
            excludes a fifth of the SKUs cannot keep calling itself what M365
            owns, and the sub-line names what was left out rather than letting
            the figure quietly shrink.

            ADR-0033 D7 — and renamed again one day later, because D2 made it
            count grace-period seats too: it is no longer "prepaid". The cost of
            CH-026 having been written while we could only see one of the four
            prepaidUnits buckets. */}
        <StatCard
          label="Available seats"
          value={kpi(stats.data?.totalOwned ?? 0)}
          tone="info"
          icon={<Boxes size={16} strokeWidth={2} />}
          sub={
            stats.data && stats.data.unlimitedSkus > 0
              ? `${stats.data.unlimitedSkus} unlimited ${stats.data.unlimitedSkus === 1 ? 'SKU' : 'SKUs'} excluded`
              : 'prepaid across tenant'
          }
        />
        <StatCard
          label="Allocated to OpCos"
          value={kpi(stats.data?.totalAllocated ?? 0)}
          tone="neutral"
          icon={<Layers size={16} strokeWidth={2} />}
          sub={
            // "prepaid SKUs" is not decoration: this figure is scoped to them
            // while the value above it counts every SKU, so subtracting one
            // from the other would not reconcile.
            stats.data
              ? `${stats.data.totalUnallocated} unallocated (prepaid SKUs)`
              : ' '
          }
        />
        <StatCard
          label="Assigned to users"
          value={kpi(stats.data?.totalAssigned ?? 0)}
          tone="ok"
          icon={<KeyRound size={16} strokeWidth={2} />}
          sub="in active use"
        />
      </div>

      {/* SKU search */}
      <div className="flex justify-end">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter SKU…"
            className="h-[32px] w-[190px] rounded-lg border border-border bg-card pl-[30px] pr-[10px] text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:border-border-strong"
          />
        </div>
      </div>

      <Card
        padded={false}
        title="Tenant licenses by SKU"
        subtitle="M365 owned vs allocated to OpCos vs assigned to users"
        action={
          overCount > 0 ? (
            <Badge tone="danger">
              <TriangleAlert size={12} strokeWidth={2.4} />
              {overCount} {overCount === 1 ? 'SKU' : 'SKUs'} over-allocated
            </Badge>
          ) : undefined
        }
      >
        {tenant.isLoading ? (
          <Loading />
        ) : tenant.isError ? (
          <LoadError description="Couldn't load tenant licenses. Check the API is running, then retry." />
        ) : (tenant.data ?? []).length === 0 ? (
          <EmptyState
            tone="neutral"
            icon={<Boxes size={18} strokeWidth={2} />}
            title="No tenant SKUs synced yet"
            description="Sync the catalog from the tenant (SKU Catalog) to capture owned seats, then allocations appear here."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            tone="ok"
            icon={<Search size={18} strokeWidth={2} />}
            title="Nothing here"
            description="No SKUs match this filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>SKU</th>
                  <th className={cn(TH, 'text-right')}>Owned</th>
                  <th className={cn(TH, 'text-right')}>Allocated</th>
                  <th className={cn(TH, 'text-right')}>Assigned</th>
                  {/* CH-028 D1 — beside Assigned on purpose. Assigned is the
                      platform's own ledger; this is what M365 reports. Putting
                      a column between them would remove the only reason to
                      show it. D2 stops here: the difference is deliberately NOT
                      computed on this screen — Drift owns that number, and it
                      reads a LIVE tenant total while this reads the last
                      snapshot, so a second delta here would disagree with it. */}
                  {/* nowrap: two words in a narrow numeric column wrap to two
                      lines and make this header taller than every other one.
                      The table already scrolls horizontally. */}
                  <th className={cn(TH, 'whitespace-nowrap text-right')}>
                    In M365
                  </th>
                  <th className={cn(TH, 'text-right')}>Unalloc.</th>
                  <th className={cn(TH, 'text-center')}>Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Grand total (from the scoped stats aggregate). */}
                <tr className="border-b-2 border-border-strong bg-hover">
                  <td
                    className={cn(
                      TD,
                      'text-[11px] font-bold uppercase tracking-[.04em]',
                    )}
                  >
                    All SKUs · total
                  </td>
                  <td className={cn(TD, NUM, 'font-bold')}>
                    {kpi(stats.data?.totalOwned ?? 0)}
                  </td>
                  <td className={cn(TD, NUM, 'font-bold text-fg-muted')}>
                    {kpi(stats.data?.totalAllocated ?? 0)}
                  </td>
                  <td className={cn(TD, NUM, 'font-bold text-info')}>
                    {kpi(stats.data?.totalAssigned ?? 0)}
                  </td>
                  <td className={cn(TD, NUM, 'font-bold')}>
                    {kpi(stats.data?.totalConsumed ?? 0)}
                  </td>
                  <td
                    className={cn(
                      TD,
                      NUM,
                      'font-bold',
                      (stats.data?.totalUnallocated ?? 0) < 0
                        ? 'text-danger'
                        : 'text-fg-muted',
                    )}
                  >
                    {kpi(stats.data?.totalUnallocated ?? 0)}
                  </td>
                  <td className={TD} />
                </tr>

                {groups.map((g) => (
                  <Fragment key={g.category}>
                    {/* category subheader */}
                    <tr className="bg-hover">
                      <td
                        colSpan={7}
                        className="px-[16px] py-[6px] text-[10.5px] font-bold uppercase tracking-[.06em] text-fg-muted"
                      >
                        {g.category}
                      </td>
                    </tr>
                    {g.rows.map((r) => {
                      const status = platformStatus(r);
                      return (
                        <tr
                          key={r.skuCatalogId}
                          className="border-b border-border"
                        >
                          <td className={TD}>
                            <div className="flex flex-col gap-[5px]">
                              <div className="flex items-center gap-[8px]">
                                <span className="font-medium">
                                  {r.sku.displayName}
                                </span>
                                {baseBySkuId.get(r.sku.skuId) && (
                                  <Badge tone="info">BASE</Badge>
                                )}
                              </div>
                              <OwnedBar row={r} />
                            </div>
                          </td>
                          <td
                            className={cn(TD, NUM)}
                            title={ownedBreakdownText(r)}
                          >
                            {r.seatModel === 'unlimited' ? (
                              // Sans, not mono: it is a word in a numeric
                              // column. DS-5 asks for mono on NUMBERS, and
                              // ADR-0032 D3 rejected `∞` for the same reason —
                              // it would not line up and reads as nothing.
                              <span className="font-sans text-fg-muted">
                                Unlimited
                              </span>
                            ) : (
                              numOr(r.owned)
                            )}
                            {/* ADR-0033 D7 — a number propped up by an expired
                                subscription is not the same fact as a clean
                                purchased count, so it says which part is which.
                                An annotation on the number, NOT a second status
                                badge: the Status column already owns state
                                (DS-8), and two places claiming it drift. */}
                            {r.seatModel !== 'unlimited' &&
                              hasGraceSeats(r) && (
                                <div
                                  data-testid="grace-seats"
                                  className="text-[10.5px] font-normal leading-[1.5] text-fg-subtle"
                                >
                                  {r.ownedBreakdown!.enabled} +{' '}
                                  {r.ownedBreakdown!.warning} grace
                                </div>
                              )}
                          </td>
                          <td className={cn(TD, NUM, 'text-fg-muted')}>
                            {r.allocatedToOpcos}
                          </td>
                          <td className={cn(TD, NUM, 'text-info')}>
                            {r.assignedToUsers}
                          </td>
                          {/* No colour: `Assigned` is info because it is the
                              platform's own figure, and tinting this one the
                              same way would claim they are the same kind of
                              fact. Left plain like `Owned` — both come from the
                              tenant snapshot. `—` (not 0) when never synced:
                              zero usage is an answer, and it is the wrong one. */}
                          <td className={cn(TD, NUM)}>
                            {numOr(r.tenantConsumed)}
                          </td>
                          <td
                            className={cn(
                              TD,
                              NUM,
                              r.unallocated !== null && r.unallocated < 0
                                ? 'text-danger'
                                : 'text-fg-muted',
                            )}
                          >
                            {numOr(r.unallocated)}
                          </td>
                          <td className={cn(TD, 'text-center')}>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {/* category subtotal */}
                    <tr
                      data-testid="category-subtotal"
                      className="border-b border-border bg-hover"
                    >
                      <td
                        className={cn(
                          TD,
                          'text-[11px] font-semibold text-fg-muted',
                        )}
                      >
                        Subtotal · {g.category}
                        {g.subtotal.unlimited > 0 && (
                          <span className="ml-[6px] font-normal text-fg-subtle">
                            · {g.subtotal.unlimited} unlimited excluded
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(TD, NUM, 'font-semibold text-fg-muted')}
                      >
                        {g.subtotal.owned}
                      </td>
                      <td
                        className={cn(TD, NUM, 'font-semibold text-fg-muted')}
                      >
                        {g.subtotal.allocated}
                      </td>
                      <td
                        className={cn(TD, NUM, 'font-semibold text-fg-muted')}
                      >
                        {g.subtotal.assigned}
                      </td>
                      <td
                        className={cn(TD, NUM, 'font-semibold text-fg-muted')}
                      >
                        {g.subtotal.consumed}
                      </td>
                      <td
                        className={cn(
                          TD,
                          NUM,
                          'font-semibold',
                          g.subtotal.unallocated < 0
                            ? 'text-danger'
                            : 'text-fg-muted',
                        )}
                      >
                        {g.subtotal.unallocated}
                      </td>
                      <td className={TD} />
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bar legend (prototype): the three segments of the owned bar. */}
      <div className="flex flex-wrap items-center gap-[14px] text-[11.5px] text-fg-subtle">
        <span className="flex items-center gap-[5px]">
          <span className="h-[10px] w-[10px] rounded-[3px] bg-info" />
          assigned to users
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="h-[10px] w-[10px] rounded-[3px] bg-border-strong" />
          allocated, not yet assigned
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="h-[10px] w-[10px] rounded-[3px] bg-danger" />
          allocated beyond owned
        </span>
      </div>

      {/* Honest scope note (H7). */}
      <p className="flex items-start gap-[7px] text-[11.5px] leading-[1.5] text-fg-subtle">
        <Info size={13} strokeWidth={2} className="mt-[2px] shrink-0" />
        <span>
          Owned = M365 seats available to assign (from the last tenant sync):
          enabled seats plus any inside an expired subscription&rsquo;s grace
          period, which still work. Cancelled and locked-out seats are excluded.
          Hover a number for the breakdown.{' '}
          <span className="font-medium text-fg-muted">Assigned</span> is the
          platform&rsquo;s own ledger;{' '}
          <span className="font-medium text-fg-muted">In M365</span> is what the
          tenant reported at that sync. Where they differ, Drift tracks it. SKUs
          marked <span className="font-medium text-fg-muted">Unlimited</span>{' '}
          have no purchased seat count, so they are left out of the owned totals
          — their allocations and assignments still count. Seat model, tenant
          counts and per-OpCo allocations are set in SKU Catalog / Settings ›
          Integrations → Import.
        </span>
      </p>
    </div>
  );
}
