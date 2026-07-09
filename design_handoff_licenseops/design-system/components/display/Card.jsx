import React from 'react';

/** Card — the console's surface primitive: bordered, 12px radius, resting shadow.
 *  Optional header (title + action) with a hairline divider above the body. */
export function Card({ title, subtitle, action, children, padded = true, style = {}, bodyStyle = {} }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden', ...style }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            {title && <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{title}</h2>}
            {subtitle && <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{subtitle}</span>}
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: padded ? 16 : 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}
