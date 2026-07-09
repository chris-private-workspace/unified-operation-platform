import React from 'react';

/** IconButton — square, bordered icon-only control (theme toggle, top-bar tools). */
export function IconButton({ size = 34, active = false, disabled = false, onClick, title, children, style = {} }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      style={{
        width: size, height: size,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: active ? 'var(--active)' : 'var(--card)',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
