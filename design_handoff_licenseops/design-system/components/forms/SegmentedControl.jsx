import React from 'react';

/**
 * SegmentedControl — 2–3 mutually exclusive options in a bordered track.
 * Used for theme (Light/Dark), role (Regional/OpCo), assets mode (Single/Compare).
 */
export function SegmentedControl({ options, value, onChange, size = 'md' }) {
  const h = size === 'sm' ? 26 : 30;
  const fs = size === 'sm' ? 11 : 12;
  return (
    <div style={{ display: 'inline-flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = val === value;
        return (
          <button
            key={val}
            onClick={() => onChange && onChange(val)}
            style={{
              height: h, padding: '0 13px', borderRadius: 6, border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-fg)' : 'var(--fg-muted)',
              fontSize: fs, fontWeight: active ? 600 : 500,
              fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
