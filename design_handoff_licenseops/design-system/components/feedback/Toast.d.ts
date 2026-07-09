import React from 'react';

export interface ToastProps {
  /** Message text; falsy renders nothing. */
  message?: string | null;
  tone?: 'ok' | 'info';
}

/**
 * Bottom-center transient confirmation — dark chip regardless of theme.
 * Fire after an operator action (assigned, resolved, saved, sync queued).
 * Host owns the ~2.6s auto-dismiss timer.
 */
export function Toast(props: ToastProps): JSX.Element;
