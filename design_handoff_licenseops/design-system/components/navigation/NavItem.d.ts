import React from 'react';

export interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  /** Trailing count badge (open requests, open alerts). */
  count?: number | string | null;
  countTone?: 'neutral' | 'danger';
  /** Icon-only rail mode. */
  collapsed?: boolean;
  /** Greyed-out future item; pair with `soon`. */
  disabled?: boolean;
  soon?: boolean;
  onClick?: () => void;
}

/** Left-sidebar navigation row — active fill, optional count badge, collapsed rail mode. */
export function NavItem(props: NavItemProps): JSX.Element;
