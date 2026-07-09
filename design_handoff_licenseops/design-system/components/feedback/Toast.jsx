import React from 'react';

/** Toast — bottom-center transient confirmation. Dark chip, check/info glyph + message. */
export function Toast({ message, tone = 'ok' }) {
  if (!message) return null;
  const dotBg = tone === 'info' ? 'var(--info)' : 'var(--ok)';
  return (
    <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 100, animation: 'toastIn .22s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, background: '#131317', color: '#fff', boxShadow: 'var(--shadow-toast)', border: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: dotBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{message}</span>
      </div>
    </div>
  );
}
