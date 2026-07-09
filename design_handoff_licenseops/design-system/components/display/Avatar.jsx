import React from 'react';

/** Avatar — initials disc. `brand` uses the Ricoh-red gradient (signed-in user);
 *  `muted` is a flat neutral disc (list rows). */
export function Avatar({ name = '', size = 30, variant = 'muted', style = {} }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const brand = variant === 'brand';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 600,
      background: brand ? 'linear-gradient(135deg,var(--accent),#8a0018)' : 'var(--hover)',
      color: brand ? '#fff' : 'var(--fg-muted)',
      ...style,
    }}>
      {initials}
    </div>
  );
}
