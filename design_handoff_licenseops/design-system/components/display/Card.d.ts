import React from 'react';

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned header action (link or button). */
  action?: React.ReactNode;
  /** Apply default 16px body padding (turn off for edge-to-edge tables). */
  padded?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

/** The surface primitive — bordered, 12px radius, resting shadow, optional header. */
export function Card(props: CardProps): JSX.Element;
