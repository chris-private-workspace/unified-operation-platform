import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional CTA (e.g. a Button). */
  action?: React.ReactNode;
  /** Tints the icon chip — `ok` for all-clear, `neutral` for no-data. */
  tone?: 'ok' | 'neutral' | 'info' | 'danger';
  style?: React.CSSProperties;
}

/**
 * Centered zero-data / all-clear state for a card or table body. Use `ok` tone for
 * resolved states (no open drift alerts, empty my-queue), `neutral` for no-results.
 */
export function EmptyState(props: EmptyStateProps): JSX.Element;
