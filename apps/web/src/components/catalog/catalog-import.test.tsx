import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogImportPanel } from './catalog-import';
import { useCatalogImport } from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import type { CatalogImportChange, CatalogImportResult } from '@/lib/api-types';

/**
 * CH-019 / ADR-0023. What is guarded here is the SEQUENCE and the two gates,
 * not the styling: this panel must never be able to write without having shown
 * a dry-run first, must never commit an alias clear the operator has not ticked,
 * and must render a refusal's LIST rather than only its sentence — a 400 that
 * says "two SKUs would share an alias" without naming them leaves the operator
 * with a file they cannot fix.
 */

vi.mock('@/hooks/mutations', () => ({ useCatalogImport: vi.fn() }));

let mutate: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;
let onCommitted: ReturnType<typeof vi.fn>;

const change = (
  over: Partial<CatalogImportChange> = {},
): CatalogImportChange => ({
  skuId: 'guid-1',
  skuPartNumber: 'SPE_E3',
  displayName: 'Microsoft 365 E3',
  alias: { before: null, after: 'E3 Bundle' },
  clearsAlias: false,
  ...over,
});

const result = (
  over: Partial<CatalogImportResult> = {},
): CatalogImportResult => {
  const changes = over.changes ?? [change()];
  return {
    dryRun: true,
    committed: 0,
    summary: {
      rows: changes.length,
      matched: changes.length,
      changes: changes.length,
      aliasClears: changes.filter((c) => c.clearsAlias).length,
    },
    changes,
    skippedSkuIds: [],
    unknownColumns: [],
    ...over,
  };
};

/** Make the next mutate resolve with `res` (or reject with `err`). */
const respondWith = (res: CatalogImportResult) =>
  mutate.mockImplementation((_vars: unknown, opts: any) =>
    opts?.onSuccess?.(res),
  );
const failWith = (err: unknown) =>
  mutate.mockImplementation((_vars: unknown, opts: any) =>
    opts?.onError?.(err),
  );

/**
 * Drive the hidden file input. jsdom's File has no .text(), so stub it — the
 * panel only ever needs the string back.
 */
async function pickFile(csv: string, name = 'sku-catalog.csv') {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([csv], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => csv });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  await screen.findByText(name);
}

const preview = () => fireEvent.click(screen.getByText('Preview import'));

beforeEach(() => {
  vi.clearAllMocks();
  mutate = vi.fn();
  onClose = vi.fn();
  onCommitted = vi.fn();
  vi.mocked(useCatalogImport).mockReturnValue({
    mutate,
    isPending: false,
  } as any);
});

const renderPanel = () =>
  render(<CatalogImportPanel onClose={onClose} onCommitted={onCommitted} />);

describe('catalog import panel (CH-019)', () => {
  it('offers no way to apply before a dry-run has been shown', async () => {
    renderPanel();
    await pickFile('SkuId,Business alias\nguid-1,E3 Bundle');

    expect(screen.queryByText(/^Apply /)).toBeNull();
    expect(screen.getByText('Preview import')).toBeTruthy();
  });

  it('previews with dryRun true, then commits with dryRun false', async () => {
    respondWith(result());
    renderPanel();
    await pickFile('SkuId,Business alias\nguid-1,E3 Bundle');

    preview();
    expect(mutate.mock.calls[0][0]).toMatchObject({ dryRun: true });

    fireEvent.click(screen.getByText('Apply 1 change'));
    expect(mutate.mock.calls[1][0]).toMatchObject({ dryRun: false });
  });

  it('shows the change with its before/after', async () => {
    respondWith(
      result({
        changes: [
          change({
            alias: { before: 'Old', after: 'New' },
            category: { before: null, after: 'Base' },
          }),
        ],
      }),
    );
    renderPanel();
    await pickFile('csv');
    preview();

    expect(screen.getByText('Old')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Base')).toBeTruthy();
    expect(screen.getByText('SPE_E3')).toBeTruthy();
  });

  it('reports a no-op file instead of offering an empty apply', async () => {
    respondWith(result({ changes: [] }));
    renderPanel();
    await pickFile('csv');
    preview();

    expect(
      screen.getByText(/No changes — the catalog already matches this file/),
    ).toBeTruthy();
    expect(
      screen.getByText('Apply 0 changes').closest('button'),
    ).toBeDisabled();
  });

  // ── the clears gate (ADR-0023 D6) ───────────────────────────────────────
  describe('clearing an alias', () => {
    const withClear = () =>
      result({
        changes: [
          change({
            alias: { before: 'E3 Bundle', after: null },
            clearsAlias: true,
          }),
        ],
      });

    it('states the consequence the screen cannot otherwise show', async () => {
      respondWith(withClear());
      renderPanel();
      await pickFile('csv');
      preview();

      expect(screen.getByText(/1 business alias will be cleared/)).toBeTruthy();
      // The ledger consequence, not just the count — this is the whole point.
      expect(
        screen.getByText(/stays in the ledger at its current value/),
      ).toBeTruthy();
    });

    it('cannot be applied until the operator ticks the box', async () => {
      respondWith(withClear());
      renderPanel();
      await pickFile('csv');
      preview();

      const apply = screen.getByText('Apply 1 change').closest('button')!;
      expect(apply).toBeDisabled();

      fireEvent.click(screen.getByRole('checkbox'));
      expect(apply).not.toBeDisabled();
    });

    it('sends confirmClears with the commit once ticked', async () => {
      respondWith(withClear());
      renderPanel();
      await pickFile('csv');
      preview();
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByText('Apply 1 change'));

      expect(mutate.mock.calls[1][0]).toMatchObject({
        dryRun: false,
        confirmClears: true,
      });
    });

    // A confirmation given for one file must not carry over to the next one.
    it('drops the preview and the confirmation when a new file is chosen', async () => {
      respondWith(withClear());
      renderPanel();
      await pickFile('csv', 'first.csv');
      preview();
      fireEvent.click(screen.getByRole('checkbox'));

      await pickFile('other', 'second.csv');

      expect(screen.queryByText(/^Apply /)).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.getByText('Preview import')).toBeTruthy();
    });
  });

  // ── refusals (ADR-0023 D5) ──────────────────────────────────────────────
  it('names the clashing alias and every SKU holding it, not just the message', async () => {
    failWith(
      new ApiError(400, 'Two or more SKUs would share a business alias.', {
        code: 'alias-collision',
        collisions: [
          { alias: 'E3 Bundle', skuPartNumbers: ['SPE_E3', 'ENTERPRISEPACK'] },
        ],
      }),
    );
    renderPanel();
    await pickFile('csv');
    preview();

    await waitFor(() =>
      expect(
        screen.getByText(/Two or more SKUs would share a business alias/),
      ).toBeTruthy(),
    );
    expect(screen.getByText('E3 Bundle')).toBeTruthy();
    expect(screen.getByText('SPE_E3, ENTERPRISEPACK')).toBeTruthy();
  });

  it('lists the offending lines when Base licence cannot be read', async () => {
    failWith(
      new ApiError(400, '"Base licence" must be Yes or No.', {
        code: 'invalid-base-value',
        invalidBaseValues: [{ line: 3, value: 'maybe' }],
      }),
    );
    renderPanel();
    await pickFile('csv');
    preview();

    await waitFor(() =>
      expect(screen.getByText('line 3: "maybe"')).toBeTruthy(),
    );
  });

  it('surfaces skipped SkuIds and ignored columns', async () => {
    respondWith(
      result({
        skippedSkuIds: ['guid-nope'],
        unknownColumns: ['Display name', 'Part number'],
      }),
    );
    renderPanel();
    await pickFile('csv');
    preview();

    expect(screen.getByText(/1 row skipped/)).toBeTruthy();
    expect(screen.getByText('guid-nope')).toBeTruthy();
    expect(screen.getByText('Display name, Part number')).toBeTruthy();
  });

  it('reports the commit to its parent and closes', async () => {
    mutate
      .mockImplementationOnce((_v: unknown, o: any) => o?.onSuccess?.(result()))
      .mockImplementationOnce((_v: unknown, o: any) =>
        o?.onSuccess?.(result({ dryRun: false, committed: 1 })),
      );
    renderPanel();
    await pickFile('csv');
    preview();
    fireEvent.click(screen.getByText('Apply 1 change'));

    expect(onCommitted).toHaveBeenCalledWith('Updated 1 SKU');
    expect(onClose).toHaveBeenCalled();
  });
});
