import React from 'react';

/** Checkbox — accent-colored native checkbox with an optional label. */
export function Checkbox({ checked, onChange, label = null, disabled = false, style = {} }) {
  const box = (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    />
  );
  if (!label) return box;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--fg)', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {box}{label}
    </label>
  );
}
