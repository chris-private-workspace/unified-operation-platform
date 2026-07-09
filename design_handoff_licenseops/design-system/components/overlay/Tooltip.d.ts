import React from 'react';

export interface TooltipProps {
  /** Short label shown on the dark chip. */
  label: React.ReactNode;
  placement?: 'top' | 'bottom';
  /** The trigger element. */
  children: React.ReactNode;
}

/**
 * Hover tooltip — dark chip, ~260ms delay. For icon-button affordances and
 * truncated/compact values (e.g. a Compare-matrix cell's allocated/assigned detail).
 */
export function Tooltip(props: TooltipProps): JSX.Element;
