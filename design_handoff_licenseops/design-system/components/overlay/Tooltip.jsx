import React from 'react';

/**
 * Tooltip — hover label on a small dark chip. Wraps any trigger; shows on
 * mouse-enter after a short delay. Placement top (default) or bottom.
 */
export function Tooltip({ label, placement = 'top', children }) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef(null);
  const show = () => { timer.current = setTimeout(() => setOpen(true), 260); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const pos = placement === 'bottom'
    ? { top: 'calc(100% + 6px)' }
    : { bottom: 'calc(100% + 6px)' };
  return (
    <span
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', ...pos,
            zIndex: 120, whiteSpace: 'nowrap', pointerEvents: 'none',
            background: '#131317', color: '#fff',
            fontSize: 11.5, fontWeight: 500, lineHeight: 1.3,
            padding: '5px 9px', borderRadius: 7,
            boxShadow: 'var(--shadow-toast)',
            border: '1px solid rgba(255,255,255,.08)',
            animation: 'fadeIn .12s ease',
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
