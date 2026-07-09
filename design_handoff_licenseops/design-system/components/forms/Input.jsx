import React from 'react';

/** Input — single-line text field. Optional leading icon (search) and trailing slot (kbd hint). */
export function Input({ value, onChange, placeholder, type = 'text', icon = null, trailing = null, disabled = false, style = {}, ...rest }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      {icon && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--fg-subtle)', pointerEvents: 'none' }}>
          {icon}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%', height: 34,
          padding: `0 ${trailing ? 34 : 10}px 0 ${icon ? 32 : 11}px`,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: disabled ? 'var(--hover)' : 'var(--card)',
          color: disabled ? 'var(--fg-muted)' : 'var(--fg)',
          fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
          ...style,
        }}
        {...rest}
      />
      {trailing && (
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
          {trailing}
        </span>
      )}
    </div>
  );
}
