import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllocationResetCard } from './allocation-reset';
import { useAllocationReset, useLedgerFullReset } from '@/hooks/mutations';
import { useOpcos } from '@/hooks/queries';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import type {
  AdminOpco,
  AllocationResetResult,
  LedgerFullResetResult,
  Role,
} from '@/lib/api-types';

/**
 * CH-016 + CH-017. What is guarded here is the SEQUENCE, not the styling: this
 * control must never be able to write without having shown a dry-run first, the
 * consequences text must reach the operator verbatim, and the full reset must
 * additionally be impossible to commit without retyping its scope.
 */

vi.mock('@/hooks/queries', () => ({ useOpcos: vi.fn() }));
vi.mock('@/hooks/mutations', () => ({
  useAllocationReset: vi.fn(),
  useLedgerFullReset: vi.fn(),
}));
vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));

const OPCOS: AdminOpco[] = [
  { id: 'rhk', code: 'RHK', displayName: 'RHK Co' },
  { id: 'rth', code: 'RTH', displayName: 'RTH Co' },
] as AdminOpco[];

const WARNING =
  'Until you re-import, every affected OpCo × SKU sits at allocated = 0 and the OpCo budget gate will block assigns for those combinations (an admin can still override per line). assignedQuantity is not touched, and no ledger rows are deleted.';

const RESULT = (
  over: Partial<AllocationResetResult> = {},
): AllocationResetResult => ({
  dryRun: true,
  affected: 2,
  scope: 'all',
  irreversible: 0,
  rows: [
    { opcoCode: 'RHK', skuPartNumber: 'SPE_E3', before: 661, skuActive: true },
    {
      opcoCode: 'RTH',
      skuPartNumber: 'STANDARDPACK',
      before: 80,
      skuActive: true,
    },
  ],
  warning: WARNING,
  ...over,
});

/** One active + one inactive — the §2.5 case live verification turned up. */
const WITH_INACTIVE = (): AllocationResetResult =>
  RESULT({
    irreversible: 1,
    rows: [
      { opcoCode: 'RTW', skuPartNumber: 'SPE_E5', before: 25, skuActive: true },
      {
        opcoCode: 'RTW',
        skuPartNumber: 'VISIO_PLAN1',
        before: 23,
        skuActive: false,
      },
    ],
  });

const FULL_WARNING =
  'Until you re-import, every affected OpCo × SKU sits at allocated = 0 and the OpCo budget gate will block assigns for those combinations (an admin can still override per line). No ledger rows are deleted. 2 cells lose their assigned baseline, and NO import can put it back — the allocation import never writes assignedQuantity. Until it is reloaded (the assigned-baseline script, or a per-row correction), drift reconciliation has no baseline to compare against.';

const FULL_RESULT = (
  over: Partial<LedgerFullResetResult> = {},
): LedgerFullResetResult => ({
  dryRun: true,
  affected: 2,
  scope: 'all',
  allocatedCells: 1,
  assignedCells: 2,
  irreversibleAllocated: 0,
  rows: [
    {
      opcoCode: 'RHK',
      skuPartNumber: 'SPE_E3',
      allocatedBefore: 661,
      assignedBefore: 500,
      skuActive: true,
    },
    {
      opcoCode: 'RTH',
      skuPartNumber: 'STANDARDPACK',
      allocatedBefore: 0,
      assignedBefore: 80,
      skuActive: true,
    },
  ],
  warning: FULL_WARNING,
  ...over,
});

let mutate: ReturnType<typeof vi.fn>;
let fullMutate: ReturnType<typeof vi.fn>;

/** Make the next call resolve with `res`. */
const respondWith = (res: AllocationResetResult) =>
  mutate.mockImplementation((_vars: unknown, opts: any) =>
    opts?.onSuccess?.(res),
  );

const respondFullWith = (res: LedgerFullResetResult) =>
  fullMutate.mockImplementation((_vars: unknown, opts: any) =>
    opts?.onSuccess?.(res),
  );

const clickReset = () =>
  fireEvent.click(screen.getByText(/^Reset allocation…$/));

/** Two selects now — mode first, scope second. */
const modeSelect = () => screen.getAllByRole('combobox')[0];
const scopeSelect = () => screen.getAllByRole('combobox')[1];

const chooseFullMode = () =>
  fireEvent.change(modeSelect(), { target: { value: 'full' } });

const signedInAs = (role: Role) =>
  vi.mocked(useCurrentUser).mockReturnValue({ role } as any);

beforeEach(() => {
  vi.mocked(useOpcos).mockReturnValue({ data: OPCOS } as any);
  signedInAs('ADMIN');
  mutate = vi.fn();
  fullMutate = vi.fn();
  vi.mocked(useAllocationReset).mockReturnValue({
    mutate,
    isPending: false,
  } as any);
  vi.mocked(useLedgerFullReset).mockReturnValue({
    mutate: fullMutate,
    isPending: false,
  } as any);
});

describe('allocation reset card (CH-016)', () => {
  it('is a danger action, not a primary one (H6 — Import owns the primary)', () => {
    render(<AllocationResetCard />);

    const button = screen.getByText(/^Reset allocation…$/);
    expect(button.className).not.toContain('bg-accent');
    expect(button.className).toContain('bg-danger');
  });

  it('states up front that the assigned baseline is untouched', () => {
    render(<AllocationResetCard />);

    // The first question anyone asks on seeing a Reset next to a ledger — it
    // must be answered before the click, not inside the modal.
    expect(
      screen.getByText(/is never touched and no ledger rows are deleted/),
    ).toBeTruthy();
  });

  describe('the sequence: dry-run always comes first', () => {
    it('the first click asks for a preview, never a write', () => {
      respondWith(RESULT());
      render(<AllocationResetCard />);

      clickReset();

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate.mock.calls[0][0]).toEqual({
        dryRun: true,
        opcoCode: undefined,
      });
    });

    it('shows the preview in a dialog, with the cells it would zero', () => {
      respondWith(RESULT());
      render(<AllocationResetCard />);

      clickReset();

      expect(screen.getByText('Reset allocation to zero?')).toBeTruthy();
      expect(screen.getByText('SPE_E3')).toBeTruthy();
      expect(screen.getByText('661')).toBeTruthy();
    });

    it('renders the server warning verbatim rather than paraphrasing it', () => {
      respondWith(RESULT());
      render(<AllocationResetCard />);

      clickReset();

      expect(screen.getByText(WARNING)).toBeTruthy();
    });

    it('only the dialog confirm sends dryRun: false', () => {
      respondWith(RESULT());
      render(<AllocationResetCard />);
      clickReset();

      respondWith(RESULT({ dryRun: false }));
      fireEvent.click(screen.getByText('Reset 2 cells'));

      expect(mutate).toHaveBeenCalledTimes(2);
      expect(mutate.mock.calls[1][0]).toEqual({
        dryRun: false,
        opcoCode: undefined,
      });
    });

    it('cancelling writes nothing', () => {
      respondWith(RESULT());
      render(<AllocationResetCard />);
      clickReset();

      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByText('Reset allocation to zero?')).toBeNull();
      expect(mutate).toHaveBeenCalledTimes(1); // the preview, and only that
    });
  });

  /**
   * §2.5 — the point is that the operator learns WHICH cells are one-way
   * BEFORE pressing, not after discovering the re-import did not bring them
   * back. Live verification is exactly how this was found.
   */
  describe('inactive SKUs are flagged before the click, not after', () => {
    it('marks the offending row and counts it above the table', () => {
      respondWith(WITH_INACTIVE());
      render(<AllocationResetCard />);

      clickReset();

      // Twice on purpose: once as a per-row mark, once inside the sentence
      // above the table that explains what the mark means.
      expect(screen.getAllByText('inactive')).toHaveLength(2);
      expect(screen.getByText(/cannot be undone by re-importing/)).toBeTruthy();
    });

    it('says nothing about it when every SKU in scope is active', () => {
      respondWith(RESULT()); // irreversible: 0
      render(<AllocationResetCard />);

      clickReset();

      expect(screen.queryAllByText('inactive')).toHaveLength(0);
      expect(screen.queryByText(/cannot be undone/)).toBeNull();
    });
  });

  it('passes the chosen OpCo through as scope', () => {
    respondWith(RESULT({ scope: 'RHK' }));
    render(<AllocationResetCard />);

    fireEvent.change(scopeSelect(), { target: { value: 'RHK' } });
    clickReset();

    expect(mutate.mock.calls[0][0]).toEqual({
      dryRun: true,
      opcoCode: 'RHK',
    });
  });

  it('says so and opens no dialog when there is nothing to reset', () => {
    respondWith(RESULT({ affected: 0, rows: [] }));
    render(<AllocationResetCard />);

    clickReset();

    expect(screen.queryByText('Reset allocation to zero?')).toBeNull();
    expect(screen.getByText(/already 0/)).toBeTruthy();
  });

  it('after a commit, points at the next step instead of stopping', () => {
    respondWith(RESULT());
    render(<AllocationResetCard />);
    clickReset();

    respondWith(RESULT({ dryRun: false, affected: 2 }));
    fireEvent.click(screen.getByText('Reset 2 cells'));

    // Leaving an operator at allocated = 0 with no next step is how the
    // mid-state (spec §2.4) turns into "why can nobody assign".
    expect(screen.getByText(/import the corrected CSV above/)).toBeTruthy();
    expect(screen.getByText(WARNING)).toBeTruthy();
  });
});

/**
 * CH-017 / ADR-0022. The allocation reset above is recoverable by re-importing;
 * this one is not, and every test here exists to make that difference visible
 * BEFORE the commit rather than discoverable after it.
 */
describe('full reset mode (CH-017)', () => {
  it('defaults to allocation-only — the recoverable mode is never the one already selected', () => {
    render(<AllocationResetCard />);

    expect((modeSelect() as HTMLSelectElement).value).toBe('allocation');
    expect(screen.getByText(/^Reset allocation…$/)).toBeTruthy();
  });

  it('offers the full reset to an ADMIN', () => {
    render(<AllocationResetCard />);

    const option = screen.getByRole('option', {
      name: /Allocation \+ assigned/,
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(false);
  });

  /**
   * The backend 403 is the real gate (ADR-0022 D3). This only avoids offering a
   * control that would refuse them — REGIONAL may reset allocations, not the
   * assigned baseline.
   */
  it('disables it for REGIONAL, who may still use allocation-only', () => {
    signedInAs('REGIONAL');
    render(<AllocationResetCard />);

    const option = screen.getByRole('option', {
      name: /Allocation \+ assigned/,
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain('admin only');
  });

  it('flips the reassurance sentence instead of leaving it quietly wrong', () => {
    render(<AllocationResetCard />);
    expect(
      screen.getByText(/is never touched and no ledger rows are deleted/),
    ).toBeTruthy();

    chooseFullMode();

    expect(
      screen.queryByText(/is never touched and no ledger rows are deleted/),
    ).toBeNull();
    expect(screen.getByText(/no import can restore it/)).toBeTruthy();
  });

  it('routes to the full-reset endpoint, not the allocation one', () => {
    respondFullWith(FULL_RESULT());
    render(<AllocationResetCard />);
    chooseFullMode();

    fireEvent.click(screen.getByText(/^Full reset…$/));

    expect(fullMutate).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(fullMutate.mock.calls[0][0]).toEqual({
      dryRun: true,
      opcoCode: undefined,
    });
  });

  it('shows both before-values, so the assigned column is not a surprise', () => {
    respondFullWith(FULL_RESULT());
    render(<AllocationResetCard />);
    chooseFullMode();
    fireEvent.click(screen.getByText(/^Full reset…$/));

    expect(
      screen.getByText('Reset allocation AND assigned to zero?'),
    ).toBeTruthy();
    expect(screen.getByText('661')).toBeTruthy(); // allocated
    expect(screen.getByText('500')).toBeTruthy(); // assigned
    expect(screen.getByText(/which re-importing cannot restore/)).toBeTruthy();
  });

  describe('the typed confirmation (ADR-0022 D6)', () => {
    const openFullPreview = () => {
      respondFullWith(FULL_RESULT());
      render(<AllocationResetCard />);
      chooseFullMode();
      fireEvent.click(screen.getByText(/^Full reset…$/));
    };

    it('blocks the commit until the scope is retyped', () => {
      openFullPreview();

      const commit = screen
        .getByText('Reset 2 cells')
        .closest('button') as HTMLButtonElement;
      expect(commit.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText('Confirm reset scope'), {
        target: { value: 'ALL' },
      });

      expect(commit.disabled).toBe(false);
    });

    it('rejects a near-miss — the phrase is exact, not fuzzy', () => {
      openFullPreview();

      fireEvent.change(screen.getByLabelText('Confirm reset scope'), {
        target: { value: 'all' },
      });

      expect(
        (
          screen
            .getByText('Reset 2 cells')
            .closest('button') as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it('sends the confirmation with the commit', () => {
      openFullPreview();
      fireEvent.change(screen.getByLabelText('Confirm reset scope'), {
        target: { value: 'ALL' },
      });

      respondFullWith(FULL_RESULT({ dryRun: false }));
      fireEvent.click(screen.getByText('Reset 2 cells'));

      expect(fullMutate.mock.calls[1][0]).toEqual({
        dryRun: false,
        opcoCode: undefined,
        confirm: 'ALL',
      });
    });

    /** Scoped resets must be confirmed with the OpCo code, never the habitual ALL. */
    it('asks for the OpCo code when the reset is scoped', () => {
      respondFullWith(FULL_RESULT({ scope: 'RHK' }));
      render(<AllocationResetCard />);
      chooseFullMode();
      fireEvent.change(scopeSelect(), { target: { value: 'RHK' } });
      fireEvent.click(screen.getByText(/^Full reset…$/));

      expect(
        (screen.getByLabelText('Confirm reset scope') as HTMLInputElement)
          .placeholder,
      ).toBe('RHK');

      fireEvent.change(screen.getByLabelText('Confirm reset scope'), {
        target: { value: 'ALL' },
      });
      expect(
        (
          screen
            .getByText('Reset 2 cells')
            .closest('button') as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it('never asks for it in allocation-only mode', () => {
      respondWith(RESULT());
      render(<AllocationResetCard />);
      clickReset();

      expect(screen.queryByLabelText('Confirm reset scope')).toBeNull();
      expect(
        (
          screen
            .getByText('Reset 2 cells')
            .closest('button') as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });
  });

  it('renders the server warning verbatim, same as allocation-only', () => {
    respondFullWith(FULL_RESULT());
    render(<AllocationResetCard />);
    chooseFullMode();
    fireEvent.click(screen.getByText(/^Full reset…$/));

    expect(screen.getByText(FULL_WARNING)).toBeTruthy();
  });
});
