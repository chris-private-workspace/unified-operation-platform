import React from 'react';

export interface ButtonProps {
  /** Visual weight. `primary` = Ricoh-red fill; use at most one per view. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon node (e.g. an inline <svg>). */
  icon?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * The console's action button. Exactly one `primary` (accent) action per screen;
 * everything else is `secondary` (bordered) or `ghost`. Never invent new fills.
 */
export function Button(props: ButtonProps): JSX.Element;
