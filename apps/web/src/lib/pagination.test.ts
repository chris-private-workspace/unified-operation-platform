import { describe, expect, it } from 'vitest';
import { PAGE_WINDOW, pageRangeLabel, pageWindow } from './pagination';

describe('pageWindow', () => {
  it('shows every page when there are fewer than a full window', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('centres on the current page once there are more pages than the window', () => {
    expect(pageWindow(4, 10)).toEqual([2, 3, 4, 5, 6]);
    expect(pageWindow(115, 229)).toEqual([113, 114, 115, 116, 117]);
  });

  it('clamps at the left edge instead of running below page 1', () => {
    expect(pageWindow(1, 229)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(2, 229)).toEqual([1, 2, 3, 4, 5]);
  });

  it('clamps at the right edge instead of running past the last page', () => {
    expect(pageWindow(229, 229)).toEqual([225, 226, 227, 228, 229]);
    expect(pageWindow(228, 229)).toEqual([225, 226, 227, 228, 229]);
  });

  it('the 6-page case — the first count that cannot show everything', () => {
    expect(pageWindow(1, 6)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 6)).toEqual([2, 3, 4, 5, 6]);
  });

  // The three invariants the component depends on, held across an entire real
  // ledger rather than at hand-picked points. A window that silently drops the
  // current page renders a pager with nothing highlighted — which reads as
  // "page 1" and is exactly the bug that hand-picked cases walk past.
  it('across all 229 pages: at most 5, contiguous, and always contains the current page', () => {
    for (let page = 1; page <= 229; page++) {
      const w = pageWindow(page, 229);
      expect(w.length).toBe(PAGE_WINDOW);
      expect(w).toContain(page);
      expect(w[w.length - 1] - w[0]).toBe(w.length - 1);
      expect(w[0]).toBeGreaterThanOrEqual(1);
      expect(w[w.length - 1]).toBeLessThanOrEqual(229);
    }
  });

  it('no pages → empty window (not a phantom page 1)', () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });
});

describe('pageRangeLabel', () => {
  it('first page of a long list', () => {
    expect(pageRangeLabel(1, 10, 10, 2283)).toBe('1–10 of 2283');
  });

  it('a middle page counts from the right offset', () => {
    expect(pageRangeLabel(3, 10, 10, 2283)).toBe('21–30 of 2283');
  });

  // A short last page is where a recomputed `page * pageSize` would overshoot;
  // the label follows the rows actually rendered.
  it('a short last page ends on the rows really shown', () => {
    expect(pageRangeLabel(229, 10, 3, 2283)).toBe('2281–2283 of 2283');
  });

  it('nothing to show', () => {
    expect(pageRangeLabel(1, 10, 0, 0)).toBe('0 of 0');
  });
});
