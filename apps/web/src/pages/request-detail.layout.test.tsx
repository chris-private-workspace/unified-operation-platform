import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestDetail } from './request-detail';
import {
  useRequest,
  useCatalog,
  useLedger,
  useTenantSkus,
} from '@/hooks/queries';
import {
  useAdvanceStage,
  useAssignLineItem,
  useMarkSynced,
  useSyncCheck,
  useUpdateRequest,
  useAddLineItem,
  useRemoveLineItem,
} from '@/hooks/mutations';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import type { RequestDetail as RequestDetailType } from '@/lib/api-types';

/**
 * CH-033 — the request detail layout.
 *
 * 🔴 The headline claim of this change — "three panels, one column each" — is
 * GEOMETRY, and jsdom computes no layout, so it is verified by a render probe
 * against a real browser (`spec.md` `G2`: three rects, same `top`, widths within
 * 2px) rather than here. What lives in this file is everything that survives
 * without a layout engine:
 *
 *   - the font sizes are the ones the design system actually defines (`G1`)
 *   - the column COUNT follows the same predicate as the card it counts (`G3`)
 *   - the remark is outside the grid rather than inside it (`G4`)
 *
 * 📌 Splitting it this way is the point, not a compromise: an assertion on the
 * `lg:grid-cols-3` class would only restate the line I just wrote, which is the
 * tautology `spec.md` `R2` warns about. The class is checked HERE only where it
 * is a branch (`G3`); whether it produced three equal columns is checked THERE.
 */

vi.mock('@/hooks/queries', () => ({
  useRequest: vi.fn(),
  useCatalog: vi.fn(),
  useLedger: vi.fn(),
  useTenantSkus: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({
  useAdvanceStage: vi.fn(),
  useAssignLineItem: vi.fn(),
  useMarkSynced: vi.fn(),
  useSyncCheck: vi.fn(),
  useUpdateRequest: vi.fn(),
  useAddLineItem: vi.fn(),
  useRemoveLineItem: vi.fn(),
}));
vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/components/requests/ai-assist-card', () => ({
  AiAssistCard: () => <div data-testid="ai-assist-card" />,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'r1' }),
}));

const LINE = () => ({
  id: 'li-1',
  requestId: 'r1',
  skuCatalogId: 'sku-1',
  quantity: 1,
  procurementRequired: false,
  stage: 'READY',
  serviceNowSysId: 'ritm-sys',
  serviceNowNumber: 'RITM0047290',
  quoteRef: null,
  poRef: null,
  quotedAt: null,
  opcoApprovedAt: null,
  vendorOrderedAt: null,
  readyAt: '2026-08-01T00:00:00Z',
  assignedAt: null,
  note: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  sku: { skuId: 'g-1', skuPartNumber: 'O365_E3', displayName: 'Office 365 E3' },
});

function show(over: Partial<RequestDetailType> = {}) {
  vi.mocked(useRequest).mockReturnValue({
    data: {
      id: 'r1abcdef123456',
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ0012345',
      serviceNowStatus: null,
      origin: 'onboarding-intake',
      rawRequestText: null,
      requesterEmail: null,
      targetUpn: 'new.user@rhk.com',
      targetDisplayName: 'New User',
      opcoId: 'opco-rhk',
      status: 'OPEN',
      handledById: null,
      accountCreatedAt: '2026-08-01T00:00:00Z',
      azureSyncedAt: '2026-08-01T01:00:00Z',
      serviceNowUserSyncedAt: '2026-08-01T01:05:00Z',
      serviceNowUserSysId: 'u-sys',
      serviceNowLicenceReqNumber: 'REQ0044083',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      opco: { code: 'RHK', displayName: 'RHK Co' },
      lineItems: [LINE()],
      events: [],
      ...over,
    },
    isLoading: false,
    isError: false,
  } as never);
  return render(<RequestDetail />);
}

/** The panel grid — the one element whose column count this change is about. */
const gridOf = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('[class*="lg:grid-cols-"]');

/** Every font size the design system defines, as bare px strings. */
function typographyScale(): Set<string> {
  const tokens = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'design_handoff_licenseops',
      'design-system',
      'tokens',
      'typography.css',
    ),
    'utf8',
  );
  return new Set(
    [...tokens.matchAll(/--text-[a-z0-9]+:\s*([\d.]+)px/g)].map((m) => m[1]),
  );
}

/**
 * The three sizes inside `TicketRef`, in source order.
 *
 * ⚠️ Sliced to the component BODY. The doc comment above it quotes the old
 * sizes on purpose (that is what makes the comment useful), and reading those
 * would make every assertion below pass for the wrong reason.
 */
function ticketRefSizes(): string[] {
  const source = readFileSync(join(__dirname, 'request-detail.tsx'), 'utf8');
  const body = source.slice(
    source.indexOf('function TicketRef'),
    source.indexOf('function EditField'),
  );
  // If the slice ever stops covering the component, everything downstream would
  // silently read an empty string instead of failing.
  if (!body.includes('{label}'))
    throw new Error('TicketRef body not found — the slice bounds have moved');
  return [...body.matchAll(/text-\[([\d.]+)px\]/g)].map((m) => m[1]);
}

beforeEach(() => {
  vi.mocked(useCurrentUser).mockReturnValue({ role: 'ADMIN' } as never);
  for (const q of [useCatalog, useLedger, useTenantSkus]) {
    vi.mocked(q).mockReturnValue({ data: [] } as never);
  }
  for (const m of [
    useAdvanceStage,
    useAssignLineItem,
    useMarkSynced,
    useSyncCheck,
    useUpdateRequest,
    useAddLineItem,
    useRemoveLineItem,
  ]) {
    vi.mocked(m).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  }
});

describe('CH-033 A — the ticket references are readable', () => {
  it('uses the three sizes CH-033 D1 chose', () => {
    // label, number, sub — in source order.
    expect(ticketRefSizes()).toEqual(['12', '12.5', '11.5']);
  });

  /**
   * 🔴 A SEPARATE test, and the separation is the whole point.
   *
   * This started life as two more lines inside the assertion above, which made
   * it **structurally incapable of failing**: once `toEqual` has pinned the
   * three values, checking that those same three are in the scale can only ever
   * pass. It was aimed at nothing — the same shape as the two assertions in W47
   * `F3-6` that pointed at a collaborator the adapter no longer had.
   *
   * Standing on its own it means something: it fails for ANY future value that
   * is not in the design system, which is the case worth guarding. 13px, 10px
   * and 12.8px all look plausible in a diff and NONE of them exist in
   * `typography.css` — that is precisely the eyeballing H6 forbids, and the kind
   * of thing no reviewer catches by reading.
   */
  it('uses only sizes the design system defines', () => {
    const scale = typographyScale();
    // Guard the guard: an empty set would make the loop below vacuous.
    expect(scale.size).toBeGreaterThan(5);

    for (const s of ticketRefSizes()) {
      expect(scale.has(s), `${s}px is not in typography.css`).toBe(true);
    }
  });

  /**
   * ⚠️ The floor, stated separately. `typography.css` says "Never smaller than
   * 10.5px" in prose at the top of the file, and prose does not fail a build.
   */
  it('keeps every size at or above the 10.5px floor', () => {
    const sizes = ticketRefSizes();
    expect(sizes.length).toBe(3);
    for (const px of sizes) {
      expect(Number(px)).toBeGreaterThanOrEqual(10.5);
    }
  });
});

describe('CH-033 D4 — the column count follows the card', () => {
  /**
   * 🔴 A three-column grid with two children is a third of the page left blank,
   * and for OPCO_IT that is EVERY request they open — not an edge case, a role's
   * whole daily view. The card and the track count read the same predicate
   * (`canUseAgent`), so they cannot drift apart.
   */
  it('drops to two columns when AI Assist is not shown', () => {
    vi.mocked(useCurrentUser).mockReturnValue({ role: 'OPCO_IT' } as never);
    const { container } = show();

    expect(
      container.querySelector('[data-testid="ai-assist-card"]'),
    ).toBeNull();
    expect(gridOf(container)!.className).toContain('lg:grid-cols-2');
    expect(gridOf(container)!.className).not.toContain('lg:grid-cols-3');
  });

  it('uses three columns when it is', () => {
    const { container } = show();

    expect(
      container.querySelector('[data-testid="ai-assist-card"]'),
    ).not.toBeNull();
    expect(gridOf(container)!.className).toContain('lg:grid-cols-3');
  });
});

describe('CH-034 — the sync gate lives in the left column', () => {
  /**
   * 🔴 Stated as containment, not as a class name.
   *
   * The gate used to be a direct child of the header Card, spanning its full
   * width, so the nearest ancestor holding BOTH it and the person's name was
   * the Card itself — which also holds the ServiceNow ticket panel. After
   * CH-034 that ancestor is the left column, and the ticket panel is outside
   * it. Asserting `lg:grid-cols`-style classes would only restate the markup;
   * this says where the box actually sits in the tree.
   *
   * ⚠️ The negative half (`not.toContain('Onboarding request')`) is what makes
   * it fail before the change — without it, "some ancestor holds both" is
   * trivially true of the Card, and of `<body>`.
   */
  it('puts the gate under the name, not across the whole card', () => {
    const { container } = show();

    const name = container.querySelector('h1')!;
    const gate = screen.getByText('AD account created');

    // Nearest common ancestor, found by walking up from the name.
    let col: HTMLElement | null = name.parentElement;
    while (col && !col.contains(gate)) col = col.parentElement;

    expect(col).not.toBeNull();
    expect(col!.textContent).toContain('AD account created');
    expect(col!.textContent).not.toContain('Onboarding request');
  });

  /**
   * ⚠️ The gate must not be stretched by its new flex column parent — that is
   * what `self-start` is for, and losing it would silently restore the old
   * full-width row (with `ml-auto` flinging the status back to the far edge).
   * jsdom computes no layout, so this checks the declaration; the GEOMETRY is
   * checked by the render probe (`spec.md` `G2`/`G3`).
   */
  it('does not let the column stretch the gate', () => {
    const { container } = show();

    const gate = screen
      .getByText('AD account created')
      .closest('div.self-start');
    expect(gate).not.toBeNull();
    expect(gate!.className).toContain('max-w-full');
    // The old full-width row had this; keeping it would fight `self-start`.
    expect(gate!.className).not.toContain('mt-[16px]');
    expect(container.querySelector('h1')).not.toBeNull();
  });
});

describe('CH-033 D3 — the remark is not one of the columns', () => {
  /**
   * 🔴 Measured, not guessed: with the remark inside the left column, "Line
   * items" started 139px lower than "Operational history" on any request that
   * had one (render probe, 2026-08-20) — so the two panels people compare were
   * never level. It is also prose, and prose in a ~370px column is worse than
   * prose across the page.
   */
  it('renders the remark outside the panel grid', () => {
    const { container } = show({ rawRequestText: 'Needs E3 plus Power BI' });

    const remark = container.querySelector('blockquote');
    expect(remark).not.toBeNull();
    expect(remark!.textContent).toContain('Needs E3 plus Power BI');
    expect(gridOf(container)!.contains(remark)).toBe(false);
  });

  it('still shows the three panels when there is no remark', () => {
    const { container } = show();

    expect(container.querySelector('blockquote')).toBeNull();
    expect(gridOf(container)!.className).toContain('lg:grid-cols-3');
  });
});
