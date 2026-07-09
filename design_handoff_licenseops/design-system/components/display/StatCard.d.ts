import React from 'react';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Icon glyph shown in the tinted chip. */
  icon?: React.ReactNode;
  /** Tint for the icon chip. */
  tone?: 'ok' | 'warn' | 'info' | 'danger' | 'neutral';
  /** Optional delta/headroom pill (e.g. "+42 free"). */
  delta?: React.ReactNode;
  sub?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Overview KPI tile — label, tinted icon chip, big value, optional delta + sub-line. */
export function StatCard(props: StatCardProps): JSX.Element;
