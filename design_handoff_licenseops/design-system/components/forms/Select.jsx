import React from 'react';

/** Select — native dropdown styled to match Input. */
export function Select({ value, onChange, children, disabled = false, style = {}, ...rest }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      style={{
        height: 34, padding: '0 10px', borderRadius: 8,
        border: '1px solid var(--border-strong)',
        background: 'var(--panel)', color: 'var(--fg)',
        fontSize: 13, fontFamily: 'inherit', outline: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
}
