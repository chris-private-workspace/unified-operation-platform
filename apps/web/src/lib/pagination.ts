/**
 * Pager arithmetic — CH-024 B.
 *
 * Kept out of the component for the same reason as `lib/ledger.ts`: the cases
 * that actually matter here are 229-page ledgers and the two ends of the range,
 * and a component test cannot reach them without mounting 229 buttons. The
 * component renders what this returns and nothing else.
 */

/** How many numbered pages the pager shows at once (handoff Pagination.jsx). */
export const PAGE_WINDOW = 5;

/**
 * The window of page numbers to render, 1-based, centred on `page` where it can
 * be and clamped at either end where it cannot. Always at most `size` entries,
 * always contiguous, and always containing `page` — those three are what the
 * unit tests hold, because a window that drops the current page is the failure
 * mode that looks fine until you are on page 229.
 *
 * A pageCount below 1 yields an empty window rather than [1]: "no pages" and
 * "one page" are different states, and the caller decides how to show each.
 */
export function pageWindow(
  page: number,
  pageCount: number,
  size = PAGE_WINDOW,
): number[] {
  if (pageCount < 1 || size < 1) return [];
  const span = Math.min(size, pageCount);
  // Start centred, then pull back inside both ends. Order matters: clamping to
  // the right edge first can push `start` below 1 on short ranges, so the
  // left clamp has to be last.
  let start = page - Math.floor((span - 1) / 2);
  start = Math.min(start, pageCount - span + 1);
  start = Math.max(1, start);
  return Array.from({ length: span }, (_, i) => start + i);
}

/**
 * The "1–10 of 2283" summary. `shown` is the number of rows actually rendered
 * on this page rather than a recomputed `min(page * size, total)` — a filtered
 * last page is exactly where those two disagree, and the row count on screen is
 * the one that cannot be wrong.
 */
export function pageRangeLabel(
  page: number,
  pageSize: number,
  shown: number,
  total: number,
): string {
  if (total === 0 || shown === 0) return `0 of ${total}`;
  const from = (page - 1) * pageSize + 1;
  return `${from}–${from + shown - 1} of ${total}`;
}
