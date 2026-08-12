import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { pageRangeLabel, pageWindow } from '@/lib/pagination';
import { cn } from '@/lib/utils';

/**
 * Pagination — table footer pager (handoff `navigation/Pagination.jsx`,
 * design-system.md §navigation). Sits on the bottom border of an unpadded Card
 * that holds a table: range summary on the left, controls on the right. Active
 * page fills accent; every number is mono (DS-5).
 *
 * Rebuilt against the handoff spec rather than ported (§7) — the handoff file
 * is an inline-styled reference, so the values here come from Tailwind tokens.
 *
 * Two deliberate departures from that reference, both noted in
 * design-system.md:
 *
 *   1. `«` / `»` first & last (CH-024 B, Chris 2026-08-12). The handoff pager
 *      has prev/next only, which is fine at 8 pages and unusable at 229 — the
 *      real ledger is 2283 rows.
 *   2. lucide chevrons instead of the reference's `‹` / `›` text glyphs, to
 *      keep DS-6 (icons are lucide stroke, full stop) true of this component
 *      too. Same visual weight, one less font-dependent glyph.
 *
 * `page` is 1-BASED, like the handoff prop contract and like the numbers on
 * screen. Callers holding a 0-based index convert at the boundary — doing it
 * here would mean two conventions inside one component.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  shown,
  onChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  /** Rows across every page (after filtering). */
  total: number;
  /** Rows rendered on THIS page — drives the right-hand end of the summary. */
  shown: number;
  onChange: (page: number) => void;
}) {
  const window = pageWindow(page, pageCount);
  const go = (p: number) => {
    if (p >= 1 && p <= pageCount && p !== page) onChange(p);
  };

  return (
    <div className="flex items-center justify-between gap-[12px] border-t border-border px-[16px] py-[11px]">
      <span className="text-[11.5px] text-fg-subtle">
        {pageRangeLabel(page, pageSize, shown, total)}
      </span>
      {/* One page needs no controls — the summary above already says so. */}
      {pageCount > 1 && (
        <div className="flex items-center gap-[5px]">
          <PagerButton
            label="First page"
            disabled={page <= 1}
            onClick={() => go(1)}
          >
            <ChevronsLeft size={14} strokeWidth={2} />
          </PagerButton>
          <PagerButton
            label="Previous page"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </PagerButton>
          {window.map((n) => (
            <PagerButton
              key={n}
              label={`Page ${n}`}
              active={n === page}
              onClick={() => go(n)}
            >
              {n}
            </PagerButton>
          ))}
          <PagerButton
            label="Next page"
            disabled={page >= pageCount}
            onClick={() => go(page + 1)}
          >
            <ChevronRight size={14} strokeWidth={2} />
          </PagerButton>
          <PagerButton
            label="Last page"
            disabled={page >= pageCount}
            onClick={() => go(pageCount)}
          >
            <ChevronsRight size={14} strokeWidth={2} />
          </PagerButton>
        </div>
      )}
    </div>
  );
}

function PagerButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-md px-[8px] font-mono text-[12px] transition-colors',
        active
          ? 'bg-accent font-semibold text-accent-fg'
          : 'border border-border bg-card font-medium text-fg-muted hover:bg-hover hover:text-fg',
        disabled &&
          'cursor-not-allowed opacity-45 hover:bg-card hover:text-fg-muted',
      )}
    >
      {children}
    </button>
  );
}
