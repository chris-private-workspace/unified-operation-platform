import { describe, expect, it } from 'vitest';
import {
  groupByCategory,
  hasGraceSeats,
  ownedBreakdownText,
  platformStatus,
} from './tenant-skus';
import type { SeatModel, TenantSkuRow } from './api-types';

function row(p: {
  id: string;
  owned?: number | null;
  allocatedToOpcos?: number;
  assignedToUsers?: number;
  category?: string | null;
  seatModel?: SeatModel;
  tenantConsumed?: number | null;
  /**
   * CH-027 — the buckets BEHIND `owned`. `enabled` defaults to the whole of
   * `owned` (i.e. no grace period), which is what every pre-CH-027 case here
   * describes; a grace-period case passes both and the fixture keeps
   * enabled + warning === owned, exactly as the API guarantees.
   */
  breakdown?: Partial<{
    enabled: number;
    warning: number;
    suspended: number;
    lockedOut: number;
    capabilityStatus: string;
  }>;
}): TenantSkuRow {
  const owned = p.owned ?? null;
  const allocatedToOpcos = p.allocatedToOpcos ?? 0;
  const seatModel = p.seatModel ?? 'prepaid';
  const unlimited = seatModel === 'unlimited';
  // Mirrors tenant-owned.service.ts so a fixture cannot describe a row the API
  // would never emit (e.g. unlimited WITH an unallocated figure).
  const noPrepaidSeats =
    !unlimited && owned === 0 && (p.tenantConsumed ?? 0) > 0;
  const warning = p.breakdown?.warning ?? 0;
  return {
    skuCatalogId: p.id,
    sku: {
      skuId: `g-${p.id}`,
      skuPartNumber: p.id.toUpperCase(),
      displayName: p.id,
      category: p.category ?? null,
    },
    seatModel,
    owned,
    ownedBreakdown:
      owned === null
        ? null
        : {
            enabled: p.breakdown?.enabled ?? owned - warning,
            warning,
            suspended: p.breakdown?.suspended ?? 0,
            lockedOut: p.breakdown?.lockedOut ?? 0,
            capabilityStatus: p.breakdown?.capabilityStatus ?? 'Enabled',
          },
    tenantConsumed: p.tenantConsumed ?? null,
    allocatedToOpcos,
    assignedToUsers: p.assignedToUsers ?? 0,
    unallocated:
      unlimited || noPrepaidSeats || owned === null
        ? null
        : owned - allocatedToOpcos,
    overAllocated: !unlimited && owned !== null && allocatedToOpcos > owned,
    noPrepaidSeats,
  };
}

describe('platformStatus', () => {
  it('over-allocated (allocated > owned) → danger', () => {
    expect(
      platformStatus(row({ id: 'a', owned: 10, allocatedToOpcos: 14 })),
    ).toEqual({
      label: 'Over-allocated',
      tone: 'danger',
    });
  });

  it('owned unknown (never synced) → Not synced neutral', () => {
    expect(
      platformStatus(row({ id: 'b', owned: null, allocatedToOpcos: 5 })),
    ).toEqual({
      label: 'Not synced',
      tone: 'neutral',
    });
  });

  it('owned fully committed to OpCos → Fully allocated warn', () => {
    expect(
      platformStatus(row({ id: 'c', owned: 10, allocatedToOpcos: 10 })),
    ).toEqual({
      label: 'Fully allocated',
      tone: 'warn',
    });
  });

  it('headroom available → Available ok', () => {
    expect(
      platformStatus(row({ id: 'd', owned: 10, allocatedToOpcos: 4 })),
    ).toEqual({
      label: 'Available',
      tone: 'ok',
    });
  });

  // ── CH-026 / ADR-0032 ──────────────────────────────────────────────────
  it('unlimited wins over every owned-derived verdict', () => {
    // The sentinel is bigger than any allocation, so the ordinary rules would
    // land on "Available" — right by accident. It has to be right on purpose.
    expect(
      platformStatus(
        row({
          id: 'pbi',
          seatModel: 'unlimited',
          owned: 1000000,
          allocatedToOpcos: 40,
          tenantConsumed: 3064,
        }),
      ),
    ).toEqual({ label: 'Unlimited', tone: 'neutral' });
  });

  /**
   * CH-027 acceptance G2 — VIVA's live shape. The label comes from Microsoft's
   * capabilityStatus, not from suspended > 0.
   */
  it('prepaid with 0 assignable but in use, subscription cancelled → Subscription suspended warn', () => {
    expect(
      platformStatus(
        row({
          id: 'viva',
          owned: 0,
          tenantConsumed: 30,
          breakdown: { suspended: 50, capabilityStatus: 'Suspended' },
        }),
      ),
    ).toEqual({ label: 'Subscription suspended', tone: 'warn' });
  });

  it('does not claim a suspended subscription when M365 does not say so', () => {
    expect(
      platformStatus(row({ id: 'odd', owned: 0, tenantConsumed: 7 })),
    ).toEqual({ label: 'No seats available', tone: 'warn' });
  });

  /**
   * 🔴 THE case that makes G2 an assertion rather than a coincidence — and it
   * had to be added after the falsification pass, because the two cases above
   * do NOT discriminate: on both of them `suspended > 0` and
   * `capabilityStatus === 'Suspended'` agree, so an implementation that inferred
   * the verdict from the count passed them both (27 green). Same family as
   * CH-023's tautology: an expectation can look strict and still separate
   * nothing.
   *
   * Here the two rules disagree. The shape is real: capabilityStatus is
   * Microsoft's verdict on the SUBSCRIPTION, while the buckets are counts that
   * move — a cancelled subscription's seats leave `suspended` when the retention
   * window closes, and the verdict outlives the count. That is the whole reason
   * ADR-0033 D1 stores the status instead of deriving it.
   */
  it('reads the M365 verdict, not the suspended count, when the two disagree', () => {
    expect(
      platformStatus(
        row({
          id: 'gone',
          owned: 0,
          tenantConsumed: 4,
          breakdown: {
            suspended: 0,
            lockedOut: 5,
            capabilityStatus: 'Suspended',
          },
        }),
      ),
    ).toEqual({ label: 'Subscription suspended', tone: 'warn' });
  });

  it('keeps Over-allocated ahead of the no-seats label when both are true', () => {
    expect(
      platformStatus(
        row({
          id: 'both',
          owned: 0,
          tenantConsumed: 91,
          allocatedToOpcos: 5,
        }),
      ),
    ).toEqual({ label: 'Over-allocated', tone: 'danger' });
  });

  /**
   * CH-027 — the SKU that started all of this. Before ADR-0033 it read
   * "No seats enabled" while the tenant had 790 usable seats.
   */
  it('a lapsed subscription with grace seats is Available, not flagged', () => {
    expect(
      platformStatus(
        row({
          id: 'pbipro',
          owned: 790,
          tenantConsumed: 91,
          breakdown: { enabled: 0, warning: 790, capabilityStatus: 'Warning' },
        }),
      ),
    ).toEqual({ label: 'Available', tone: 'ok' });
  });
});

describe('grace-period display helpers (ADR-0033 D7)', () => {
  it('flags a row whose owned leans on the expiry grace period', () => {
    expect(
      hasGraceSeats(
        row({
          id: 'e3',
          owned: 4498,
          breakdown: { enabled: 21, warning: 4477 },
        }),
      ),
    ).toBe(true);
  });

  it('does not flag a clean prepaid row, nor one that was never synced', () => {
    expect(hasGraceSeats(row({ id: 'e1', owned: 100 }))).toBe(false);
    expect(hasGraceSeats(row({ id: 'x', owned: null }))).toBe(false);
  });

  it('names the excluded buckets as excluded, and carries M365 status', () => {
    const text = ownedBreakdownText(
      row({
        id: 'e3',
        owned: 4498,
        breakdown: {
          enabled: 21,
          warning: 4477,
          suspended: 3,
          lockedOut: 5,
          capabilityStatus: 'Warning',
        },
      }),
    );
    // Hard-coded whole string: a check for "contains 4477" would pass on text
    // that presented the suspended seats as part of the total.
    expect(text).toBe(
      'enabled 21 · expiry grace period 4477 · suspended 3 (not counted) · locked out 5 (not counted) · M365 status Warning',
    );
  });

  it('omits the empty buckets rather than printing zeroes', () => {
    expect(
      ownedBreakdownText(
        row({
          id: 'e1',
          owned: 100,
          breakdown: { capabilityStatus: 'Enabled' },
        }),
      ),
    ).toBe('enabled 100 · expiry grace period 0 · M365 status Enabled');
  });

  it('has nothing to say about a SKU that was never synced', () => {
    expect(ownedBreakdownText(row({ id: 'x', owned: null }))).toBeUndefined();
  });
});

describe('groupByCategory', () => {
  it('groups by category (null → Uncategorized), preserves order, sums subtotals', () => {
    const groups = groupByCategory([
      {
        ...row({
          id: 'e3',
          category: 'Base',
          owned: 2000,
          allocatedToOpcos: 2285,
        }),
      },
      {
        ...row({
          id: 'e1',
          category: 'Base',
          owned: 100,
          allocatedToOpcos: 86,
        }),
      },
      {
        ...row({
          id: 'ad',
          category: 'Add-on',
          owned: 50,
          allocatedToOpcos: 20,
        }),
      },
      { ...row({ id: 'x', category: null, owned: 10, allocatedToOpcos: 5 }) },
    ]);

    expect(groups.map((g) => g.category)).toEqual([
      'Base',
      'Add-on',
      'Uncategorized',
    ]);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].subtotal).toEqual({
      owned: 2100,
      allocated: 2371,
      assigned: 0,
      unallocated: -271, // 2100 - 2371
      unlimited: 0,
    });
    expect(groups[1].subtotal).toEqual({
      owned: 50,
      allocated: 20,
      assigned: 0,
      unallocated: 30,
      unlimited: 0,
    });
    expect(groups[2].category).toBe('Uncategorized');
  });

  it('counts owned=null as 0 in a subtotal', () => {
    const [g] = groupByCategory([
      {
        ...row({
          id: 'synced',
          category: 'Base',
          owned: 100,
          allocatedToOpcos: 40,
        }),
      },
      {
        ...row({
          id: 'unsynced',
          category: 'Base',
          owned: null,
          allocatedToOpcos: 30,
        }),
      },
    ]);
    expect(g.subtotal).toEqual({
      owned: 100, // null → 0
      allocated: 70,
      assigned: 0,
      unlimited: 0,
      unallocated: 30,
    });
  });

  it('empty rows → empty groups', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  // Same line the stats endpoint draws (ADR-0032 D3): a subtotal that added the
  // sentinel would put 1,000,000 on a category row and make the column useless.
  it('leaves unlimited SKUs out of owned / unallocated but keeps their seats', () => {
    const [g] = groupByCategory([
      row({ id: 'e3', category: 'Base', owned: 2000, allocatedToOpcos: 1800 }),
      row({
        id: 'pbi',
        category: 'Base',
        seatModel: 'unlimited',
        owned: 1000000,
        allocatedToOpcos: 40,
        assignedToUsers: 12,
      }),
    ]);

    expect(g.subtotal).toEqual({
      owned: 2000, // hard-coded: the sentinel must not appear at any scale
      allocated: 1840, // 1800 + 40 — real seats on both
      assigned: 12,
      unallocated: 200, // 2000 - 1800, prepaid only
      unlimited: 1,
    });
  });
});
