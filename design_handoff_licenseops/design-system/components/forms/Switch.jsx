import React from 'react';

/** Switch — pill toggle for on/off preferences. */
export function Switch({ checked, onChange, disabled = false }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 22, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: checked ? 'var(--accent)' : 'var(--border-strong)', borderRadius: 20, transition: 'background .15s' }} />
      <span style={{ position: 'absolute', top: 3, left: checked ? 19 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
    </label>
  );
}
