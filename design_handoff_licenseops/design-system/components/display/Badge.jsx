import React from 'react';

/**
 * Badge — status pill. Soft-tinted background + matching text, optional leading dot.
 * The console's universal state marker (request status, line stage, drift delta).
 */
export function Badge({ tone = 'neutral', dot = false, children, style = {} }) {
  const fg = { ok: 'var(--ok)', warn: 'var(--warn)', info: 'var(--info)', danger: 'var(--danger)', neutral: 'var(--neutral)', purple: 'var(--purple)' }[tone] || 'var(--neutral)';
  const bg = { ok: 'var(--ok-soft)', warn: 'var(--warn-soft)', info: 'var(--info-soft)', danger: 'var(--danger-soft)', neutral: 'var(--neutral-soft)', purple: 'var(--purple-soft)' }[tone] || 'var(--neutral-soft)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, lineHeight: '18px', whiteSpace: 'nowrap', background: bg, color: fg, ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg, flexShrink: 0 }} />}
      {children}
    </span>
  );
}
