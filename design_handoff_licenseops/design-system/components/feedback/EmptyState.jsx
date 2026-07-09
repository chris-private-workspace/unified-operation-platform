import React from 'react';

/**
 * EmptyState — centered zero-data / all-clear message for a card or table body.
 * Icon chip (tone-tinted) + title + optional description + optional action.
 */
export function EmptyState({ icon, title, description, action, tone = 'neutral', style = {} }) {
  const fg = { ok: 'var(--ok)', neutral: 'var(--fg-subtle)', info: 'var(--info)', danger: 'var(--danger)' }[tone] || 'var(--fg-subtle)';
  const bg = { ok: 'var(--ok-soft)', neutral: 'var(--hover)', info: 'var(--info-soft)', danger: 'var(--danger-soft)' }[tone] || 'var(--hover)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '40px 24px', ...style }}>
      {icon && (
        <span style={{ width: 40, height: 40, borderRadius: 11, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 340 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{title}</span>
        {description && <span style={{ fontSize: 12, color: 'var(--fg-subtle)', lineHeight: 1.5 }}>{description}</span>}
      </div>
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}
