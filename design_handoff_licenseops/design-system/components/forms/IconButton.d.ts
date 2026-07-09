import React from 'react';

export interface IconButtonProps {
  /** Square edge length in px (default 34). */
  size?: number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Square bordered icon-only button — theme toggle, top-bar utilities. */
export function IconButton(props: IconButtonProps): JSX.Element;
