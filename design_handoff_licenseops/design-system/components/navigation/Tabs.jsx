import React from 'react';

/**
 * Tabs — underline tab bar for in-page section switching (e.g. Overview
 * Summary/Analytics, request detail sections). Active tab carries the accent
 * underline; an optional count sits after the label.
 */
export function Tabs({ tabs = [], value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
      {tabs.map((t) => {
        const val = typeof t === 'string' ? t : t.value;
        const label = typeof t === 'string' ? t : t.label;
        const count = typeof t === 'object' ? t.count : undefined;
        const active = val === value;
        return (
          <button
            key={val}
            onClick={() => onChange && onChange(val)}
            style={{
              position: 'relative',
              padding: '9px 12px', border: 'none', background: 'transparent',
              fontFamily: 'inherit', fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--fg)' : 'var(--fg-muted)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}
          >
            {label}
            {count != null && (
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: active ? 'var(--accent)' : 'var(--fg-subtle)', background: active ? 'var(--accent-soft)' : 'var(--hover)', borderRadius: 20, padding: '0 6px' }}>{count}</span>
            )}
            <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2, borderRadius: 2, background: active ? 'var(--accent)' : 'transparent' }} />
          </button>
        );
      })}
    </div>
  );
}
