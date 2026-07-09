import React from 'react';

/** NavItem — sidebar row. Icon + label, active state fills the row; supports a
 *  trailing count/alert badge and a collapsed (icon-only) mode. */
export function NavItem({ icon, label, active = false, count = null, countTone = 'neutral', collapsed = false, disabled = false, soon = false, onClick }) {
  const badgeColors = {
    neutral: { c: 'var(--fg-subtle)', b: 'var(--hover)' },
    danger: { c: 'var(--danger)', b: 'var(--danger-soft)' },
  }[countTone] || { c: 'var(--fg-subtle)', b: 'var(--hover)' };
  return (
    <a
      onClick={disabled ? undefined : onClick}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '8px' : '8px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8, fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: disabled ? 'var(--fg-subtle)' : active ? 'var(--fg)' : 'var(--fg-muted)',
        background: active ? 'var(--active)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        textDecoration: 'none', position: 'relative',
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && soon && (
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--fg-subtle)', border: '1px solid var(--border)', borderRadius: 20, padding: '0 6px', textTransform: 'uppercase', letterSpacing: '.03em' }}>Soon</span>
      )}
      {!collapsed && count != null && (
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: badgeColors.c, background: badgeColors.b, borderRadius: 20, padding: '0 6px' }}>{count}</span>
      )}
    </a>
  );
}
