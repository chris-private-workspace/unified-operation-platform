import React from 'react';

export interface BadgeProps {
  /** Semantic tone → soft bg + matching text. */
  tone?: 'ok' | 'warn' | 'info' | 'danger' | 'neutral' | 'purple';
  /** Show a leading status dot. */
  dot?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Status pill — the universal state marker. Map lifecycle stages to tones:
 * Ready→ok, Quoting/Awaiting vendor→warn, Requested→info, Blocked→danger,
 * Assigned→neutral. `purple` is reserved for AI-assist labels.
 */
export function Badge(props: BadgeProps): JSX.Element;
