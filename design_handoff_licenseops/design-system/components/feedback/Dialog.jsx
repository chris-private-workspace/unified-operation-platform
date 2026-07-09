import React from 'react';

/** Dialog — centered modal over a scrim. Header (title + close), body, optional footer. */
export function Dialog({ open, title, onClose, footer = null, width = 420, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: '92vw', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-overlay)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 9 }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
