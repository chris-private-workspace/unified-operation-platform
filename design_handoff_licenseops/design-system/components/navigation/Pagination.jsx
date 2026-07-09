import React from 'react';

/**
 * Pagination — table footer pager. Shows a range summary and prev/next plus a
 * few numbered pages. Matches the console's compact bordered-control look.
 */
export function Pagination({ page = 1, pageCount = 1, total, pageSize, onChange }) {
  const go = (p) => { if (p >= 1 && p <= pageCount && p !== page && onChange) onChange(p); };
  // window of up to 5 page numbers centered on current
  const nums = [];
  let start = Math.max(1, page - 2);
  let end = Math.min(pageCount, start + 4);
  start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) nums.push(i);

  const from = total != null && pageSize != null ? (page - 1) * pageSize + 1 : null;
  const to = total != null && pageSize != null ? Math.min(total, page * pageSize) : null;

  const btn = (content, opts = {}) => {
    const { active = false, disabled = false, onClick } = opts;
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          minWidth: 28, height: 28, padding: '0 8px', borderRadius: 7,
          border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
          background: active ? 'var(--accent)' : 'var(--card)',
          color: active ? 'var(--accent-fg)' : 'var(--fg-muted)',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          fontWeight: active ? 600 : 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {content}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
      {from != null
        ? <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{from}–{to} of {total}</span>
        : <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Page {page} of {pageCount}</span>}
      <div style={{ display: 'flex', gap: 5 }}>
        {btn('‹', { disabled: page <= 1, onClick: () => go(page - 1) })}
        {nums.map((n) => btn(n, { active: n === page, onClick: () => go(n) }))}
        {btn('›', { disabled: page >= pageCount, onClick: () => go(page + 1) })}
      </div>
    </div>
  );
}
