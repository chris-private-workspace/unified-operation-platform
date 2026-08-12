import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformView } from './platform-view';
import { useCatalog, useTenantSkus, useTenantSkuStats } from '@/hooks/queries';
import type { TenantSkuRow, TenantSkuStats } from '@/lib/api-types';

/**
 * CH-026 / ADR-0032. The pure derivations already have tests (`tenant-skus.ts`),
 * so what is guarded HERE is the half those cannot reach: what a cell actually
 * renders. BUG-011 is the reason that distinction is worth a file — three layers
 * of green tests, each stopping at its own edge, with the defect living in the
 * gap between them.
 */

vi.mock('@/hooks/queries', () => ({
  useTenantSkus: vi.fn(),
  useTenantSkuStats: vi.fn(),
  useCatalog: vi.fn(),
}));

const row = (over: Partial<TenantSkuRow> & { skuCatalogId: string }) => {
  const seatModel = over.seatModel ?? 'prepaid';
  return {
    sku: {
      skuId: `guid-${over.skuCatalogId}`,
      skuPartNumber: over.skuCatalogId.toUpperCase(),
      displayName: over.skuCatalogId,
      category: 'Base',
    },
    seatModel,
    owned: null,
    tenantConsumed: null,
    allocatedToOpcos: 0,
    assignedToUsers: 0,
    unallocated: null,
    overAllocated: false,
    noPrepaidSeats: false,
    ...over,
  } as TenantSkuRow;
};

const stats = (over: Partial<TenantSkuStats> = {}): TenantSkuStats => ({
  totalOwned: 2000,
  totalAllocated: 1840,
  totalAssigned: 12,
  totalUnallocated: 200,
  skusOverAllocated: 0,
  unlimitedSkus: 0,
  ...over,
});

function arrange(rows: TenantSkuRow[], s: TenantSkuStats = stats()) {
  vi.mocked(useTenantSkus).mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useTenantSkuStats).mockReturnValue({
    data: s,
    isLoading: false,
    isError: false,
  } as never);
  vi.mocked(useCatalog).mockReturnValue({ data: [] } as never);
}

/** The <tr> a SKU's display name sits in — cells are asserted within it. */
const rowFor = (displayName: string) =>
  screen.getByText(displayName).closest('tr') as HTMLElement;

describe('PlatformView — seat model rendering (CH-026)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows Unlimited instead of the Graph sentinel, and an em-dash for Unalloc.', () => {
    arrange([
      row({
        skuCatalogId: 'pbi',
        seatModel: 'unlimited',
        owned: 1000000,
        tenantConsumed: 3064,
        allocatedToOpcos: 40,
        assignedToUsers: 12,
        unallocated: null,
      }),
    ]);

    render(<PlatformView />);

    const tr = rowFor('pbi');
    // Twice on purpose: the Owned cell and the status badge. Asserting a single
    // match would break the moment either one lands, which says nothing.
    expect(within(tr).getAllByText('Unlimited')).toHaveLength(2);
    // The number itself must be gone, not merely relabelled.
    expect(within(tr).queryByText('1000000')).not.toBeInTheDocument();
    expect(within(tr).getByText('—')).toBeInTheDocument();
    // 0 would read as "all used up" — the one misreading ADR-0032 D3 names.
    expect(within(tr).queryByText('0')).not.toBeInTheDocument();
  });

  it('draws no owned bar for an unlimited SKU (there is no denominator)', () => {
    arrange([
      row({ skuCatalogId: 'pbi', seatModel: 'unlimited', owned: 1000000 }),
      row({ skuCatalogId: 'e3', owned: 2000, allocatedToOpcos: 1800 }),
    ]);

    render(<PlatformView />);

    expect(
      within(rowFor('pbi')).queryByTestId('owned-bar'),
    ).not.toBeInTheDocument();
    expect(within(rowFor('e3')).getByTestId('owned-bar')).toBeInTheDocument();
  });

  it('gives a prepaid SKU with 0 owned but real usage its own status', () => {
    arrange([
      row({
        skuCatalogId: 'pbipro',
        owned: 0,
        tenantConsumed: 91,
        noPrepaidSeats: true,
        unallocated: null,
      }),
    ]);

    render(<PlatformView />);

    expect(
      within(rowFor('pbipro')).getByText('No prepaid seats'),
    ).toBeInTheDocument();
  });

  it('renders an ordinary SKU exactly as before', () => {
    arrange([
      row({
        skuCatalogId: 'e3',
        owned: 2000,
        allocatedToOpcos: 1800,
        assignedToUsers: 12,
        unallocated: 200,
      }),
    ]);

    render(<PlatformView />);

    const tr = rowFor('e3');
    expect(within(tr).getByText('2000')).toBeInTheDocument();
    expect(within(tr).getByText('Available')).toBeInTheDocument();
    expect(within(tr).getByTestId('owned-bar')).toBeInTheDocument();
    expect(within(tr).queryByText('Unlimited')).not.toBeInTheDocument();
  });

  it('renames the owned KPI and names what it left out', () => {
    arrange(
      [row({ skuCatalogId: 'e3', owned: 2000 })],
      stats({
        unlimitedSkus: 22,
      }),
    );

    render(<PlatformView />);

    expect(screen.getByText('Prepaid seats')).toBeInTheDocument();
    expect(screen.queryByText('Owned in M365')).not.toBeInTheDocument();
    // The count is the whole point: a total that quietly shrank by four million
    // has to say how many SKUs went with it.
    expect(screen.getByText('22 unlimited SKUs excluded')).toBeInTheDocument();
    // And the allocated tile has to declare its own narrower scope, or someone
    // will subtract one figure from the other and find they do not reconcile.
    expect(
      screen.getByText('200 unallocated (prepaid SKUs)'),
    ).toBeInTheDocument();
  });

  it('says nothing about unlimited SKUs when there are none', () => {
    arrange([row({ skuCatalogId: 'e3', owned: 2000 })]);

    render(<PlatformView />);

    expect(screen.getByText('prepaid across tenant')).toBeInTheDocument();
  });
});
