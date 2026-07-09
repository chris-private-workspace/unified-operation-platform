import React from 'react';

/**
 * Button — primary action control. Ricoh-red fill for the single primary action
 * per view; secondary/ghost for everything else. Heights follow the control scale.
 */
export function Button({
  variant = 'secondary', // 'primary' | 'secondary' | 'ghost' | 'danger'
  size = 'md',           // 'sm' | 'md' | 'lg'
  icon = null,
  disabled = false,
  onClick,
  children,
  style = {},
  ...rest
}) {
  const heights = { sm: 28, md: 34, lg: 36 };
  const pads = { sm: '0 11px', md: '0 14px', lg: '0 16px' };
  const fonts = { sm: 11.5, md: 12.5, lg: 13.5 };
  const h = heights[size] || 34;

  const variants = {
    primary: { background: 'var(--accent)', color: 'var(--accent-fg)', border: '1px solid transparent' },
    secondary: { background: 'var(--card)', color: 'var(--fg)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--fg-muted)', border: '1px solid transparent' },
    danger: { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid transparent' },
  };
  const v = variants[variant] || variants.secondary;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        height: h,
        padding: pads[size] || pads.md,
        borderRadius: size === 'sm' ? 7 : 8,
        fontFamily: 'inherit',
        fontSize: fonts[size] || 12.5,
        fontWeight: variant === 'primary' ? 600 : 500,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        transition: 'filter .12s, background .12s',
        ...v,
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
